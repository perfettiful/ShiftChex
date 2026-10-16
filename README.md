# ShiftChex prototype

## Running it

```
npm start
```

Then go to http://localhost:3000. You need Node 22.13 or newer and nothing else
(no npm install). Works on Windows and Mac.

## Database

Data is stored in SQLite using Node's built-in `node:sqlite`, so there's no
database server to install. The file is `data/shiftchex.db`. On startup the
server runs any new migrations, and if the database is empty it loads the demo
week from `seed.js`.

Nothing is cached in memory. Every screen is built from fresh queries, so if you
change a row in the file (SQLite Viewer, `sqlite3`) it shows up on the next
refresh without restarting the server.

The committed `data/shiftchex.db` is the demo snapshot and `data/*.db` is in
`.gitignore`. Git keeps watching a file that's already tracked though, so run
this once in your clone to keep your local demo changes out of commits:

```
git update-index --skip-worktree data/shiftchex.db
```

```
npm run db:migrate   # apply any migrations that haven't run yet
npm run db:seed      # put the demo week back, keeps the schema
npm run db:reset     # delete the file and rebuild it from the migrations
npm run db:status    # which migrations ran and row counts
```

Migrations are numbered `.sql` files in `src/persistence/migrations/`. Each one
runs once, inside a transaction, and gets recorded in `schema_migrations`. To
change the schema, add the next file (`003_something.sql`), don't edit one that
already ran. Set `SHIFTCHEX_DB` to use a different file.

## Tests

```
npm test
```

81 tests in `tests/`, using Node's built-in test runner. No packages. Each test
gets its own in-memory database, so running them never touches `data/shiftchex.db`.

## Demo steps

**Signing in.** Pick a name from "Signed in as". There are no passwords (out of
scope), but the server checks every action against who's signed in, so an
employee can't publish or approve anything, and employee actions always apply
to the signed in employee.

**Schedule builder.** Sign in as R. Chen (Manager). The rule check panel on the
right updates whenever you change an assignment.

1. Put Riya Iyer on a Server 11am shift. She only works evenings so R1 blocks it
   and shows her hours.
2. Put Marcus Okoye on Thursday's Bartender shift. His alcohol cert expired
   9/30 and renewals don't get a grace period, so R10 blocks it.
3. Put Lena Haas on Thursday's Bartender shift, which works. Then try her on
   Friday. Her alcohol cert runs out 10/15, and R10 checks the shift date, not
   today's date.
4. Put Kai Obi on Friday's Server 5pm-11pm shift. He's 17 so R4 blocks it for
   curfew, and R10 flags that servers need an alcohol cert. Kai on Friday's Host
   shift gets blocked too, since that one checks IDs.
5. Put Priya Shah on any Dishwasher shift. She was hired 8/20 and never got her
   Food Handler Card, so the 30 day window is closed.
6. Jordan Lee is already scheduled as a new hire who's still inside the grace
   windows, so R10 only warns.
7. Swap Dana off Tuesday lunch for Jordan. Mia is leading that night and has no
   First Aid, so from 4pm to 5pm nobody on site does and R11 blocks it.
8. Try publishing. It won't let you while there are blocking violations.
9. Fill in the 4 empty cells (Sam on Tuesday lunch, Lena on Thursday bar, Ana
   on Sunday cook, Mia on Sunday PM lead) and publish. Everyone on the schedule
   gets a notice.

The People tab shows everyone's cert checklist: green is good, amber is a new
hire inside the window or a cert running out this week, red is expired or
missing.

**Availability (UC-01).** Sign in as Tom Nguyen and open Availability. Untick
Tuesday and save. Switch to the manager: R1 now blocks Tom's Tuesday evening
shift. A declaration only applies from its start date, earlier dates are still
checked against the old one.

**Time off (UC-02, UC-10).** As Tom, open Time off and ask for 10/13 to 10/14.
It shows up under the manager's Approvals. Pending doesn't block anything. Once
it's approved, R2 blocks Tom's shifts on those days and his request shows as
approved.

**Notices.** After publishing, everyone on the schedule sees a notice on My
schedule.

**Swaps.** Sign in as an employee and post one of your shifts, then sign in as
someone else and open the swap board. Shifts you can't take still show up with
the reason. Claim one you can take, then switch to the manager and go to
Approvals. The rule check result is already there, and if it failed the approve
button is disabled.

`Reset demo` puts the demo week back in the database (same as `npm run db:seed`).

## Code layout

Folders match the packages in our design docs. Dependencies only go downward,
and `domain` doesn't import anything from the other folders.

```
src/
  ui/              server.js (HTTP routes) and public/ (browser client)
  application/     controllers, rule engine, factory, event bus
  domain/          domain model classes
  domain/rules/    Rule interface, CompositeRule, the 11 rules
  persistence/     sqlite repository, migrations, demo data
scripts/db.js      db:migrate / db:seed / db:reset / db:status
data/              shiftchex.db
```

`ui` only talks to the controllers in `application`, never to the repository.
`wiring.js` is the one place that creates the repository and hands it to the
controllers.

### Patterns

| Pattern | File |
|---|---|
| Strategy | `domain/rules/Rule.js` + the rules in that folder |
| Composite | `domain/rules/CompositeRule.js` |
| Factory | `application/RuleFactory.js` |
| Observer | `application/events.js`, hooked up in `application/wiring.js` |
| Adapter | `persistence/repository.js` (sqlite rows to domain objects and back) |
| Pure Fabrication | `application/RuleEngine.js` |
| Controller | `application/ScheduleController.js`, `SwapController.js`, `AvailabilityController.js`, `SessionController.js` |
| Information Expert | `Employee.isAvailableOn`, `Employee.certStatus` in `domain/index.js` |

### Rules

- R1 availability
- R2 approved time off
- R3 minimum rest
- R4 under 18
- R5 role qualification
- R6 coverage
- R7 overtime
- R8 labour budget
- R9 advance notice
- R10 required certifications
- R11 on-site certifications

R1-R6, R10 and R11 block publishing, R7-R9 are just warnings (R10 also warns
about new hires still in their grace window). The thresholds are in
`persistence/seed.js` under `settings` instead of hardcoded in the rules, so
one business could use 10 hours of rest and another could use 12.

### Certifications

The full list of which certs each role needs, the new hire windows and the
renewal periods is in [docs/certifications.md](docs/certifications.md). R10
checks each person against it and R11 checks the whole restaurant (First Aid
and Food Manager on site the whole time, set by `siteCerts` in `settings`).

## Notes

- All the rule checking is done on the server in `RuleEngine`. The browser just
  displays what it gets back, so you can't get around a rule by editing the
  request.
- Swap claims get checked twice: once when the employee claims it, and again
  when the manager approves, since the schedule could change in between. We
  found this while building it (it's written up in Elaboration 2).

## Out of scope

- No real login/passwords, you pick who you are (documented as out of scope).
  The manager isn't on the schedule, so their account is defined in
  `SessionController` instead of the database
- No auto-generating schedules
- No payroll, time clock, or text/email notifications
