import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const scriptsDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../scripts",
);
const serverDir = path.resolve(scriptsDir, "..");
const projectRootDir = path.resolve(serverDir, "..");
const restoreScriptPath = path.join(scriptsDir, "restore-db.js");

describe("restore-db.js", () => {
  let originalDbClient;

  beforeEach(() => {
    originalDbClient = process.env.DB_CLIENT;
    delete process.env.DB_CLIENT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalDbClient !== undefined) {
      process.env.DB_CLIENT = originalDbClient;
    } else {
      delete process.env.DB_CLIENT;
    }
  });

  test("loads dotenv configuration and detects DB_CLIENT=postgres", () => {
    const source = fs.readFileSync(restoreScriptPath, "utf8");
    expect(source).toMatch(/import dotenv from ["']dotenv["']/);
    expect(source).toMatch(/dotenv\.config\(/);
  });

  test("resolves backup file when given a relative path to backup in data/backups", () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "songbird-restore-"),
    );
    const dataDir = path.join(tempRoot, "data");
    const backupDir = path.join(dataDir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const backupFile = path.join(backupDir, "songbird-backup-test.db");
    fs.writeFileSync(backupFile, "SQLITE_MOCK_DATA");

    const targetDb = path.join(dataDir, "songbird.db");
    fs.writeFileSync(targetDb, "OLD_DATA");

    execFileSync(
      process.execPath,
      [restoreScriptPath, "-y", "--file", "songbird-backup-test.db"],
      {
        encoding: "utf8",
        cwd: serverDir,
        env: {
          ...process.env,
          DATA_DIR: dataDir,
          DB_CLIENT: "sqlite3",
        },
      },
    );

    expect(fs.readFileSync(targetDb, "utf8")).toBe("SQLITE_MOCK_DATA");
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test("resolves backup file when given a relative path from project root", () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "songbird-restore-"),
    );
    const dataDir = path.join(tempRoot, "data");
    const backupDir = path.join(dataDir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const backupFile = path.join(backupDir, "songbird-backup-from-root.db");
    fs.writeFileSync(backupFile, "SQLITE_ROOT_DATA");

    const targetDb = path.join(dataDir, "songbird.db");
    fs.writeFileSync(targetDb, "OLD_DATA");

    execFileSync(
      process.execPath,
      [
        restoreScriptPath,
        "-y",
        "--file",
        "data/backups/songbird-backup-from-root.db",
      ],
      {
        encoding: "utf8",
        cwd: serverDir,
        env: {
          ...process.env,
          INIT_CWD: tempRoot,
          DATA_DIR: dataDir,
          DB_CLIENT: "sqlite3",
        },
      },
    );

    expect(fs.readFileSync(targetDb, "utf8")).toBe("SQLITE_ROOT_DATA");
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test("resolves backup file when given an absolute path", () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "songbird-restore-"),
    );
    const dataDir = path.join(tempRoot, "data");
    const backupDir = path.join(dataDir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const backupFile = path.join(backupDir, "songbird-backup-abs.db");
    fs.writeFileSync(backupFile, "SQLITE_ABS_DATA");

    const targetDb = path.join(dataDir, "songbird.db");
    fs.writeFileSync(targetDb, "OLD_DATA");

    execFileSync(
      process.execPath,
      [restoreScriptPath, "-y", "--file", backupFile],
      {
        encoding: "utf8",
        cwd: serverDir,
        env: {
          ...process.env,
          DATA_DIR: dataDir,
          DB_CLIENT: "sqlite3",
        },
      },
    );

    expect(fs.readFileSync(targetDb, "utf8")).toBe("SQLITE_ABS_DATA");
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test("rejects a .dump file in SQLite mode with clear error", () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "songbird-restore-"),
    );
    const backupFile = path.join(tempRoot, "backup.dump");
    fs.writeFileSync(backupFile, "DUMP_CONTENT");

    let stderr = "";
    try {
      execFileSync(
        process.execPath,
        [restoreScriptPath, "-y", "--file", backupFile],
        {
          encoding: "utf8",
          cwd: serverDir,
          env: {
            ...process.env,
            DB_CLIENT: "sqlite3",
          },
        },
      );
    } catch (error) {
      stderr = error?.stderr?.toString?.() || "";
    }

    expect(stderr).toMatch(/Backup file not found or is not a \.db file/);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test("rejects a .db file in PostgreSQL mode with clear error", () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "songbird-restore-"),
    );
    const backupFile = path.join(tempRoot, "backup.db");
    fs.writeFileSync(backupFile, "DB_CONTENT");

    let stderr = "";
    try {
      execFileSync(
        process.execPath,
        [restoreScriptPath, "-y", "--file", backupFile],
        {
          encoding: "utf8",
          cwd: serverDir,
          env: {
            ...process.env,
            DB_CLIENT: "postgres",
          },
        },
      );
    } catch (error) {
      stderr = error?.stderr?.toString?.() || "";
    }

    expect(stderr).toMatch(/Backup file not found or is not a \.dump file/);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test("reports permission denied instead of file not found when file is not readable in SQLite mode", () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "songbird-restore-"),
    );
    const backupFile = path.join(tempRoot, "unreadable.db");
    fs.writeFileSync(backupFile, "SECRET_DATA");
    fs.chmodSync(backupFile, 0);

    let stderr = "";
    try {
      execFileSync(
        process.execPath,
        [restoreScriptPath, "-y", "--file", backupFile],
        {
          encoding: "utf8",
          cwd: serverDir,
          env: {
            ...process.env,
            DB_CLIENT: "sqlite3",
          },
        },
      );
    } catch (error) {
      stderr = error?.stderr?.toString?.() || "";
    } finally {
      fs.chmodSync(backupFile, 0o600);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }

    expect(stderr).toMatch(/Permission denied accessing backup file/);
    expect(stderr).not.toMatch(/Backup file not found or is not a \.db file/);
  });

  test("reports permission denied instead of file not found when file is not readable in PostgreSQL mode", () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "songbird-restore-"),
    );
    const backupFile = path.join(tempRoot, "unreadable.dump");
    fs.writeFileSync(backupFile, "SECRET_DUMP");
    fs.chmodSync(backupFile, 0);

    let stderr = "";
    try {
      execFileSync(
        process.execPath,
        [restoreScriptPath, "-y", "--file", backupFile],
        {
          encoding: "utf8",
          cwd: serverDir,
          env: {
            ...process.env,
            DB_CLIENT: "postgres",
          },
        },
      );
    } catch (error) {
      stderr = error?.stderr?.toString?.() || "";
    } finally {
      fs.chmodSync(backupFile, 0o600);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }

    expect(stderr).toMatch(/Permission denied accessing backup file/);
    expect(stderr).not.toMatch(/Backup file not found or is not a \.dump file/);
  });

  test("reports permission denied when parent directory is not accessible", () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "songbird-restore-"),
    );
    const restrictedDir = path.join(tempRoot, "restricted");
    fs.mkdirSync(restrictedDir, { recursive: true });
    const backupFile = path.join(restrictedDir, "backup.db");
    fs.writeFileSync(backupFile, "SECRET_DB");
    fs.chmodSync(restrictedDir, 0);

    let stderr = "";
    try {
      execFileSync(
        process.execPath,
        [restoreScriptPath, "-y", "--file", backupFile],
        {
          encoding: "utf8",
          cwd: serverDir,
          env: {
            ...process.env,
            DB_CLIENT: "sqlite3",
          },
        },
      );
    } catch (error) {
      stderr = error?.stderr?.toString?.() || "";
    } finally {
      fs.chmodSync(restrictedDir, 0o700);
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }

    expect(stderr).toMatch(/Permission denied accessing backup file/);
    expect(stderr).not.toMatch(/Backup file not found or is not a \.db file/);
  });
});
