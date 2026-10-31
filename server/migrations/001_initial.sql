CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL CHECK(json_valid(data)));
CREATE TABLE users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','manager','finance','instructor','learner','partner')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE password_resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE programmes (
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)), created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE funding (
  programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  mode TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity>=0), data TEXT NOT NULL CHECK(json_valid(data)),
  PRIMARY KEY(programme_id,mode)
);
CREATE TABLE programme_staff (
  programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('instructor','mentor','judge','facilitator')),
  PRIMARY KEY(programme_id,user_id)
);
CREATE TABLE applications (
  id TEXT PRIMARY KEY, programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','waitlisted','declined','withdrawn')),
  consent_verified INTEGER NOT NULL DEFAULT 0 CHECK(consent_verified IN (0,1)),
  payment_status TEXT NOT NULL DEFAULT 'none' CHECK(payment_status IN ('none','pending','verified','failed','refunded')),
  payment_reference TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(programme_id,user_id), FOREIGN KEY(programme_id,mode) REFERENCES funding(programme_id,mode)
);
CREATE INDEX applications_capacity ON applications(programme_id,mode,status);
CREATE TABLE enquiries (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('contact','volunteer','donation','partner')),
  data TEXT NOT NULL CHECK(json_valid(data)), status TEXT NOT NULL DEFAULT 'new', notes TEXT NOT NULL DEFAULT '',
  received_minor INTEGER NOT NULL DEFAULT 0 CHECK(received_minor>=0),
  receipt_currency TEXT NOT NULL DEFAULT 'KES', receipt_reference TEXT NOT NULL DEFAULT '',
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL, programme_id TEXT REFERENCES programmes(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX enquiries_queue ON enquiries(kind,status,created_at);
CREATE TABLE enquiry_history (
  id TEXT PRIMARY KEY, enquiry_id TEXT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  status TEXT NOT NULL, note TEXT NOT NULL, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE lessons (
  id TEXT PRIMARY KEY, programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  title TEXT NOT NULL, module TEXT NOT NULL, body TEXT NOT NULL, position INTEGER NOT NULL, published INTEGER NOT NULL CHECK(published IN (0,1))
);
CREATE INDEX lessons_order ON lessons(programme_id,position);
CREATE TABLE progress (
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(lesson_id,user_id)
);
CREATE TABLE scheduled_sessions (
  id TEXT PRIMARY KEY, programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  title TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, location TEXT NOT NULL, joining_url TEXT NOT NULL
);
CREATE INDEX scheduled_time ON scheduled_sessions(programme_id,starts_at,ends_at);
CREATE TABLE attendance (
  session_id TEXT NOT NULL REFERENCES scheduled_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('present','absent','excused')),
  PRIMARY KEY(session_id,user_id)
);
CREATE TABLE teams (
  id TEXT PRIMARY KEY, programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  leader_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL,
  join_code TEXT NOT NULL UNIQUE
);
CREATE TABLE team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(team_id,user_id), UNIQUE(programme_id,user_id)
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES teams(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT NOT NULL, url TEXT NOT NULL,
  winner INTEGER NOT NULL DEFAULT 0 CHECK(winner IN (0,1)),
  UNIQUE(programme_id,user_id), UNIQUE(programme_id,team_id)
);
CREATE TABLE scores (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  judge_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(project_id,judge_id)
);
CREATE TABLE ratings (
  programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), PRIMARY KEY(programme_id,user_id)
);
CREATE TABLE notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL, read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX notification_owner ON notifications(user_id,created_at);
CREATE TABLE audit (
  id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, resource_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
