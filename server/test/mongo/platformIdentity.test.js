import { beforeEach, describe, expect, test } from "vitest";
import {
  PLATFORM_ASSERTION_JTI_COLLECTION,
  PLATFORM_IDENTITY_LINK_COLLECTION,
  SUPPORT_GUEST_IDENTITY_LINK_COLLECTION,
  ensurePlatformIdentitySchema,
} from "../../db/platformIdentitySchema.js";
import { createPlatformIdentityRepository } from "../../db/platformIdentityRepository.js";
import { migrateMongoSchemaV4 } from "../../db/mongoSchema.js";
import { R, alice, db, group } from "./helpers.js";

let identity;

beforeEach(async () => {
  await ensurePlatformIdentitySchema(db, { enabled: true });
  for (const name of [
    PLATFORM_IDENTITY_LINK_COLLECTION,
    PLATFORM_ASSERTION_JTI_COLLECTION,
    SUPPORT_GUEST_IDENTITY_LINK_COLLECTION,
  ]) await db.collection(name).deleteMany({});
  identity = createPlatformIdentityRepository(R.store);
});

describe("platform identity storage on a real MongoDB replica set", () => {
  test("upgrades the replay validator before consuming a guest-link proof JTI", async () => {
    await db.command({
      collMod: PLATFORM_ASSERTION_JTI_COLLECTION,
      validator: { $jsonSchema: {
        bsonType: "object",
        required: ["id", "issuer", "jti", "subject", "token_use", "expires_at", "created_at"],
        properties: { token_use: { enum: ["support_registered", "support_guest", "support_agent"] } },
      } },
      validationLevel: "strict",
    });
    await migrateMongoSchemaV4(db);
    await expect(identity.consumePlatformIdentityAssertionJti({
      issuer: "https://web.example.test/",
      jti: "guest-link-proof-jti",
      subject: "507f1f77bcf86cd799439011",
      tokenUse: "support_guest_link",
      expiresAt: new Date(Date.now() + 60_000),
    })).resolves.toBe(true);
  });

  test("enforces one-to-one account links under concurrent idempotent retries", async () => {
    const request = {
      provider: "owj-web",
      webUserId: "web-user-1",
      chatUserId: alice,
      linkedByWebUserId: "web-operator-1",
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => identity.linkPlatformIdentityAccount(request)),
    );
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(results.filter((result) => result.duplicate)).toHaveLength(4);
    expect(await db.collection(PLATFORM_IDENTITY_LINK_COLLECTION).countDocuments({})).toBe(1);
    await expect(identity.linkPlatformIdentityAccount({
      ...request,
      webUserId: "another-web-user",
    })).rejects.toMatchObject({ code: "IDENTITY_LINK_CONFLICT" });
  });

  test("consumes a bootstrap jti exactly once under concurrent requests", async () => {
    const assertion = {
      issuer: "https://identity.ouj.example",
      jti: "assertion-1",
      subject: "web-user-1",
      tokenUse: "support_registered",
      expiresAt: new Date(Date.now() + 300_000),
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => identity.consumePlatformIdentityAssertionJti(assertion)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.collection(PLATFORM_ASSERTION_JTI_COLLECTION).countDocuments({})).toBe(1);
  });

  test("deactivation and guest conversion preserve historical Chat authorship", async () => {
    const chatId = await group();
    const messageId = await R.createMessage(chatId, alice, "historical support message");
    await identity.linkPlatformIdentityAccount({
      provider: "owj-web",
      webUserId: "web-user-1",
      chatUserId: alice,
    });
    await identity.linkSupportGuestToRegistered({
      provider: "owj-web",
      guestSubject: "guest-1",
      webUserId: "web-user-1",
      chatUserId: alice,
      conversationId: chatId,
      proofJti: "conversion-proof-1",
    });
    await identity.deactivatePlatformIdentityLink({
      provider: "owj-web",
      webUserId: "web-user-1",
      reason: "synthetic_test_deactivation",
    });

    expect(await identity.findPlatformIdentityLinkByWebUserId("owj-web", "web-user-1"))
      .toMatchObject({ status: "deactivated", chat_user_id: alice });
    expect(await R.findMessageById(messageId)).toMatchObject({ id: messageId, user_id: alice });
    expect(await db.collection(SUPPORT_GUEST_IDENTITY_LINK_COLLECTION).countDocuments({})).toBe(1);
  });
});
