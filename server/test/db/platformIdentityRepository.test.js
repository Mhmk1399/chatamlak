import { describe, expect, test, vi } from "vitest";
import {
  PlatformIdentityLinkError,
  createPlatformIdentityRepository,
} from "../../db/platformIdentityRepository.js";

const NOW = Date.parse("2026-11-20T08:00:00.000Z");

function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

function fakeStore(seed = {}) {
  const records = new Map(
    Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]),
  );
  function collection(name) {
    if (!records.has(name)) records.set(name, []);
    const rows = records.get(name);
    return {
      findOne: vi.fn(async (filter) => rows.find((row) => matches(row, filter)) || null),
      insertOne: vi.fn(async (document) => {
        const duplicate = rows.some((row) => {
          if (name === "platform_identity_links") {
            return row.id === document.id ||
              (row.provider === document.provider && row.web_user_id === document.web_user_id) ||
              row.chat_user_id === document.chat_user_id;
          }
          if (name === "platform_identity_assertion_jtis") {
            return row.issuer === document.issuer && row.jti === document.jti;
          }
          return row.provider === document.provider && row.guest_subject_digest === document.guest_subject_digest;
        });
        if (duplicate) throw Object.assign(new Error("duplicate"), { code: 11000 });
        rows.push({ ...document });
        return { insertedId: document.id };
      }),
      findOneAndUpdate: vi.fn(async (filter, update) => {
        const row = rows.find((item) => matches(item, filter));
        if (!row) return null;
        Object.assign(row, update.$set || {});
        if (update.$inc) {
          for (const [key, amount] of Object.entries(update.$inc)) row[key] = (row[key] || 0) + amount;
        }
        return { ...row };
      }),
    };
  }
  return {
    records,
    db: { collection: vi.fn(collection) },
    opts: (options = {}) => options,
  };
}

function repository(store = fakeStore()) {
  let sequence = 0;
  return createPlatformIdentityRepository(store, {
    now: () => NOW,
    randomUUID: () => `uuid-${++sequence}`,
  });
}

describe("platform identity repository", () => {
  test("creates an explicit one-to-one link and repeats idempotently", async () => {
    const store = fakeStore();
    const repo = repository(store);
    const input = {
      provider: "owj-web",
      webUserId: "web-user-1",
      chatUserId: "chat-user-1",
      linkedByWebUserId: "web-operator-1",
    };

    await expect(repo.linkPlatformIdentityAccount(input)).resolves.toMatchObject({
      created: true,
      duplicate: false,
      link: {
        id: "uuid-1",
        web_user_id: "web-user-1",
        chat_user_id: "chat-user-1",
        status: "active",
      },
    });
    await expect(repo.linkPlatformIdentityAccount(input)).resolves.toMatchObject({
      created: false,
      duplicate: true,
      link: { id: "uuid-1" },
    });
    expect(store.records.get("platform_identity_links")).toHaveLength(1);
  });

  test("rejects both Web-subject and Chat-account collisions", async () => {
    const store = fakeStore({
      platform_identity_links: [{
        id: "existing",
        provider: "owj-web",
        web_user_id: "web-user-1",
        chat_user_id: "chat-user-1",
        status: "active",
      }],
    });
    const repo = repository(store);

    await expect(repo.linkPlatformIdentityAccount({
      provider: "owj-web",
      webUserId: "web-user-1",
      chatUserId: "chat-user-2",
    })).rejects.toBeInstanceOf(PlatformIdentityLinkError);
    await expect(repo.linkPlatformIdentityAccount({
      provider: "owj-web",
      webUserId: "web-user-2",
      chatUserId: "chat-user-1",
    })).rejects.toMatchObject({ code: "IDENTITY_LINK_CONFLICT", status: 409 });
  });

  test("deactivates without deleting history and is idempotent", async () => {
    const store = fakeStore({
      platform_identity_links: [{
        id: "existing",
        provider: "owj-web",
        web_user_id: "web-user-1",
        chat_user_id: "chat-user-1",
        status: "active",
        revision: 1,
      }],
    });
    const repo = repository(store);

    await expect(repo.deactivatePlatformIdentityLink({
      provider: "owj-web",
      webUserId: "web-user-1",
      reason: "web_account_disabled",
    })).resolves.toMatchObject({ status: "deactivated", revision: 2 });
    await expect(repo.deactivatePlatformIdentityLink({
      provider: "owj-web",
      webUserId: "web-user-1",
      reason: "web_account_disabled",
    })).resolves.toMatchObject({ status: "deactivated", revision: 2 });
    expect(store.records.get("platform_identity_links")).toHaveLength(1);
  });

  test("consumes assertion jtis durably and reports replay", async () => {
    const store = fakeStore();
    const repo = repository(store);
    const input = {
      issuer: "https://identity.ouj.example",
      jti: "assertion-1",
      subject: "web-user-1",
      tokenUse: "support_registered",
      expiresAt: new Date(NOW + 300_000),
    };
    await expect(repo.consumePlatformIdentityAssertionJti(input)).resolves.toBe(true);
    await expect(repo.consumePlatformIdentityAssertionJti(input)).resolves.toBe(false);
    expect(store.records.get("platform_identity_assertion_jtis")).toHaveLength(1);
  });

  test("records guest conversion idempotently without rewriting the identity link", async () => {
    const store = fakeStore();
    const repo = repository(store);
    const input = {
      provider: "owj-web",
      guestSubject: "guest-1",
      webUserId: "web-user-1",
      chatUserId: "chat-user-1",
      conversationId: "conversation-1",
      proofJti: "conversion-proof-1",
    };
    await expect(repo.linkSupportGuestToRegistered(input)).resolves.toMatchObject({
      created: true,
      duplicate: false,
      link: {
        guest_subject_digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        conversation_id: "conversation-1",
      },
    });
    await expect(repo.linkSupportGuestToRegistered(input)).resolves.toMatchObject({
      created: false,
      duplicate: true,
    });
    expect(store.records.get("support_guest_identity_links")).toHaveLength(1);
    expect(JSON.stringify(store.records.get("support_guest_identity_links"))).not.toContain("guest-1");
  });
});
