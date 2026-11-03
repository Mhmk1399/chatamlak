import { test, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const cwd = fileURLToPath(new URL("../../", import.meta.url));
const options = { cwd, env: { ...process.env, DB_CLIENT: "mongodb", MONGODB_URI: "" } };
test("shows maintenance and management help without opening a database", { timeout: 15000 }, async () => {
  for (const command of ["help", "user:create", "chat:create", "restore"]) {
    const { stdout } = await execute(process.execPath, ["scripts/mongo-cli.js", command, "--help"], options);
    expect(stdout).toContain("Ouj Chat MongoDB tools");
    expect(stdout).toContain("--yes --offline");
  }
});
test("refuses maintenance with a blank MongoDB URI instead of writing SQLite", async () => {
  await expect(execute(process.execPath, ["scripts/mongo-cli.js", "check"], options)).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("MONGODB_URI is empty") });
});
