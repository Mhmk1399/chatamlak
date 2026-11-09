const helpText = `
Ouj Chat DB Commands

Core:
  npm run db:help
  npm run db:backup
  npm run db:restore -- -y --file /path/to/ouj-chat-backup-<timestamp>.db
  npm run db:restore -- -y --file /path/to/ouj-chat-backup-<timestamp>.dump  # PostgreSQL (service stopped)
  npm run db:migrate
  npm run db:vacuum -- -y
  npm run db:inspect -- --limit 25
  npm run db:chat:inspect -- --limit 25
  npm run db:user:inspect -- --limit 25
  npm run db:file:inspect -- --limit 25

Reset/Delete:
  npm run db:reset -- -y --recreate
  npm run db:reset -- -y --no-recreate
  npm run db:delete -- -y
  npm run db:chat:delete -- -y 12
  npm run db:chat:delete -- -y core.team
  npm run db:chat:delete -- --all -y
  npm run db:user:delete -- -y ouj-chat.sage
  npm run db:user:delete -- --all -y
  npm run db:file:delete -- -y 42
  npm run db:file:delete -- -y stored-file-name.ext
  npm run db:file:delete -- --all -y

Users:
  npm run db:user:create -- --nickname "Ouj Chat Sage" --username ouj-chat.sage --password "12345678"
  npm run db:user:create -- --nickname "Ouj Chat Sage" --username ouj-chat.sage --password "12345678" --role admin
  npm run db:user:create -- --nickname "Ouj Chat Sage" --username ouj-chat.sage --password "12345678" --role owner
  npm run db:user:create -- "Ouj Chat Sage" ouj-chat.sage "12345678"
  npm run db:user:generate -- --count 50 --password "12345678" --nickname-prefix User --username-prefix user
  npm run db:user:edit -- ouj-chat.sage --nickname "Ouj Chat Sage" --color "#ff6b6b"
  npm run db:user:edit -- ouj-chat.sage --role admin
  npm run db:user:edit -- ouj-chat.sage --role owner
  npm run db:user:edit -- ouj-chat.sage --role user
  npm run db:user:verify -- ouj-chat.sage
  npm run db:user:ban -- ouj-chat.sage -y

Chats:
  npm run db:chat:create -- --type group --name "Core Team" --owner ouj-chat.sage --username core.team --visibility public --users bob,charlie
  npm run db:chat:add -- core.team --all
  npm run db:chat:add -- core.team bob charlie
  npm run db:chat:edit -- core.team --name "Core Team HQ" --owner ouj-chat.sage2
  npm run db:chat:edit -- core.team --visibility private --disallow-member-invites
  npm run db:chat:verify -- core.team

Messages:
  npm run db:message:generate -- 1 ouj-chat.sage ouj-chat.sage2 300 7
  npm run db:message:generate -- --chatId 1 --userA ouj-chat.sage --userB ouj-chat.sage2 --count 300 --days 7

Notes:
  - Use "--" before flags when running through npm.
  - Required values are shown in the examples above; optional values are in brackets.
  - Delete-all actions use explicit --all.
  - Destructive/safety-sensitive commands support -y and --yes.
  - db:user:ban is a toggle: run it again to unban the user.
  - db:user:verify is a toggle: run it again to remove the user's verified status.
  - db:chat:verify is a toggle: run it again to remove the chat's verified status.
  - db:user:create/edit accept --role user|admin|owner. Only one user can hold the owner role at a time. The owner cannot be demoted, banned, or deleted via the admin panel.
  - SQLite backup/restore use timestamped .db files in data/backups/.
  - PostgreSQL backup/restore use native .dump archives and require pg_dump/pg_restore in PATH.
  - Stop Ouj Chat before PostgreSQL db:restore, db:reset, or db:delete; those commands use native PostgreSQL tools.
  - db:restore replaces the SQLite database with a given .db file and restarts the service if running as root.
`;

console.log(helpText.trim());
