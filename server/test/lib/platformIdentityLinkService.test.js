import { describe, expect, test, vi } from "vitest";
import { createPlatformIdentityLinkService } from "../../lib/platformIdentityLinkService.js";

const NOW = Date.parse("2026-11-20T08:00:00.000Z");

function principal(overrides = {}) {
  return {
    kind: "registered",
    provider: "owj-web",
    webUserId: "web-user-1",
    tokenUse: "support_registered",
    scopes: ["support:conversation:create"],
    jti: "bootstrap-1",
    expiresAt: NOW + 120_000,
    ...overrides,
  };
}

function service(overrides = {}) {
  return createPlatformIdentityLinkService({
    now: () => NOW,
    findChatUserById: vi.fn(async (id) => ({ id, banned: 0, status: "online" })),
    findPlatformIdentityLinkByWebUserId: vi.fn(async () => ({
      provider: "owj-web",
      web_user_id: "web-user-1",
      chat_user_id: "chat-user-1",
      status: "active",
    })),
    linkPlatformIdentityAccount: vi.fn(async (input) => ({ created: true, link: input })),
    linkSupportGuestToRegistered: vi.fn(async (input) => ({ created: true, link: input })),
    verifyAccountLinkProof: vi.fn(async () => ({
      provider: "owj-web",
      webUserId: "web-user-1",
      chatUserId: "chat-user-1",
      jti: "link-proof-1",
      expiresAt: NOW + 60_000,
      authorized: true,
    })),
    verifyGuestConversionProof: vi.fn(async () => ({
      provider: "owj-web",
      guestSubject: "guest-1",
      webUserId: "web-user-1",
      conversationId: "conversation-1",
      jti: "conversion-proof-1",
      expiresAt: NOW + 60_000,
      authorized: true,
    })),
    ...overrides,
  });
}

describe("verified platform identity link service", () => {
  test("links only when a separate Web proof binds both exact IDs", async () => {
    const linkPlatformIdentityAccount = vi.fn(async (input) => ({ created: true, link: input }));
    const subject = service({ linkPlatformIdentityAccount });
    await expect(subject.linkRegisteredAccount({
      principal: principal(),
      chatUserId: "chat-user-1",
      proofCredential: "opaque-link-proof",
    })).resolves.toMatchObject({ created: true });
    expect(linkPlatformIdentityAccount).toHaveBeenCalledWith({
      provider: "owj-web",
      webUserId: "web-user-1",
      chatUserId: "chat-user-1",
      linkedByWebUserId: "web-user-1",
    });
  });

  test("rejects proof mismatch, unavailable proof verification, and inactive Chat accounts", async () => {
    await expect(service({
      verifyAccountLinkProof: vi.fn(async () => ({
        provider: "owj-web",
        webUserId: "web-user-1",
        chatUserId: "another-chat-user",
        jti: "proof",
        expiresAt: NOW + 1_000,
        authorized: true,
      })),
    }).linkRegisteredAccount({
      principal: principal(),
      chatUserId: "chat-user-1",
      proofCredential: "proof",
    })).rejects.toMatchObject({ code: "IDENTITY_LINK_PROOF_INVALID", status: 403 });

    await expect(service({ verifyAccountLinkProof: undefined }).linkRegisteredAccount({
      principal: principal(),
      chatUserId: "chat-user-1",
      proofCredential: "proof",
    })).rejects.toMatchObject({ code: "IDENTITY_LINK_PROVIDER_UNAVAILABLE", status: 503 });

    await expect(service({
      findChatUserById: vi.fn(async () => ({ id: "chat-user-1", banned: 1 })),
    }).linkRegisteredAccount({
      principal: principal(),
      chatUserId: "chat-user-1",
      proofCredential: "proof",
    })).rejects.toMatchObject({ code: "CHAT_ACCOUNT_DISABLED", status: 403 });
  });

  test("converts a guest only when Web proof matches the trusted guest session and active link", async () => {
    const linkSupportGuestToRegistered = vi.fn(async (input) => ({ created: true, link: input }));
    const subject = service({ linkSupportGuestToRegistered });
    await expect(subject.convertGuestToRegistered({
      registeredPrincipal: principal({ chatUserId: "chat-user-1" }),
      guestSession: {
        kind: "guest",
        provider: "owj-web",
        guestSubject: "guest-1",
        conversationId: "conversation-1",
      },
      proofCredential: "opaque-conversion-proof",
    })).resolves.toMatchObject({ created: true });
    expect(linkSupportGuestToRegistered).toHaveBeenCalledWith({
      provider: "owj-web",
      guestSubject: "guest-1",
      webUserId: "web-user-1",
      chatUserId: "chat-user-1",
      conversationId: "conversation-1",
      proofJti: "conversion-proof-1",
    });
  });

  test("never converts by display data or a mismatched guest subject", async () => {
    const linkSupportGuestToRegistered = vi.fn();
    const subject = service({
      linkSupportGuestToRegistered,
      verifyGuestConversionProof: vi.fn(async () => ({
        provider: "owj-web",
        guestSubject: "another-guest",
        webUserId: "web-user-1",
        conversationId: "conversation-1",
        jti: "proof",
        expiresAt: NOW + 1_000,
        authorized: true,
      })),
    });
    await expect(subject.convertGuestToRegistered({
      registeredPrincipal: principal({ chatUserId: "chat-user-1" }),
      guestSession: {
        kind: "guest",
        provider: "owj-web",
        guestSubject: "guest-1",
        conversationId: "conversation-1",
        displayName: "Same Name",
      },
      proofCredential: "proof",
    })).rejects.toMatchObject({ code: "GUEST_CONVERSION_PROOF_INVALID" });
    expect(linkSupportGuestToRegistered).not.toHaveBeenCalled();
  });
});
