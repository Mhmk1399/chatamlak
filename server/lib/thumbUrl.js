const APP_ENCRYPTED_TYPES = new Set(["local", "aes-256-gcm", "app"]);

/**
 * Whether an encryption_type value means app-layer (SBENC) ciphertext that
 * only STORAGE_ENCRYPTION_KEY can open. "remote"/"none"/"provider_sse" are
 * all plaintext over the wire.
 */
export function isAppEncryptedType(value) {
  return APP_ENCRYPTED_TYPES.has(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

/**
 * Resolve the client-facing thumbnail URL for a message file.
 *
 * All persisted message thumbnails are served through the authorization-aware
 * server route. This prevents message payloads from leaking reusable direct
 * object-storage URLs and applies the same current-membership check to both
 * encrypted and plaintext thumbnails.
 *
 * @param {object} params
 * @param {object} [params.storageProvider]
 * @param {object} [params.file] - message-file row (driver/encryption read here)
 * @param {string} [params.thumbKey] - overrides the row's thumb key (webhook path)
 * @param {string|number} [params.fileId] - overrides the row id (webhook path)
 */
export async function resolveThumbUrl({
  storageProvider,
  file,
  thumbKey,
  fileId,
}) {
  const key =
    thumbKey ?? file?.thumb_storage_key ?? file?.thumbStorageKey ?? null;
  if (!key) return null;
  const id = fileId ?? file?.id ?? null;
  if (
    id !== undefined &&
    id !== null &&
    String(id) !== ""
  ) {
    return `/api/uploads/thumbs/${id}`;
  }
  return null;
}
