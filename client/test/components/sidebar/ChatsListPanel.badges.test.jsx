/**
 * Badge rendering tests for ChatsListPanel — covers:
 *   - DM chat card: peer verified badge and role badge
 *   - Group/channel chat card: chat verified badge (no role badge)
 *   - Discover user results: verified + role badges
 *   - Discover group/channel results: verified badge
 *   - Badge order
 *   - Correct users get the right badges
 */
import { afterEach, describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ChatsListPanel from "../../../src/components/sidebar/list/ChatsListPanel.jsx";
import { setLocale, t } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

afterEach(() => setLocale("en"));

const ME = { id: 1, username: "alice", nickname: "Alice", color: "#10b981" };

// ─── Prop factory helpers ─────────────────────────────────────────────────────

function makeDmPeer(overrides = {}) {
  return {
    id: 2,
    username: "bob",
    nickname: "Bob",
    avatar_url: null,
    color: "#3b82f6",
    status: "offline",
    role: "member",
    user_role: "user",
    user_verified: 0,
    ...overrides,
  };
}

function makeDmChat(peer, chatOverrides = {}) {
  return {
    id: 10,
    type: "dm",
    verified: false,
    members: [
      {
        id: ME.id,
        username: ME.username,
        nickname: ME.nickname,
        color: ME.color,
        status: "offline",
        role: "member",
        user_role: "user",
        user_verified: 0,
      },
      peer,
    ],
    last_message: null,
    last_time: null,
    last_message_files: [],
    unread_count: 0,
    _muted: false,
    ...chatOverrides,
  };
}

function makeGroupChat(overrides = {}) {
  return {
    id: 20,
    type: "group",
    name: "Test Group",
    group_username: "test_group",
    group_color: "#10b981",
    group_avatar_url: null,
    verified: false,
    members: [
      {
        id: ME.id,
        username: ME.username,
        nickname: ME.nickname,
        color: ME.color,
        status: "offline",
        role: "owner",
        user_role: "user",
        user_verified: 0,
      },
    ],
    last_message: null,
    last_time: null,
    last_message_files: [],
    unread_count: 0,
    _muted: false,
    ...overrides,
  };
}

function makeDiscoverUser(overrides = {}) {
  return {
    id: 3,
    username: "carol",
    nickname: "Carol",
    avatar_url: null,
    color: "#f59e0b",
    status: "offline",
    role: "user",
    verified: false,
    ...overrides,
  };
}

function makeDiscoverGroup(overrides = {}) {
  return {
    id: 21,
    name: "Public Group",
    username: "public_group",
    color: "#10b981",
    avatarUrl: null,
    inviteToken: "abc",
    membersCount: 5,
    isMember: false,
    verified: false,
    type: "group",
    ...overrides,
  };
}

// Minimal set of required props — callbacks are no-ops
const BASE_PROPS = {
  loadingChats: false,
  user: ME,
  editMode: false,
  activeChatId: null,
  selectedChats: [],
  formatChatTimestamp: () => "",
  requestDeleteChats: vi.fn(),
  toggleSelectChat: vi.fn(),
  setActiveChatId: vi.fn(),
  setActivePeer: vi.fn(),
  setMobileTab: vi.fn(),
  setIsAtBottom: vi.fn(),
  setUnreadInChat: vi.fn(),
  lastMessageIdRef: { current: null },
  isAtBottomRef: { current: true },
  chatsSearchQuery: "",
  chatsSearchFocused: false,
  discoverLoading: false,
  discoverUsers: [],
  discoverGroups: [],
  discoverChannels: [],
  discoverSaved: false,
  isSavedChatActive: false,
  onOpenDiscoveredUser: vi.fn(),
  onOpenDiscoveredGroup: vi.fn(),
  onOpenUserProfileContext: vi.fn(),
  onOpenSavedMessages: vi.fn(),
  onOpenUserContextMenu: vi.fn(),
  onOpenChatContextMenu: vi.fn(),
};

describe("ChatsListPanel — numeric false flags", () => {
  for (const locale of ["fa", "en"]) {
    test(`zero verification and mute flags add no text to chat titles in ${locale}`, async () => {
      setLocale(locale);
      const chats = [
        makeDmChat(makeDmPeer({ user_verified: 0 }), { _muted: 0 }),
        makeGroupChat({ verified: 0, _muted: 0 }),
        makeGroupChat({ id: 30, type: "channel", name: "Test Channel", verified: 0, _muted: 0 }),
        makeGroupChat({ id: 40, type: "saved", name: "Saved messages", verified: 0, _muted: 0 }),
      ];
      await render(<ChatsListPanel {...BASE_PROPS} visibleChats={chats} />);
      for (const name of ["Bob", "Test Group", "Test Channel", "Saved messages"]) {
        const title = page.getByText(name, { exact: true });
        await expect.element(title.element().parentElement).toHaveTextContent(name);
        await expect.element(title.element().parentElement).not.toHaveTextContent("0");
      }
      await expect.element(page.getByLabelText(t("Verified"), { exact: true })).not.toBeInTheDocument();
      await expect.element(page.getByLabelText(t("Muted chat"), { exact: true })).not.toBeInTheDocument();
    });

    test(`zero membership flags add no text to discovered communities in ${locale}`, async () => {
      setLocale(locale);
      await render(<ChatsListPanel {...BASE_PROPS} visibleChats={[]} chatsSearchFocused chatsSearchQuery="Public"
        discoverGroups={[makeDiscoverGroup({ name: "Public Group", verified: 0, isMember: 0 })]}
        discoverChannels={[makeDiscoverGroup({ id: 22, name: "Public Channel", verified: 0, isMember: 0, type: "channel" })]} discoverSaved={0} />);
      for (const name of ["Public Group", "Public Channel"]) {
        await expect.element(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();
      }
      await expect.element(page.getByText("0", { exact: true })).not.toBeInTheDocument();
      await expect.element(page.getByText(t("Joined"), { exact: true })).not.toBeInTheDocument();
    });

    test(`keeps real zeros in names and messages and positive unread counts in ${locale}`, async () => {
      setLocale(locale);
      await render(<ChatsListPanel {...BASE_PROPS} visibleChats={[makeGroupChat({ name: "Room 0", verified: 0, _muted: 0, unread_count: 3, last_message: "0" })]} />);
      const title = page.getByText("Room 0", { exact: true });
      await expect.element(title.element().parentElement).toHaveTextContent("Room 0");
      await expect.element(page.getByText("0", { exact: true })).toBeVisible();
      await expect.element(page.getByLabelText(t("{count} unread messages", { count: 3 }), { exact: true })).toBeVisible();
    });
  }
});

// ─── DM chat list card badges ─────────────────────────────────────────────────

describe("ChatsListPanel — DM chat card badges", () => {
  test("shows Verified badge for a verified DM peer", async () => {
    const peer = makeDmPeer({ user_verified: 1 });
    render(
      <ChatsListPanel {...BASE_PROPS} visibleChats={[makeDmChat(peer)]} />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
  });

  test("shows Verified badge when user_verified=true (boolean)", async () => {
    const peer = makeDmPeer({ user_verified: true });
    render(
      <ChatsListPanel {...BASE_PROPS} visibleChats={[makeDmChat(peer)]} />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
  });

  test("hides Verified badge for unverified DM peer", async () => {
    const peer = makeDmPeer({ user_verified: 0 });
    render(
      <ChatsListPanel {...BASE_PROPS} visibleChats={[makeDmChat(peer)]} />,
    );
    await expect
      .element(page.getByRole("button", { name: "Bob" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Verified"))
      .not.toBeInTheDocument();
  });

  test("shows Owner badge for DM peer with user_role='owner'", async () => {
    const peer = makeDmPeer({ user_role: "owner" });
    render(
      <ChatsListPanel {...BASE_PROPS} visibleChats={[makeDmChat(peer)]} />,
    );
    await expect
      .element(page.getByLabelText("Server Owner"))
      .toBeInTheDocument();
  });

  test("shows Admin badge for DM peer with user_role='admin'", async () => {
    const peer = makeDmPeer({ user_role: "admin" });
    render(
      <ChatsListPanel {...BASE_PROPS} visibleChats={[makeDmChat(peer)]} />,
    );
    await expect
      .element(page.getByLabelText("Server Admin"))
      .toBeInTheDocument();
  });

  test("shows no role badge for plain user DM peer", async () => {
    const peer = makeDmPeer({ user_role: "user" });
    render(
      <ChatsListPanel {...BASE_PROPS} visibleChats={[makeDmChat(peer)]} />,
    );
    await expect
      .element(page.getByRole("button", { name: "Bob" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Server Owner"))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Server Admin"))
      .not.toBeInTheDocument();
  });

  test("shows both Verified and Owner badges for a verified owner DM peer", async () => {
    const peer = makeDmPeer({ user_verified: 1, user_role: "owner" });
    render(
      <ChatsListPanel {...BASE_PROPS} visibleChats={[makeDmChat(peer)]} />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Server Owner"))
      .toBeInTheDocument();
  });

  test("shows both Verified and Admin badges for a verified admin DM peer", async () => {
    const peer = makeDmPeer({ user_verified: 1, user_role: "admin" });
    render(
      <ChatsListPanel {...BASE_PROPS} visibleChats={[makeDmChat(peer)]} />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Server Admin"))
      .toBeInTheDocument();
  });

  test("DM card badge order: Verified before role badge", async () => {
    const peer = makeDmPeer({ user_verified: 1, user_role: "admin" });
    render(
      <ChatsListPanel {...BASE_PROPS} visibleChats={[makeDmChat(peer)]} />,
    );
    const verified = page.getByLabelText("Verified");
    const admin = page.getByLabelText("Server Admin");
    await expect.element(verified).toBeInTheDocument();
    await expect.element(admin).toBeInTheDocument();
    const verifiedEl = verified.element();
    const adminEl = admin.element();
    expect(
      verifiedEl.compareDocumentPosition(adminEl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

// ─── Group / channel chat list card badges ────────────────────────────────────

describe("ChatsListPanel — group/channel chat card badges", () => {
  test("shows Verified badge for a verified group", async () => {
    render(
      <ChatsListPanel
        {...BASE_PROPS}
        visibleChats={[makeGroupChat({ verified: true })]}
      />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
  });

  test("hides Verified badge for an unverified group", async () => {
    render(
      <ChatsListPanel
        {...BASE_PROPS}
        visibleChats={[makeGroupChat({ verified: false })]}
      />,
    );
    await expect
      .element(page.getByRole("button", { name: "Test Group" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Verified"))
      .not.toBeInTheDocument();
  });

  test("shows Verified badge for a verified channel", async () => {
    render(
      <ChatsListPanel
        {...BASE_PROPS}
        visibleChats={[
          makeGroupChat({ type: "channel", name: "News Feed", verified: true }),
        ]}
      />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
  });

  test("does NOT show Server Owner/Admin badge on group card (chats have no server role)", async () => {
    render(
      <ChatsListPanel
        {...BASE_PROPS}
        visibleChats={[makeGroupChat({ verified: true })]}
      />,
    );
    await expect
      .element(page.getByLabelText("Server Owner"))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Server Admin"))
      .not.toBeInTheDocument();
  });
});

// ─── Discover users (search results) ─────────────────────────────────────────

describe("ChatsListPanel — discover user search badges", () => {
  const searchProps = {
    ...BASE_PROPS,
    visibleChats: [],
    chatsSearchFocused: true,
    chatsSearchQuery: "car",
  };

  test("shows Verified badge for a verified user in discover results", async () => {
    render(
      <ChatsListPanel
        {...searchProps}
        discoverUsers={[makeDiscoverUser({ verified: true })]}
      />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
  });

  test("hides Verified badge for unverified user in discover results", async () => {
    render(
      <ChatsListPanel
        {...searchProps}
        discoverUsers={[makeDiscoverUser({ verified: false })]}
      />,
    );
    // Wait for the @carol username text to confirm the user card is rendered
    await expect.element(page.getByText("@carol")).toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Verified"))
      .not.toBeInTheDocument();
  });

  test("shows Admin badge for admin user in discover results", async () => {
    render(
      <ChatsListPanel
        {...searchProps}
        discoverUsers={[makeDiscoverUser({ role: "admin" })]}
      />,
    );
    await expect
      .element(page.getByLabelText("Server Admin"))
      .toBeInTheDocument();
  });

  test("shows no role badge for plain user in discover results", async () => {
    render(
      <ChatsListPanel
        {...searchProps}
        discoverUsers={[makeDiscoverUser({ role: "user" })]}
      />,
    );
    // Wait for the @carol username to confirm the card rendered
    await expect.element(page.getByText("@carol")).toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Server Owner"))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Server Admin"))
      .not.toBeInTheDocument();
  });

  test("shows both badges for verified admin in discover results", async () => {
    render(
      <ChatsListPanel
        {...searchProps}
        discoverUsers={[makeDiscoverUser({ verified: true, role: "admin" })]}
      />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Server Admin"))
      .toBeInTheDocument();
  });
});

// ─── Discover groups ──────────────────────────────────────────────────────────

describe("ChatsListPanel — discover group search badges", () => {
  const searchProps = {
    ...BASE_PROPS,
    visibleChats: [],
    chatsSearchFocused: true,
    chatsSearchQuery: "pub",
  };

  test("shows Verified badge for a verified group in discover results", async () => {
    render(
      <ChatsListPanel
        {...searchProps}
        discoverGroups={[makeDiscoverGroup({ verified: true })]}
      />,
    );
    await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
  });

  test("hides Verified badge for unverified group in discover results", async () => {
    render(
      <ChatsListPanel
        {...searchProps}
        discoverGroups={[makeDiscoverGroup({ verified: false })]}
      />,
    );
    await expect
      .element(page.getByRole("button", { name: /Public Group/ }))
      .toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Verified"))
      .not.toBeInTheDocument();
  });
});
