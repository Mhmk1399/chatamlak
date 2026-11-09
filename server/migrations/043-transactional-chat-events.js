// The event and its source change commit together. The shared clock also
// prevents PostgreSQL sequence allocation/commit reordering from skipping an
// event when a client advances its replay cursor across server instances.
export const migration043TransactionalChatEvents = {
  version: 43,
  up: ({ db, hasColumn, isPostgres }) => {
    if (!hasColumn("chat_event_log", "viewer_user_id")) db.run("ALTER TABLE chat_event_log ADD COLUMN viewer_user_id TEXT");
    db.run("CREATE TABLE IF NOT EXISTS chat_event_clock (id INTEGER PRIMARY KEY, sequence BIGINT NOT NULL DEFAULT 0)");
    db.run("INSERT INTO chat_event_clock (id, sequence) VALUES (1, 0) ON CONFLICT (id) DO NOTHING");
    db.run("UPDATE chat_event_clock SET sequence = CASE WHEN sequence < COALESCE((SELECT MAX(id) FROM chat_event_log), 0) THEN (SELECT MAX(id) FROM chat_event_log) ELSE sequence END WHERE id = 1");

    if (isPostgres) {
      db.exec(`CREATE OR REPLACE FUNCTION ouj_chat_append_event(chat TEXT, event_payload TEXT, viewer TEXT DEFAULT NULL)
        RETURNS VOID LANGUAGE plpgsql AS $$
        DECLARE next_sequence BIGINT;
        BEGIN
          IF chat IS NULL THEN RETURN; END IF;
          UPDATE chat_event_clock SET sequence = sequence + 1 WHERE id = 1 RETURNING sequence INTO next_sequence;
          INSERT INTO chat_event_log(id, chat_id, payload, viewer_user_id, created_at)
            VALUES(next_sequence, chat, event_payload, viewer, CURRENT_TIMESTAMP::text);
        END; $$`);
    }
    const definitions = [
      { table: "chat_messages", chat: (row) => `${row}.chat_id`, message: (row) => `${row}.id`, type: (operation) => operation === "DELETE" ? "chat_message_deleted" : operation === "INSERT" ? "chat_message" : "chat_message_updated" },
      { table: "chat_message_files", chat: (row) => `(SELECT chat_id FROM chat_messages WHERE id = ${row}.message_id)`, message: (row) => `${row}.message_id`, type: () => "chat_message_updated" },
      { table: "hidden_chat_messages", chat: (row) => `(SELECT chat_id FROM chat_messages WHERE id = ${row}.message_id)`, message: (row) => `${row}.message_id`, viewer: (row) => `${row}.user_id`, type: (operation) => operation === "DELETE" ? "chat_message_updated" : "chat_message_deleted" },
      ...["chat_preferences", "chat_pinned_messages", "chat_topics", "chat_polls", "chat_group_policy"].map((table) => ({ table, chat: (row) => `${row}.chat_id`, viewer: table === "chat_preferences" ? (row) => `${row}.user_id` : null, type: () => "chat_tools_updated" })),
      { table: "message_reactions", chat: (row) => `(SELECT chat_id FROM chat_messages WHERE id = ${row}.message_id)`, type: () => "chat_tools_updated" },
      { table: "chat_poll_votes", chat: (row) => `(SELECT chat_id FROM chat_polls WHERE id = ${row}.poll_id)`, type: () => "chat_tools_updated" },
      { table: "chat_message_topics", chat: (row) => `(SELECT chat_id FROM chat_messages WHERE id = ${row}.message_id)`, type: () => "chat_tools_updated" },
    ];
    for (const definition of definitions) {
      for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
        const row = operation === "DELETE" ? "OLD" : "NEW";
        const name = `ouj_event_${definition.table}_${operation.toLowerCase()}`;
        const chat = definition.chat(row);
        const viewer = definition.viewer?.(row) || "NULL";
        const message = definition.message?.(row) || "NULL";
        const type = definition.type(operation);
        if (isPostgres) {
          db.exec(`CREATE OR REPLACE FUNCTION ${name}_fn() RETURNS TRIGGER LANGUAGE plpgsql AS $$
            DECLARE event_chat TEXT; event_type TEXT;
            BEGIN
              event_chat := ${chat};
              event_type := '${type}';
              ${definition.table === "chat_messages" && operation === "UPDATE" ? "IF NEW.hidden_everyone_at IS NOT NULL THEN event_type := 'chat_message_deleted'; END IF;" : ""}
              PERFORM ouj_chat_append_event(event_chat, json_build_object('type', event_type, 'chatId', event_chat, 'messageId', ${message})::text, ${viewer});
              RETURN ${row};
            END; $$`);
          db.run(`DROP TRIGGER IF EXISTS ${name} ON ${definition.table}`);
          db.run(`CREATE TRIGGER ${name} AFTER ${operation} ON ${definition.table} FOR EACH ROW EXECUTE FUNCTION ${name}_fn()`);
        } else {
          const eventType = definition.table === "chat_messages" && operation === "UPDATE" ? "CASE WHEN NEW.hidden_everyone_at IS NOT NULL THEN 'chat_message_deleted' ELSE 'chat_message_updated' END" : `'${type}'`;
          db.exec(`CREATE TRIGGER IF NOT EXISTS ${name} AFTER ${operation} ON ${definition.table}
            WHEN ${chat} IS NOT NULL
            BEGIN
              UPDATE chat_event_clock SET sequence = sequence + 1 WHERE id = 1;
              INSERT INTO chat_event_log(id, chat_id, payload, viewer_user_id, created_at)
                SELECT sequence, ${chat}, json_object('type', ${eventType}, 'chatId', ${chat}, 'messageId', ${message}), ${viewer}, datetime('now') FROM chat_event_clock WHERE id = 1;
            END`);
        }
      }
    }
  },
};
