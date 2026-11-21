import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { connectMongo } from "../db/mongoConnection.js";
import { createMongoStore } from "../db/mongoStore.js";
import { ensurePlatformIdentitySchema } from "../db/platformIdentitySchema.js";
import { createPlatformIdentityRepository } from "../db/platformIdentityRepository.js";
import {
  executePlatformIdentityMigration,
  planPlatformIdentityMigration,
  PlatformIdentityMigrationError,
} from "../lib/platformIdentityMigration.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

export function assertDisposableLocalTarget(uri, database) {
  if (!/^mongodb:\/\//i.test(uri || "")) {
    throw new Error("Apply mode accepts only an explicit local mongodb:// replica-set URI.");
  }
  if (!/(?:test|e2e|local|dev|disposable)/i.test(database || "")) {
    throw new Error("Apply mode requires a database name containing test, e2e, local, dev, or disposable.");
  }
  const authority = String(uri).replace(/^mongodb:\/\//i, "").split("/")[0].split("@").pop();
  const hosts = authority.split(",").map((item) => {
    if (item.startsWith("[")) return item.slice(1, item.indexOf("]"));
    return item.split(":")[0];
  });
  const local = hosts.every((host) =>
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1",
  );
  if (!local) throw new Error("Apply mode refused a non-local MongoDB host.");
}

export async function runPlatformIdentityMigrationCli(args = process.argv.slice(2)) {
  dotenv.config({ path: path.join(serverDir, "..", ".env"), quiet: true });
  dotenv.config({ path: path.join(serverDir, ".env"), quiet: true });
  const inputPath = option(args, "--input");
  const apply = args.includes("--apply");
  if (!inputPath) throw new Error("Usage: --input <synthetic-links.json> [--apply --disposable-local]");
  const input = JSON.parse(await fs.readFile(path.resolve(inputPath), "utf8"));
  const candidates = Array.isArray(input) ? input : input?.links;
  if (!apply) {
    const plan = planPlatformIdentityMigration({ candidates });
    return { mode: "dry-run", valid: plan.valid, summary: plan.summary, errors: plan.errors };
  }
  if (!args.includes("--disposable-local")) {
    throw new Error("Apply mode requires --disposable-local and is not a production migration command.");
  }
  const uri = process.env.MONGODB_URI || "";
  const database = process.env.MONGODB_DATABASE || "";
  assertDisposableLocalTarget(uri, database);
  const connection = await connectMongo();
  try {
    const store = createMongoStore(connection);
    const repository = createPlatformIdentityRepository(store);
    const initialPlan = planPlatformIdentityMigration({ candidates });
    if (!initialPlan.valid) {
      throw new PlatformIdentityMigrationError(
        "Identity-link migration stopped because its dry run found conflicts.",
        initialPlan,
      );
    }
    const existingLinks = await connection.db
      .collection("platform_identity_links")
      .find({}, { projection: { _id: 0, provider: 1, web_user_id: 1, chat_user_id: 1 } })
      .limit(100_000)
      .toArray()
      .catch((error) => error?.codeName === "NamespaceNotFound" ? [] : Promise.reject(error));
    const candidateChatUserIds = [...new Set(initialPlan.candidates.map((row) => row.chatUserId))];
    const knownChatUserIds = new Set((await connection.db
      .collection("users")
      .find(
        { id: { $in: candidateChatUserIds } },
        { projection: { _id: 0, id: 1 } },
      )
      .limit(candidateChatUserIds.length)
      .toArray()).map((row) => row.id));
    return executePlatformIdentityMigration({
      candidates,
      existingLinks,
      knownChatUserIds,
      dryRun: false,
      ensureSchema: () => ensurePlatformIdentitySchema(connection.db, { enabled: true }),
      linkAccount: repository.linkPlatformIdentityAccount,
    });
  } finally {
    await connection.client.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPlatformIdentityMigrationCli()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      const safe = error?.plan
        ? { error: error.message, summary: error.plan.summary, conflicts: error.plan.errors }
        : { error: error?.message || "Identity migration failed." };
      console.error(JSON.stringify(safe, null, 2));
      process.exitCode = 1;
    });
}
