import { describe, expect, test, vi } from "vitest";
import {
  PLATFORM_IDENTITY_LINK_COLLECTION,
  PLATFORM_IDENTITY_LINK_INDEXES,
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

describe("dormant platform identity-link schema", () => {
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
});
