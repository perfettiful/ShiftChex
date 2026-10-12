-- 001: one table per domain class, plus settings and the stuff the observers write

CREATE TABLE organization (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- rule thresholds and the demo date. values are JSON
CREATE TABLE setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE cert_type (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  grace_days  INTEGER NOT NULL DEFAULT 0,
  renew_years INTEGER NOT NULL
);

CREATE TABLE role (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- only_if = the shift duty that makes the cert required, null means always
CREATE TABLE role_cert (
  role_id      TEXT NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  cert_type_id TEXT NOT NULL REFERENCES cert_type(id),
  only_if      TEXT,
  PRIMARY KEY (role_id, cert_type_id)
);

CREATE TABLE employee (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  date_of_birth        TEXT NOT NULL,
  hire_date            TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'active',
  max_hours_preference REAL
);

-- pay rate lives here, not on employee
CREATE TABLE qualification (
  employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  role_id     TEXT NOT NULL REFERENCES role(id),
  hourly_rate REAL NOT NULL,
  PRIMARY KEY (employee_id, role_id)
);

CREATE TABLE certificate (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  cert_type_id TEXT NOT NULL REFERENCES cert_type(id),
  issued_on    TEXT NOT NULL,
  expires_on   TEXT NOT NULL
);

CREATE TABLE availability (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id    TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  weekday        INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time     TEXT NOT NULL,
  end_time       TEXT NOT NULL,
  effective_from TEXT NOT NULL
);

CREATE TABLE time_off_request (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied'))
);

CREATE TABLE schedule_period (
  id           TEXT PRIMARY KEY,
  start_date   TEXT NOT NULL,
  end_date     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  budget       REAL NOT NULL DEFAULT 0,
  published_on TEXT
);

-- employee_id is null when nobody is on the shift yet
CREATE TABLE shift (
  id              TEXT PRIMARY KEY,
  period_id       TEXT NOT NULL REFERENCES schedule_period(id) ON DELETE CASCADE,
  role_id         TEXT NOT NULL REFERENCES role(id),
  employee_id     TEXT REFERENCES employee(id),
  date            TEXT NOT NULL,
  start_time      TEXT NOT NULL,
  end_time        TEXT NOT NULL,
  required        INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published', 'openForSwap', 'claimed')),
  override_reason TEXT
);

-- carriesDrinks, checksIds
CREATE TABLE shift_duty (
  shift_id TEXT NOT NULL REFERENCES shift(id) ON DELETE CASCADE,
  duty     TEXT NOT NULL,
  PRIMARY KEY (shift_id, duty)
);

CREATE TABLE swap_request (
  id         TEXT PRIMARY KEY,
  shift_id   TEXT NOT NULL REFERENCES shift(id) ON DELETE CASCADE,
  posted_by  TEXT NOT NULL REFERENCES employee(id),
  claimed_by TEXT REFERENCES employee(id),
  status     TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'claimed', 'approved', 'denied')),
  posted_on  TEXT NOT NULL,
  decided_on TEXT,
  note       TEXT
);

CREATE TABLE notice (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  text        TEXT NOT NULL
);

CREATE TABLE audit_entry (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  at   TEXT NOT NULL,
  what TEXT NOT NULL
);

-- next number for swap-1, notice-1, etc
CREATE TABLE id_counter (
  kind TEXT PRIMARY KEY,
  next INTEGER NOT NULL
);
