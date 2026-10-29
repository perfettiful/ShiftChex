-- 003: demo sign in. one account per employee, plus the manager who isn't one

CREATE TABLE user_account (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('manager', 'employee')),
  employee_id   TEXT REFERENCES employee(id) ON DELETE CASCADE
);

-- one row per signed in browser. the token is what's in the cookie.
-- no foreign key so a demo reset doesn't sign everyone out
CREATE TABLE login_session (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
