import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import dotenv from "dotenv";
import {
  confirmAction,
  getCliArgs,
  getFlagValue,
  hasForceYes,
  promptInput,
  serverDir,
  dataDir,
} from "./_cli.js";
import { createPostgresMaintenance } from "../lib/postgresMaintenance.js";
import { readDbConfig } from "../settings/env.js";
import { detectRunningServer, openDatabase } from "./_db-admin.js";
import { syncSecretsFromDatabase } from "../lib/secrets.js";

const projectRootDir = path.resolve(serverDir, "..");
dotenv.config({ path: path.join(projectRootDir, ".env"), quiet: true });
dotenv.config({ path: path.join(serverDir, ".env"), override: true, quiet: true });

const dbPath = path.join(dataDir, "songbird.db");
const backupDir = path.join(dataDir, "backups");
const serviceName = process.env.SONGBIRD_SERVICE_NAME || "songbird.service";
const serviceUser = process.env.SONGBIRD_SERVICE_USER || "songbird";
const serviceGroup = process.env.SONGBIRD_SERVICE_GROUP || serviceUser;

function listDbBackups(extension) {
  const dirs = [backupDir];
  if (typeof process.getuid === "function" && process.getuid() === 0 && fs.existsSync("/root")) {
    dirs.push("/root");
  }
  const files = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension))
        .filter((entry) => dir !== "/root" || entry.name.startsWith("songbird-backup-"))
        .map((entry) => path.join(dir, entry.name));
      files.push(...entries);
    } catch (_) {}
  }
  return files.sort((a, b) => {
    try {
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
    } catch (_) {
      return 0;
    }
  });
}

function resolveDbPath(value, extension) {
  const input = String(value || "").trim();
  if (!input) return { resolved: null, error: null };

  const expandedInput = input.startsWith("~/")
    ? path.join(os.homedir(), input.slice(2))
    : input;

  const candidates = [
    path.resolve(expandedInput),
    process.env.INIT_CWD ? path.resolve(process.env.INIT_CWD, expandedInput) : null,
    path.resolve(projectRootDir, expandedInput),
    path.resolve(backupDir, expandedInput),
  ].filter(Boolean);

  let permissionError = null;

  for (const candidate of candidates) {
    if (path.extname(candidate).toLowerCase() !== extension) continue;

    try {
      const stats = fs.statSync(candidate);
      if (stats.isFile()) {
        fs.accessSync(candidate, fs.constants.R_OK);
        return { resolved: candidate, error: null };
      }
    } catch (err) {
      if (err.code === "EACCES" || err.code === "EPERM") {
        permissionError = `Permission denied accessing backup file: ${candidate}`;
      }
    }
  }

  return { resolved: null, error: permissionError };
}

async function resolveBackupPath(args, extension) {
  const fileFlag = getFlagValue(args, "--file");
  if (fileFlag) {
    const { resolved, error } = resolveDbPath(fileFlag, extension);
    if (error) {
      console.error(error);
      process.exit(1);
    }
    if (!resolved) {
      console.error(`Backup file not found or is not a ${extension} file: ${String(fileFlag).trim()}`);
      process.exit(1);
    }
    return resolved;
  }

  const detected = listDbBackups(extension);
  if (detected.length) {
    const useDetected = await confirmAction({
      prompt: `Use most recent backup "${detected[0]}"?`,
      force: false,
    });
    if (useDetected) return detected[0];
  }

  if (!process.stdin.isTTY) {
    console.error(`No backup ${extension} was selected. Provide --file or run interactively. Checked ${backupDir}.`);
    process.exit(1);
  }

  while (true) {
    const answer = await promptInput({ prompt: `Enter the full path to the backup ${extension} file: `, required: true });
    const { resolved, error } = resolveDbPath(answer, extension);
    if (error) {
      console.error(error);
      continue;
    }
    if (resolved) return resolved;
    console.log(`Backup file must be an existing ${extension} file.`);
  }
}

function applyOwnership() {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) return;
  try {
    execFileSync("chown", [`${serviceUser}:${serviceGroup}`, dbPath], { stdio: "pipe" });
  } catch (error) {
    console.warn(`Unable to apply ownership: ${error?.stderr?.toString?.() || error?.message || error}`);
  }
}

function restartService() {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    console.warn(`Skipping ${serviceName} restart because db:restore is not running as root.`);
    return;
  }
  try {
    execFileSync("systemctl", ["restart", serviceName], { stdio: "pipe" });
    console.log(`Restarted ${serviceName}.`);
  } catch (error) {
    console.warn(`Unable to restart ${serviceName}: ${error?.stderr?.toString?.() || error?.message || error}`);
  }
}

async function main() {
  const args = getCliArgs();
  const force = hasForceYes(args);
  const dbConfig = readDbConfig();
  const extension = dbConfig.client === "postgres" ? ".dump" : ".db";
  const sourcePath = await resolveBackupPath(args, extension);

  const confirmed = await confirmAction({
    prompt: `Restore "${path.basename(sourcePath)}" and replace the current database?`,
    force,
    defaultAnswer: "yes",
    forceHint:
      `Refusing to restore in non-interactive mode without -y/--yes. Run: npm run db:restore -- -y --file <path-to-${extension}>`,
  });
  if (!confirmed) {
    console.log("Aborted.");
    return;
  }

  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (dbConfig.client === "postgres") {
    const { running, port } = await detectRunningServer();
    if (running) {
      console.error(`Stop Songbird on port ${port} before restoring a PostgreSQL archive.`);
      process.exit(1);
    }
    console.log(`PostgreSQL active — restoring native archive "${path.basename(sourcePath)}"...`);
    try {
      await createPostgresMaintenance({ config: dbConfig }).restore(sourcePath);
      try {
        const adminDb = await openDatabase();
        await syncSecretsFromDatabase({
          dbGetRow: (query) => adminDb.getRow(query),
          projectRootDir,
          serverDir,
        });
        await adminDb.close();
      } catch (_) {}
    } catch (error) {
      console.error(`PostgreSQL restore failed: ${error?.message || error}`);
      process.exit(1);
    }
  } else {
    try {
      const walPath = `${dbPath}-wal`;
      const shmPath = `${dbPath}-shm`;
      try { if (fs.existsSync(walPath)) fs.unlinkSync(walPath); } catch {}
      try { if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath); } catch {}
      fs.copyFileSync(sourcePath, dbPath);
      try {
        const adminDb = await openDatabase({ dbPath });
        await syncSecretsFromDatabase({
          dbGetRow: (query) => adminDb.getRow(query),
          projectRootDir,
          serverDir,
        });
        await adminDb.close();
      } catch (_) {}
    } catch (error) {
      console.error(`Restore failed: ${error?.message || error}`);
      process.exit(1);
    }

    applyOwnership();
  }
  restartService();

  console.log(`Database restored from: ${sourcePath}`);
}

await main();
