CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  volunteered_to_pray BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prayer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS prayer_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prayer_request_id UUID NOT NULL REFERENCES prayer_requests(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response_type TEXT NOT NULL CHECK (response_type IN ('QUICK', 'MESSAGE')),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prayer_responses_unique_request_user UNIQUE (prayer_request_id, from_user_id)
);

CREATE TABLE IF NOT EXISTS prayer_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prayer_request_id UUID NOT NULL REFERENCES prayer_requests(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('NEW_PRAYER_REQUEST', 'PRAYER_RESPONSE', 'PRAYER_UPDATE', 'PRAYER_CLOSED')),
  prayer_request_id UUID NOT NULL REFERENCES prayer_requests(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_volunteered_to_pray ON users(volunteered_to_pray);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_status_created_at ON prayer_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_requester ON prayer_requests(requester_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prayer_responses_prayer_request ON prayer_responses(prayer_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prayer_responses_from_user ON prayer_responses(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prayer_updates_prayer_request ON prayer_updates(prayer_request_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_notifications_to_user_created_at ON notifications(to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_to_user_unread ON notifications(to_user_id, is_read, created_at DESC);
