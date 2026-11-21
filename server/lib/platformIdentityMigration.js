const ALLOWED_FIELDS = new Set([
  "provider",
  "webUserId",
  "chatUserId",
  "linkedByWebUserId",
]);

export class PlatformIdentityMigrationError extends Error {
  constructor(message, plan) {
    super(message);
    this.name = "PlatformIdentityMigrationError";
    this.code = "IDENTITY_MIGRATION_CONFLICT";
    this.plan = plan;
  }
}

function normalizedString(value, max = 200) {
  const result = typeof value === "string" ? value.trim() : "";
  return result && result.length <= max ? result : null;
}

/**
 * Pure dry-run planner. It never examines names, phone numbers, or display
 * values and never guesses a mapping. Errors identify only input row numbers so
 * migration logs do not need to expose canonical identity values.
 */
export function planPlatformIdentityMigration({
  candidates = [],
  existingLinks = [],
  knownChatUserIds = null,
  maxCandidates = 100_000,
} = {}) {
  if (!Array.isArray(candidates) || candidates.length > maxCandidates) {
    throw new TypeError("Identity-link candidates must be a bounded array.");
  }
  if (!Array.isArray(existingLinks) || existingLinks.length > maxCandidates) {
    throw new TypeError("Existing identity links must be a bounded array.");
  }
  if (
    knownChatUserIds != null &&
    !(knownChatUserIds instanceof Set) &&
    !Array.isArray(knownChatUserIds)
  ) {
    throw new TypeError("Known Chat user IDs must be an array or set.");
  }
  const knownChatUsers = knownChatUserIds == null ? null : new Set(knownChatUserIds);
  if (knownChatUsers && knownChatUsers.size > maxCandidates) {
    throw new TypeError("Known Chat user IDs must be bounded.");
  }
  const errors = [];
  const normalized = [];
  const webIds = new Map();
  const chatIds = new Map();
  const existingByWeb = new Map();
  const existingByChat = new Map();
  for (const link of existingLinks) {
    const provider = link?.provider || "owj-web";
    const webUserId = link?.web_user_id || link?.webUserId;
    const chatUserId = link?.chat_user_id || link?.chatUserId;
    if (provider && webUserId) existingByWeb.set(`${provider}\u0000${webUserId}`, chatUserId);
    if (chatUserId) existingByChat.set(chatUserId, `${provider}\u0000${webUserId}`);
  }
  candidates.forEach((candidate, offset) => {
    const row = offset + 1;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      errors.push({ row, code: "INVALID_CANDIDATE" });
      return;
    }
    const unapproved = Object.keys(candidate).filter((key) => !ALLOWED_FIELDS.has(key));
    if (unapproved.length) {
      errors.push({ row, code: "UNAPPROVED_MATCH_FIELD" });
      return;
    }
    const provider = normalizedString(candidate.provider, 64);
    const webUserId = normalizedString(candidate.webUserId);
    const chatUserId = normalizedString(candidate.chatUserId);
    const linkedByWebUserId = candidate.linkedByWebUserId == null
      ? null
      : normalizedString(candidate.linkedByWebUserId);
    if (provider !== "owj-web" || !webUserId || !chatUserId || (candidate.linkedByWebUserId != null && !linkedByWebUserId)) {
      errors.push({ row, code: "INVALID_CANDIDATE" });
      return;
    }
    if (knownChatUsers && !knownChatUsers.has(chatUserId)) {
      errors.push({ row, code: "MISSING_CHAT_ACCOUNT" });
      return;
    }
    const webKey = `${provider}\u0000${webUserId}`;
    if (webIds.has(webKey)) {
      errors.push({ row, code: "DUPLICATE_WEB_IDENTITY", conflictsWithRow: webIds.get(webKey) });
      return;
    }
    if (chatIds.has(chatUserId)) {
      errors.push({ row, code: "DUPLICATE_CHAT_ACCOUNT", conflictsWithRow: chatIds.get(chatUserId) });
      return;
    }
    const existingChatId = existingByWeb.get(webKey);
    const existingWebKey = existingByChat.get(chatUserId);
    if (
      (existingChatId && existingChatId !== chatUserId) ||
      (existingWebKey && existingWebKey !== webKey)
    ) {
      errors.push({ row, code: "EXISTING_LINK_CONFLICT" });
      return;
    }
    webIds.set(webKey, row);
    chatIds.set(chatUserId, row);
    normalized.push({ provider, webUserId, chatUserId, linkedByWebUserId });
  });
  return {
    valid: errors.length === 0,
    candidates: normalized,
    errors,
    summary: {
      candidates: candidates.length,
      ready: normalized.length,
      conflicts: errors.length,
      existingLinks: existingLinks.length,
    },
  };
}

export async function executePlatformIdentityMigration({
  candidates,
  existingLinks = [],
  knownChatUserIds = null,
  dryRun = true,
  ensureSchema,
  linkAccount,
} = {}) {
  const plan = planPlatformIdentityMigration({ candidates, existingLinks, knownChatUserIds });
  if (!plan.valid) {
    throw new PlatformIdentityMigrationError(
      "Identity-link migration stopped because its dry run found conflicts.",
      plan,
    );
  }
  if (dryRun) return { applied: false, summary: plan.summary, errors: [] };
  if (typeof ensureSchema !== "function" || typeof linkAccount !== "function") {
    throw new TypeError("Schema and link operations are required for apply mode.");
  }
  await ensureSchema();
  let created = 0;
  let duplicates = 0;
  for (const candidate of plan.candidates) {
    const result = await linkAccount(candidate);
    if (result?.created) created += 1;
    else if (result?.duplicate) duplicates += 1;
    else throw new Error("Identity-link repository returned an invalid migration result.");
  }
  return {
    applied: true,
    summary: plan.summary,
    result: { created, duplicates },
  };
}
