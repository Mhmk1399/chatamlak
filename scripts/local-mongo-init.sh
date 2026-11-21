#!/bin/sh
set -eu

required="MONGO_INITDB_ROOT_USERNAME MONGO_INITDB_ROOT_PASSWORD MONGO_CHAT_USER MONGO_CHAT_PASSWORD"
for name in $required; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "[mongo-init] $name is required" >&2
    exit 1
  fi
done

mongo_root() {
  mongosh --quiet --host mongo --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin "$@"
}

until mongo_root --eval 'db.adminCommand({ ping: 1 }).ok' >/dev/null 2>&1; do
  sleep 2
done

mongo_root --eval 'try { rs.status() } catch (_) { rs.initiate({_id:"ouj-rs",members:[{_id:0,host:"mongo:27017"}]}) }' >/dev/null
until mongo_root --eval 'if (!db.hello().isWritablePrimary) quit(1)' >/dev/null 2>&1; do
  sleep 2
done

MONGO_CHAT_USER="$MONGO_CHAT_USER" MONGO_CHAT_PASSWORD="$MONGO_CHAT_PASSWORD" \
  mongo_root ouj_chat --eval '
    const username = process.env.MONGO_CHAT_USER;
    const password = process.env.MONGO_CHAT_PASSWORD;
    if (!db.getUser(username)) {
      db.createUser({user: username, pwd: password, roles: [{role: "readWrite", db: "ouj_chat"}]});
    }
  ' >/dev/null

echo "[mongo-init] replica set and ouj_chat application user are ready"
