-- e-Gift schema (D1 binding GIFT_DB). See docs/EGIFT-PLAN.md §6.
-- Apply: wrangler d1 execute <db> --file migrations/0001_gift.sql [--local]

CREATE TABLE IF NOT EXISTS gift_users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  phone       TEXT NOT NULL UNIQUE,          -- normalised 628…
  name        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS gift_otps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gift_otps_phone ON gift_otps (phone, created_at);

CREATE TABLE IF NOT EXISTS gifts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,      -- 8 chars, shown as GIFT-XXXXXXXX
  sender_id       INTEGER NOT NULL REFERENCES gift_users(id),
  recipient_id    INTEGER REFERENCES gift_users(id),
  recipient_name  TEXT NOT NULL DEFAULT '',
  message         TEXT NOT NULL DEFAULT '',
  theme           TEXT NOT NULL DEFAULT 'cream',
  line            TEXT NOT NULL,             -- catalog line id (oats, cookies)
  units_paid      INTEGER NOT NULL,
  units_bonus     INTEGER NOT NULL,
  units_total     INTEGER NOT NULL,
  units_redeemed  INTEGER NOT NULL DEFAULT 0,
  price_idr       INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending_payment', -- pending_payment | active | completed | cancelled
  thanks_emoji    TEXT,
  thanks_note     TEXT,
  created_at      INTEGER NOT NULL,
  paid_at         INTEGER,
  claimed_at      INTEGER,
  expires_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_gifts_sender ON gifts (sender_id);
CREATE INDEX IF NOT EXISTS idx_gifts_recipient ON gifts (recipient_id);

CREATE TABLE IF NOT EXISTS gift_redemptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  gift_id     INTEGER NOT NULL REFERENCES gifts(id),
  flavor      TEXT NOT NULL,
  qty         INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'requested',  -- requested | fulfilled
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gift_redemptions_gift ON gift_redemptions (gift_id);
