import { test, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { R, db, testUri } from "./helpers.js";

const execute = promisify(execFile);
const serverDir = fileURLToPath(new URL("../../", import.meta.url));
const cli = (...args) => execute(process.execPath, ["scripts/mongo-cli.js", ...args], { cwd: serverDir, env: { ...process.env, DB_CLIENT: "mongodb", MONGODB_URI: testUri, MONGODB_DATABASE: db.databaseName, SERVER_PORT: "0", PORT: "0" }, timeout: 15000 });

test("runs native user/chat management, owner checks and offline backup/restore on Windows and Unix", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "ouj-mongo-cli-test-"));
  try {
    await expect(cli("owner:check")).rejects.toMatchObject({ code: 1 });
    await cli("user:create", "--username", "cli_owner", "--password", "isolated-password", "--role", "owner", "--offline");
    expect(JSON.parse((await cli("owner:check")).stdout).exists).toBe(true);
    const user = await R.findUserByUsername("cli_owner"); expect(user.role).toBe("owner");
    const chat = JSON.parse((await cli("chat:create", "--username", "cli_office", "--name", "CLI Office", "--owner", "cli_owner", "--users", "alice,bob", "--offline")).stdout);
    expect(await R.listChatMembers(chat.id)).toHaveLength(3);
    await cli("user:edit", "cli_owner", "--nickname", "CLI manager", "--offline");
    const archive = path.join(folder, "record backup.json.gz");
    await cli("backup", "--file", archive);
    await R.adminClearAllMessages();
    await expect(cli("restore", "--file", archive)).rejects.toMatchObject({ code: 1 });
    await cli("restore", "--file", archive, "--yes", "--offline");
    expect((await R.findUserById(user.id)).nickname).toBe("CLI manager");
    await cli("chat:delete", "cli_office", "--yes", "--offline");
    expect(await R.findChatById(chat.id)).toBeNull();
  } finally {
    if (!path.resolve(folder).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("Unexpected CLI test directory.");
    await fs.rm(folder, { recursive: true, force: true });
  }
}, 60000);
