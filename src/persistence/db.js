const fs = require("fs");
const path = require("path");
// node:sqlite works fine but still prints an "experimental" warning on load. hide just that one
const { emitWarning } = process;
process.emitWarning = (w, ...rest) => (/SQLite/.test(String(w)) ? undefined : emitWarning.call(process, w, ...rest));
const { DatabaseSync } = require("node:sqlite");
process.emitWarning = emitWarning;

const DEFAULT_FILE = process.env.SHIFTCHEX_DB || path.join(__dirname, "../../data/shiftchex.db");
const MIGRATIONS = path.join(__dirname, "migrations");

// ":memory:" for tests, a file path otherwise
function open(file = DEFAULT_FILE) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  // if something else has the file locked (sqlite3, a db viewer), wait for it instead of failing
  db.exec("PRAGMA busy_timeout = 2000");
  return db;
}

// runs any NNN_name.sql in migrations/ that isn't in schema_migrations yet, in order
function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_on TEXT NOT NULL
  )`);
  const done = new Set(db.prepare("SELECT version FROM schema_migrations").all().map((r) => r.version));
  const files = fs.readdirSync(MIGRATIONS).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const applied = [];
  for (const file of files) {
    const version = parseInt(file, 10);
    if (done.has(version)) continue;
    // each migration is all or nothing
    db.exec("BEGIN");
    try {
      db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
      db.prepare("INSERT INTO schema_migrations (version, name, applied_on) VALUES (?, ?, ?)")
        .run(version, file, new Date().toISOString());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
    applied.push(file);
  }
  return applied;
}

function migrations(db) {
  return db.prepare("SELECT version, name, applied_on FROM schema_migrations ORDER BY version").all();
}

module.exports = { open, migrate, migrations, DEFAULT_FILE };
