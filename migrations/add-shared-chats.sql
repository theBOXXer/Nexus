CREATE TABLE IF NOT EXISTS shared_chats (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_shared_chats_token ON shared_chats(token);
CREATE INDEX IF NOT EXISTS idx_shared_chats_chat ON shared_chats(chat_id);
CREATE INDEX IF NOT EXISTS idx_shared_chats_user ON shared_chats(user_id);
