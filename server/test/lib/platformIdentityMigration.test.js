import { describe, expect, test, vi } from "vitest";
import {
  executePlatformIdentityMigration,
  planPlatformIdentityMigration,
} from "../../lib/platformIdentityMigration.js";

describe("platform identity migration planner", () => {
  test("accepts only explicit Web-to-Chat IDs and reports a bounded dry run", async () => {
    const links = [{
      provider: "owj-web",
      webUserId: "web-user-1",
      chatUserId: "chat-user-1",
      linkedByWebUserId: "web-operator-1",
    }];
    expect(planPlatformIdentityMigration({ candidates: links })).toMatchObject({
      valid: true,
      summary: { candidates: 1, conflicts: 0 },
    });
    const ensureSchema = vi.fn();
    const linkAccount = vi.fn();
    await expect(executePlatformIdentityMigration({
      candidates: links,
      dryRun: true,
      ensureSchema,
      linkAccount,
    })).resolves.toMatchObject({ applied: false, summary: { candidates: 1 } });
    expect(ensureSchema).not.toHaveBeenCalled();
    expect(linkAccount).not.toHaveBeenCalled();
  });

  test("rejects duplicate subjects, duplicate Chat IDs, and profile-based matching fields", () => {
    const plan = planPlatformIdentityMigration({
      candidates: [
        { provider: "owj-web", webUserId: "web-1", chatUserId: "chat-1" },
        { provider: "owj-web", webUserId: "web-1", chatUserId: "chat-2" },
        { provider: "owj-web", webUserId: "web-3", chatUserId: "chat-1" },
        { provider: "owj-web", username: "same-name", webUserId: "web-4", chatUserId: "chat-4" },
      ],
    });
    expect(plan.valid).toBe(false);
    expect(plan.summary.conflicts).toBe(3);
    expect(plan.errors.map((item) => item.code)).toEqual(expect.arrayContaining([
      "DUPLICATE_WEB_IDENTITY",
      "DUPLICATE_CHAT_ACCOUNT",
      "UNAPPROVED_MATCH_FIELD",
    ]));
  });

  test("stops on existing incompatible links and applies valid rows idempotently", async () => {
    expect(planPlatformIdentityMigration({
      candidates: [{ provider: "owj-web", webUserId: "web-1", chatUserId: "chat-2" }],
      existingLinks: [{ provider: "owj-web", web_user_id: "web-1", chat_user_id: "chat-1" }],
    })).toMatchObject({ valid: false, summary: { conflicts: 1 } });

    const ensureSchema = vi.fn(async () => {});
    const linkAccount = vi
      .fn()
      .mockResolvedValueOnce({ created: true })
      .mockResolvedValueOnce({ created: false, duplicate: true });
    await expect(executePlatformIdentityMigration({
      candidates: [
        { provider: "owj-web", webUserId: "web-1", chatUserId: "chat-1" },
        { provider: "owj-web", webUserId: "web-2", chatUserId: "chat-2" },
      ],
      dryRun: false,
      ensureSchema,
      linkAccount,
    })).resolves.toMatchObject({
      applied: true,
      result: { created: 1, duplicates: 1 },
    });
    expect(ensureSchema).toHaveBeenCalledTimes(1);
  });

  test("flags a missing target Chat UUID when the database inventory is supplied", () => {
    expect(planPlatformIdentityMigration({
      candidates: [
        { provider: "owj-web", webUserId: "web-1", chatUserId: "missing-chat-user" },
      ],
      knownChatUserIds: new Set(["different-chat-user"]),
    })).toMatchObject({
      valid: false,
      errors: [{ row: 1, code: "MISSING_CHAT_ACCOUNT" }],
      summary: { conflicts: 1, ready: 0 },
    });
  });
});
