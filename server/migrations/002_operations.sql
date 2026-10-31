CREATE TABLE permissions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK(permission IN ('safeguarding','finance-approver')),
  PRIMARY KEY(user_id,permission)
);
CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE programme_operations (
  programme_id TEXT PRIMARY KEY REFERENCES programmes(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);
CREATE TABLE guardian_details (
  application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL,
  emergency_name TEXT NOT NULL DEFAULT '',
  emergency_phone TEXT NOT NULL DEFAULT ''
);
CREATE TABLE consents (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK(purpose IN ('participation','communications','media')),
  granted INTEGER NOT NULL CHECK(granted IN (0,1)),
  notice_version TEXT NOT NULL,
  declared_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  declared_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  verified_at TEXT,
  valid_until TEXT,
  evidence_reference TEXT NOT NULL DEFAULT ''
);
CREATE INDEX consents_application ON consents(application_id,purpose,sequence DESC);
CREATE TABLE concerns (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  programme_id TEXT REFERENCES programmes(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  detail TEXT NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('normal','urgent')),
  status TEXT NOT NULL DEFAULT 'new',
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  review_due TEXT,
  retain_until TEXT NOT NULL,
  legal_hold INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE concern_actions (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  concern_id TEXT NOT NULL REFERENCES concerns(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE provider_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);
CREATE TABLE provider_screening (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE provider_agreements (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);
CREATE TABLE contributions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  verified_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE funding_sources (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE funding_awards (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES funding_sources(id),
  donation_id TEXT UNIQUE REFERENCES enquiries(id),
  reference TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE financial_actions (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  award_id TEXT NOT NULL REFERENCES funding_awards(id),
  programme_id TEXT REFERENCES programmes(id),
  kind TEXT NOT NULL CHECK(kind IN ('receipt','allocate','release','expenditure')),
  amount_minor INTEGER NOT NULL CHECK(amount_minor!=0),
  reference TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  proposed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT
);
CREATE TABLE funding_award_history (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  award_id TEXT NOT NULL REFERENCES funding_awards(id),
  previous_data TEXT NOT NULL,
  next_data TEXT NOT NULL,
  changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE impact_indicators (
  id TEXT PRIMARY KEY,
  programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  data TEXT NOT NULL
);
CREATE TABLE impact_observations (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  indicator_id TEXT NOT NULL REFERENCES impact_indicators(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  verified_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  programme_updates INTEGER NOT NULL DEFAULT 1,
  future_opportunities INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE programme_announcements (
  id TEXT PRIMARY KEY,
  programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  sent_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  recipients INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
