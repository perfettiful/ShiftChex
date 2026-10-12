// database commands. run with npm run db:migrate / db:seed / db:reset / db:status
const fs = require("fs");
const path = require("path");
const { open, migrate, migrations, DEFAULT_FILE } = require("../src/persistence/db");
const Repository = require("../src/persistence/repository");

const file = DEFAULT_FILE;
const rel = path.relative(process.cwd(), file);

const commands = {
  // apply any migrations that haven't run yet
  migrate() {
    const db = open(file);
    const applied = migrate(db);
    db.close();
    console.log(applied.length ? `Applied ${applied.join(", ")}` : "Already up to date.");
  },

  // put the demo week back, keeps the schema
  seed() {
    const repo = new Repository(file);
    repo.reset();
    repo.close();
    console.log(`Seeded ${rel} with the demo week.`);
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
    for (const t of ["employee", "shift", "swap_request", "notice", "audit_entry"]) {
      console.log(`  ${t.padEnd(13)} ${count(t)} rows`);
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
