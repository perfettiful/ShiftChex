// database commands. run with npm run db:migrate / db:seed / db:reset / db:status
const fs = require("fs");
const path = require("path");
const { open, migrate, migrations, DEFAULT_FILE } = require("../src/persistence/db");
const Repository = require("../src/persistence/repository");

const file = DEFAULT_FILE;
const rel = path.relative(process.cwd(), file);

const commands = {
  migrate() {
    const db = open(file);
    const applied = migrate(db);
    db.close();
    console.log(applied.length ? `Applied ${applied.join(", ")}` : "Already up to date.");
  },

  // put the demo weeks back, keeps the schema
  seed() {
    const repo = new Repository(file);
    repo.reset();
    repo.close();
    console.log(`Seeded ${rel} with the demo weeks.`);
  },

  // delete the file and build it again from the migrations
  reset() {
    fs.rmSync(file, { force: true });
    new Repository(file).close();
    console.log(`Rebuilt ${rel} from scratch.`);
  },

  status() {
    if (!fs.existsSync(file)) return console.log(`${rel} doesn't exist yet. Run npm run db:migrate.`);
    const db = open(file);
    const done = migrations(db);
    const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    console.log(`Database: ${rel}`);
    done.forEach((m) => console.log(`  ${m.name}  applied ${m.applied_on}`));
    // tables from before a migration ran won't be there yet
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
    for (const t of ["schedule_period", "shift", "employee", "user_account", "swap_request",
                     "time_off_request", "notice", "audit_entry"].filter((x) => tables.has(x))) {
      console.log(`  ${t.padEnd(17)} ${count(t)} rows`);
    }
    db.close();
  },
};

const cmd = process.argv[2];
if (!commands[cmd]) {
  console.log("Usage: node scripts/db.js migrate | seed | reset | status");
  process.exit(1);
}
commands[cmd]();
