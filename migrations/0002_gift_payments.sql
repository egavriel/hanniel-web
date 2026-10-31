-- Little Hanniel e-Gift: gateway payment attempts (see docs/EGIFT-PLAN.md).
-- One gift can have several attempts (QRIS expired, switched to VA). Any of them
-- paying activates the gift, including one that arrives late.

CREATE TABLE IF NOT EXISTS gift_payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  gift_id      INTEGER NOT NULL REFERENCES gifts(id),
  order_id     TEXT NOT NULL UNIQUE,         -- GIFT-<code>-<attempt>, sent to the gateway
  provider     TEXT NOT NULL,                -- midtrans
  method       TEXT NOT NULL,                -- qris | bca_va
  amount       INTEGER NOT NULL,             -- IDR the gateway must report back
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | expire | cancel | deny | failure | refund | amount_mismatch
  provider_ref TEXT,                         -- gateway transaction_id
  qr_url       TEXT,
  va_number    TEXT,
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gift_payments_gift ON gift_payments(gift_id);
CREATE INDEX IF NOT EXISTS idx_gift_payments_status ON gift_payments(status, created_at);
