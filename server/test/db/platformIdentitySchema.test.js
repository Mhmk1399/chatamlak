import { describe, expect, test, vi } from "vitest";
import {
  PLATFORM_ASSERTION_JTI_COLLECTION,
  PLATFORM_IDENTITY_LINK_COLLECTION,
  PLATFORM_IDENTITY_LINK_INDEXES,
  SUPPORT_GUEST_IDENTITY_LINK_COLLECTION,
  ensurePlatformIdentitySchema,
  ensurePlatformIdentityLinkSchema,
} from "../../db/platformIdentitySchema.js";

function fakeDb({ exists = false } = {}) {
  const createIndex = vi.fn(async () => "index-name");
  return {
    createIndex,
    db: {
      listCollections: vi.fn(() => ({
        hasNext: async () => exists,
      })),
      createCollection: vi.fn(async () => {}),
      collection: vi.fn(() => ({ createIndex })),
    },
  };
}

describe("additive platform identity-link schema", () => {
  test("does nothing unless the feature flag is explicitly enabled", async () => {
    const { db, createIndex } = fakeDb();

    await expect(
      ensurePlatformIdentityLinkSchema(db, { enabled: false }),
    ).resolves.toEqual({
      enabled: false,
      collection: PLATFORM_IDENTITY_LINK_COLLECTION,
      changed: false,
    });
    expect(db.listCollections).not.toHaveBeenCalled();
    expect(db.createCollection).not.toHaveBeenCalled();
    expect(createIndex).not.toHaveBeenCalled();
  });

  test("creates an additive validated collection and conflict-preventing indexes", async () => {
    const { db, createIndex } = fakeDb();

    await expect(
      ensurePlatformIdentityLinkSchema(db, { enabled: true }),
    ).resolves.toEqual({
      enabled: true,
      collection: PLATFORM_IDENTITY_LINK_COLLECTION,
      changed: true,
    });
    expect(db.createCollection).toHaveBeenCalledWith(
      PLATFORM_IDENTITY_LINK_COLLECTION,
      expect.objectContaining({
        validator: {
          $jsonSchema: expect.objectContaining({
            required: expect.arrayContaining([
              "id",
              "provider",
              "web_user_id",
              "chat_user_id",
              "status",
              "created_at",
              "updated_at",
            ]),
          }),
        },
      }),
    );
    expect(createIndex).toHaveBeenCalledTimes(
      PLATFORM_IDENTITY_LINK_INDEXES.length,
    );
    expect(PLATFORM_IDENTITY_LINK_INDEXES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keys: { provider: 1, web_user_id: 1 },
          options: expect.objectContaining({ unique: true }),
        }),
        expect.objectContaining({
          keys: { chat_user_id: 1 },
          options: expect.objectContaining({ unique: true }),
        }),
      ]),
    );
  });

  test("is idempotent when the collection already exists", async () => {
    const { db, createIndex } = fakeDb({ exists: true });

    await expect(
      ensurePlatformIdentityLinkSchema(db, { enabled: true }),
    ).resolves.toEqual({
      enabled: true,
      collection: PLATFORM_IDENTITY_LINK_COLLECTION,
      changed: false,
    });
    expect(db.createCollection).not.toHaveBeenCalled();
    expect(createIndex).toHaveBeenCalledTimes(
      PLATFORM_IDENTITY_LINK_INDEXES.length,
    );
  });

  test("creates replay and guest-conversion collections without touching existing Chat data", async () => {
    const created = [];
    const indexes = new Map();
    const db = {
      listCollections: vi.fn(({ name }) => ({ hasNext: async () => name === "users" })),
      createCollection: vi.fn(async (name, options) => created.push({ name, options })),
      collection: vi.fn((name) => ({
        createIndex: vi.fn(async (keys, options) => {
          indexes.set(`${name}:${options.name}`, { keys, options });
        }),
      })),
    };

    await expect(ensurePlatformIdentitySchema(db, { enabled: true })).resolves.toMatchObject({
      enabled: true,
      collections: [
        PLATFORM_IDENTITY_LINK_COLLECTION,
        PLATFORM_ASSERTION_JTI_COLLECTION,
        SUPPORT_GUEST_IDENTITY_LINK_COLLECTION,
      ],
    });
    expect(created.map(({ name }) => name)).toEqual([
      PLATFORM_IDENTITY_LINK_COLLECTION,
      PLATFORM_ASSERTION_JTI_COLLECTION,
      SUPPORT_GUEST_IDENTITY_LINK_COLLECTION,
    ]);
    expect(indexes.get(`${PLATFORM_ASSERTION_JTI_COLLECTION}:platform_assertion_jti_expiry`))
      .toEqual(expect.objectContaining({
        keys: { expires_at: 1 },
        options: expect.objectContaining({ expireAfterSeconds: 0 }),
      }));
    expect(indexes.get(`${SUPPORT_GUEST_IDENTITY_LINK_COLLECTION}:support_guest_identity_subject`))
      .toEqual(expect.objectContaining({ options: expect.objectContaining({ unique: true }) }));
  });
});
