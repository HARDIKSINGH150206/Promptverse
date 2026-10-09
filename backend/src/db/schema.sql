CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS recipients (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, area TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL, telegram_chat_id TEXT, link_code TEXT UNIQUE NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0, cancelled INTEGER NOT NULL DEFAULT 0,
  no_show INTEGER NOT NULL DEFAULT 0, avg_response_secs REAL NOT NULL DEFAULT 300,
  is_simulated_history INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS demands (
  id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL REFERENCES recipients(id),
  people_count INTEGER NOT NULL, meals_matched INTEGER NOT NULL DEFAULT 0,
  diet TEXT NOT NULL, needed_by TEXT NOT NULL, max_distance_km REAL NOT NULL DEFAULT 5,
  notes TEXT, status TEXT NOT NULL DEFAULT 'open', raw_transcript TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  items_json TEXT NOT NULL, meal_count INTEGER NOT NULL,
  meals_assigned INTEGER NOT NULL DEFAULT 0, meals_collected INTEGER NOT NULL DEFAULT 0,
  diet TEXT NOT NULL, cooked_at TEXT NOT NULL, safe_until TEXT NOT NULL,
  photo_url TEXT, raw_transcript TEXT, pickup_notes TEXT,
  status TEXT NOT NULL DEFAULT 'open', fallback_route TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY, offer_id TEXT NOT NULL REFERENCES offers(id),
  recipient_id TEXT NOT NULL REFERENCES recipients(id), demand_id TEXT NOT NULL REFERENCES demands(id),
  meals INTEGER NOT NULL, status TEXT NOT NULL,
  reliability_at_assignment REAL NOT NULL, selection_json TEXT NOT NULL, distance_km REAL NOT NULL,
  offered_at TEXT NOT NULL, respond_by TEXT NOT NULL,
  accepted_at TEXT, reconfirm_by TEXT, collected_at TEXT,
  eta_promised TEXT, p_fail REAL,
  is_standby INTEGER NOT NULL DEFAULT 0, standby_for_assignment_id TEXT,
  last_reply_json TEXT,
  was_rematched INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, at TEXT NOT NULL, type TEXT NOT NULL,
  message TEXT NOT NULL, assignment_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_assignments_offer ON assignments(offer_id);
CREATE INDEX IF NOT EXISTS idx_events_offer ON events(offer_id, at);
