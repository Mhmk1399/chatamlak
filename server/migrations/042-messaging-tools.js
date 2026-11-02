export const migration042MessagingTools = {
  version: 42,
  up: ({ db }) => {
    const statements = [
      `CREATE TABLE IF NOT EXISTS chat_preferences (
        user_id TEXT NOT NULL, chat_id TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0, folder TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (user_id, chat_id))`,
      `CREATE TABLE IF NOT EXISTS message_reactions (
        message_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL,
        PRIMARY KEY (message_id, user_id, emoji))`,
      `CREATE TABLE IF NOT EXISTS chat_pinned_messages (
        chat_id TEXT NOT NULL, message_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY (chat_id, message_id))`,
      `CREATE TABLE IF NOT EXISTS chat_topics (
        id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, title TEXT NOT NULL, user_id TEXT NOT NULL,
        closed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS chat_message_topics (message_id TEXT PRIMARY KEY, topic_id TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS chat_polls (
        id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, user_id TEXT NOT NULL, message_id TEXT NOT NULL,
        question TEXT NOT NULL, options TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS chat_poll_votes (
        poll_id TEXT NOT NULL, user_id TEXT NOT NULL, option_index INTEGER NOT NULL,
        PRIMARY KEY (poll_id, user_id))`,
      `CREATE TABLE IF NOT EXISTS scheduled_messages (
        id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, user_id TEXT NOT NULL, body TEXT NOT NULL,
        due_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', error TEXT, lease_until TEXT,
        created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS session_devices (
        token_hash TEXT PRIMARY KEY, label TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS chat_event_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS chat_group_policy (
        chat_id TEXT PRIMARY KEY, slow_seconds INTEGER NOT NULL DEFAULT 0,
        members_can_send INTEGER NOT NULL DEFAULT 1, members_can_upload INTEGER NOT NULL DEFAULT 1)`,
      "CREATE TABLE IF NOT EXISTS group_call_rooms (chat_id TEXT PRIMARY KEY)",
      `CREATE TABLE IF NOT EXISTS group_call_peers (
        id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, user_id TEXT NOT NULL,
        video INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`,
      "CREATE INDEX IF NOT EXISTS idx_group_call_peers_room ON group_call_peers(chat_id, updated_at)",
      "CREATE INDEX IF NOT EXISTS idx_chat_events_chat_id ON chat_event_log(chat_id, id)",
      "CREATE INDEX IF NOT EXISTS idx_scheduled_due ON scheduled_messages(status, due_at)",
      "CREATE INDEX IF NOT EXISTS idx_topics_chat ON chat_topics(chat_id, created_at)",
      "CREATE INDEX IF NOT EXISTS idx_polls_chat ON chat_polls(chat_id, created_at)",
    ];
    statements.forEach((sql) => db.run(sql));
  },
};
