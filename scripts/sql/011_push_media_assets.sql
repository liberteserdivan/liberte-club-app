-- Push rich media (FCM imageUrl için public asset)
CREATE TABLE IF NOT EXISTS push_media_assets (
  id TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  bytes BYTEA NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
