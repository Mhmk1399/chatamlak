import { describe, expect, test, vi } from "vitest";
import { createMongoAdminActions } from "../../../lib/services/mongoAdminService.js";
import { userEvents } from "../../../lib/workers/autoAddWorker.js";

describe("mongo admin service user creation", () => {
  test("emits the auto-add worker's userId payload contract", async () => {
    const repository = {
      store: {},
      findUserById: vi.fn(async () => null),
      findUserByUsername: vi.fn(async () => null),
      findChatByGroupUsername: vi.fn(async () => null),
      createUser: vi.fn(async () => "user-123"),
    };
    const execute = createMongoAdminActions({
      mongoRepository: repository,
      USERNAME_REGEX: /^[a-z0-9_]{3,32}$/,
      bcrypt: { hash: vi.fn(async () => "password-hash") },
    });
    const handler = vi.fn();
    userEvents.once("user:created", handler);

    await execute("create_user", { username: "alice", password: "secret" });

    expect(handler).toHaveBeenCalledWith({ userId: "user-123" });
  });
});

describe("mongo admin service session invalidation", () => {
  function makeHarness() {
    const user = { id: "user-123", username: "alice", banned: 0 };
    const repository = {
      store: { update: vi.fn(async () => {}) },
      findUserById: vi.fn(async (id) => (id === user.id ? user : null)),
      findUserByUsername: vi.fn(async (username) =>
        username === user.username ? user : null,
      ),
      updateUserProfile: vi.fn(async () => {}),
      deleteSessionsByUserId: vi.fn(async () => 2),
      deleteUserById: vi.fn(async () => ({ files: [], storedNames: [] })),
    };
    const disconnectUserSessions = vi.fn(async () => {});
    const execute = createMongoAdminActions({
      mongoRepository: repository,
      USERNAME_REGEX: /^[a-z0-9_]{3,32}$/,
      bcrypt: { hash: vi.fn(async () => "replacement-hash") },
      disconnectUserSessions,
      cleanupDeletedFiles: vi.fn(async () => {}),
    });
    return { disconnectUserSessions, execute, repository };
  }

  test("revokes persisted and live sessions after a password change", async () => {
    const { disconnectUserSessions, execute, repository } = makeHarness();

    await execute("edit_user", { user: "alice", password: "new-secret" });

    expect(repository.deleteSessionsByUserId).toHaveBeenCalledWith("user-123");
    expect(disconnectUserSessions).toHaveBeenCalledWith(
      "alice",
      "password_changed",
    );
  });

  test("revokes persisted and live sessions when a user is banned", async () => {
    const { disconnectUserSessions, execute, repository } = makeHarness();

    await execute("toggle_user_ban", { user: "alice", banned: true });

    expect(repository.deleteSessionsByUserId).toHaveBeenCalledWith("user-123");
    expect(disconnectUserSessions).toHaveBeenCalledWith("alice", "banned");
  });

  test("disconnects live sessions when a user is deleted", async () => {
    const { disconnectUserSessions, execute, repository } = makeHarness();

    await execute("delete_users", { users: ["alice"] });

    expect(repository.deleteUserById).toHaveBeenCalledWith("user-123");
    expect(disconnectUserSessions).toHaveBeenCalledWith(
      "alice",
      "account_deleted",
    );
  });
});
