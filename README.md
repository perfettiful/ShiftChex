# ShiftChex prototype

ShiftChex is a scheduling app for a small restaurant. The manager fills in the
week, and every time they put someone on a shift the app checks it against the
rules (are they available, are they 17, is their alcohol cert expired, etc).
You can't publish until nothing is blocking. Employees get their own screens
for their shifts, availability, time off and swapping shifts.

All twelve use cases are in. All the people and data in it are made up.

## What you need

Node 22.13 or newer. There are no npm packages, so there's no `npm install`,
and SQLite is built into Node. Runs on Mac and Windows.

## Setup

```
git clone git@github.com:perfettiful/ShiftChex.git
cd ShiftChex
git update-index --skip-worktree data/shiftchex.db
npm start
```

That opens the landing page at http://localhost:3000, and "Try the demo" goes
to the app. Ctrl+C stops it. Use `node src/ui/server.js` if you don't want a new
tab every time.

Each screen has its own address: `/login`, then `/schedule`, `/approvals`,
`/report` and `/people` for the manager, and `/my-schedule`, `/availability`,
`/time-off` and `/swap-board` for employees. The weekly screens keep the week in
the address too, like `/report?week=2026-11-23`.

The database file is committed so everyone starts with the same demo data. The
`update-index` line stops git from picking up your local changes to it. If the
app looks like it's missing data after a pull, hit Reset demo or run
`npm run db:reset`.

## Database

Everything is in SQLite at `data/shiftchex.db`. On startup the server runs any
migrations that haven't run yet, and fills an empty database with the demo data
from `src/persistence/seed.js`. Nothing is kept in memory between requests, so
changes made straight to the file (SQLite Viewer in VS Code, `sqlite3`) show up
on the next refresh.

```
npm run db:migrate   # run migrations that haven't run yet
npm run db:seed      # reset to the demo data, keeps the tables
npm run db:reset     # delete the file and build it again
npm run db:status    # which migrations ran, and row counts
```

Migrations are the numbered `.sql` files in `src/persistence/migrations/`. Each
runs once. To change the schema add a new one, don't edit one that already ran.
`SHIFTCHEX_DB` points the app at a different file.

| Migration | What it does |
|---|---|
| `001_create_tables.sql` | one table per domain class, plus settings and the audit log |
| `002_add_indexes.sql` | indexes for the rules and the swap board |
| `003_add_login.sql` | accounts and sessions for signing in |
| `004_add_notice_date.sql` | notices get a date |
| `005_keep_swap_history.sql` | withdrawn and cancelled swaps stay on record |

## Tests

```
npm test
```

173 tests using Node's built in test runner. They use in memory databases (a
few use a temp file), so they never touch `data/shiftchex.db`.

| File | Covers |
|---|---|
| `rules.test.js` | each rule on its own, edges included |
| `engine.test.js` | the rule tree, the factory and the engine |
| `contracts.test.js` | the postconditions from our operation contracts |
| `availability.test.js` | UC-01 and UC-02 |
| `override.test.js` | UC-12 |
| `report.test.js` | UC-11 |
| `weeks.test.js` | the demo weeks and the swap lifecycle |
| `repository.test.js` | migrations, reads, writes, reset |
| `session.test.js` | signing in, permissions, the API end to end |
| `server.test.js` | bad requests, file serving, cookies, a locked database |

## Deploying

`.github/workflows/ci-cd.yml` runs the tests on every push. On `main` it also
builds the Docker image, pushes it to the DigitalOcean container registry (and
makes a free one if there isn't one), then creates or updates the App Platform
app from `.do/app.yaml`. The live URL ends up on the run's summary page.

It needs one repo secret, a DigitalOcean API token with access to apps and the
container registry:

```
gh secret set DIGITALOCEAN_ACCESS_TOKEN --repo perfettiful/ShiftChex
```

Without it, the tests still run and the deploy is skipped. The app costs about
$5 a month. The database lives in the container, so every deploy or restart
starts from fresh demo data. To roll back, run the workflow by hand with an
older image tag (`gh workflow run ci-cd.yml -f image_tag=sha-abc1234`).

To run the image locally: `docker build -t shiftchex . && docker run --rm -p 8080:8080 shiftchex`

## Demo

The dates are fixed so the demo goes the same way every time. "Today" is Monday
10/5/2026.

- **Week of 10/5** is published, and people are already swapping shifts on it.
- **Week of 10/12** is the draft the manager is building. Most of the demo uses it.
- **10/19 through the week of 12/28** have the usual roster filled in. Closed on
  Thanksgiving, Christmas Day and New Year's Day.

A few cert renewals are already booked (Grace 10/14, Lena 10/17, Jordan 10/19
and 11/16). A cert only counts from the day it's issued, so Lena can't bartend
on 10/16.

Sign in with the "Demo account" dropdown, which fills in the username and
password (`shiftchex` for everyone). Usernames look like `dana.park`, and the
manager is `r.chen`. The server checks the session cookie on every request, so
an employee can't publish, approve, or act as someone else. The manager has a
Reset demo button in the top right, use it before you start. The arrows and
menu at the top of the Schedule, Report and People tabs switch weeks.

### 1. Rule checks (UC-06, UC-07)

Sign in as R. Chen. The Schedule tab opens on next week, and the rule check
panel updates every time you change someone in the grid.

1. Put Riya Iyer on a Server 11am shift. She only works evenings, so R1 blocks it.
2. Put Marcus Okoye on Thursday's Bartender shift. His alcohol cert expired 9/30
   and renewals get no grace period, so R10 blocks him.
3. Put Lena Haas on Thursday's Bartender shift instead. That works. Try her on
   Friday: her card runs out 10/15 and the new one starts 10/17, and R10 checks
   the shift date, not today.
4. Put Kai Obi on Friday's Server 5pm shift. He's 17, so R4 blocks it for
   curfew, and R10 says servers need an alcohol cert.
5. Put Priya Shah on any Dishwasher shift. Her 30 days to get a Food Handler
   Card ran out 9/19.
6. Jordan Lee is a new hire still inside his grace windows, so R10 only warns.
7. Take Dana Park off Tuesday lunch and put Jordan there. Nobody on site has
   First Aid from 4pm to 5pm, so R11 blocks it.
8. Put Omar Farah on Monday's 8am lead shift. R3 blocks it, partly because he
   closes Sunday night on this week's schedule.
9. Try publishing. The button stays disabled while anything blocks.

### 2. Override a violation (UC-12)

1. Put Ben Cole on Sunday's empty Cook shift. He doesn't work Sundays, so R1
   blocks it and an Override link shows up under the cell.
2. Click Override. It won't go through without a reason. With one, R1 turns
   into a warning that shows the reason.
3. Only R1 can be overridden. Override Riya on Tuesday lunch and R3 still blocks,
   since she's on Tuesday dinner too.
4. The Report tab lists every override and the activity log records it. This
   week already has one, Ben covering Sunday 10/11.

### 3. Publishing (UC-08)

Hit Reset demo first. Next week starts with 5 blocking problems, 4 empty cells
and nobody with a Food Manager cert on Sunday night. Fill them in:

- Sam Ruiz on Tuesday Server 11am
- Lena Haas on Thursday Bartender
- Ana Diaz on Sunday Cook
- Mia Torres on Sunday lead 4pm (she has the Food Manager cert)

Blocking goes to 0 and you can publish. The 4 warnings left don't stop it: R10
for Jordan, R7 for Mia (42 hours) and Ana (48), and R9 because the week is 7
days out instead of 14. Everyone on the week gets a notice, and it shows up on
their My schedule.

### 4. Swaps (UC-04, UC-05, UC-09)

These are on this week, which is already published.

1. As Riya, open the Swap board. She can't claim Dana's Thursday lunch, and it
   says why.
2. As Sam, claim Dana's Thursday lunch. Tom's Friday bar shift is there too, but
   Sam's already on Friday dinner.
3. As Lena, Tom's Friday bar shift is open to her. Marcus's lapsed cert stops him.
4. As the manager, open Approvals. Marcus taking Luis's Wednesday dish shift
   passes. Ben's claim on Jordan's Wednesday lunch passed when he made it, but
   his 10/7 day off was approved since, so the second check fails and Approve is
   greyed out.
5. As Dana, Take it back pulls her Thursday lunch off the board.

Unpublishing this week cancels its open swaps, and everyone involved gets a notice.

### 5. Availability (UC-01)

As Tom, untick Tuesday in Availability and save. As the manager, R1 now blocks
his Tuesday dinners. New availability only counts from its Starting date, so
starting it 10/12 leaves this week alone.

### 6. Time off (UC-02, UC-10)

1. As Tom, ask for 10/13 to 10/14. Pending requests can be cancelled.
2. As the manager, it's in Approvals. Each request lists the shifts it lands on.
3. Approve it, and R2 blocks his Tuesday and Wednesday shifts. Tom gets a notice.

### 7. Coverage and labor report (UC-11)

The Report tab shows, for any week: open shifts by day, labor against the
budget by day and role, everyone's hours (over 40 red, 36 and up amber),
certs that are a problem or come due in the next 30 days, overrides, and the
activity log. Print gives you just the report.

## Use cases

| Use case | Status |
|---|---|
| UC-01 Declare weekly availability | done |
| UC-02 Request time off | done |
| UC-03 View my schedule | done |
| UC-04 Post shift for swap | done |
| UC-05 Claim posted shift | done |
| UC-06 Build draft schedule | done |
| UC-07 Validate schedule against rules | done, all 11 rules |
| UC-08 Publish schedule | done |
| UC-09 Approve or deny swap | done |
| UC-10 Approve or deny time off | done |
| UC-11 Coverage and labor report | done |
| UC-12 Override a violation | done |

## Code layout

The folders in `src/` are the four packages from our architecture doc, and
dependencies only point down: `ui` uses `application`, which uses `domain`, and
`persistence` uses `domain`. The repository is created once, in
`application/wiring.js`, and the `ui` only calls controllers.

```
src/
  ui/               server.js (API and page routes), public/ (landing page and the app)
  application/      controllers, rule engine, rule factory, event bus, observers
  domain/           domain classes, date formats, notice and audit wording
  domain/rules/     Rule, CompositeRule and the 11 rules
  persistence/      SQLite repository, migrations, demo data
scripts/            db:* commands and the diagram renderer
data/               shiftchex.db
tests/              the tests
```

`app.css` keeps colors, type, spacing and page widths as variables at the top.
Pages are centered (1120px, 1440px for the grid, 780px for single column
screens), and the layout steps down at 1360px, 900px and 640px. Icons are a
small set from Lucide (ISC license) kept in `public/js/icons.js`.

### Diagrams

The Mermaid sources are under `diagrams/mmd/` and the pictures under
`diagrams/images/`, in matching folders. [diagrams/README.md](diagrams/README.md)
lists them. After changing a `.mmd` file run `npm run diagrams`.

### Patterns

| Pattern | Where |
|---|---|
| Strategy | `domain/rules/Rule.js` and the rules |
| Composite | `domain/rules/CompositeRule.js` |
| Factory | `application/RuleFactory.js` |
| Observer | `application/events.js` and `application/observers.js` |
| Adapter | `persistence/repository.js` |
| Facade, Pure Fabrication | `application/RuleEngine.js` |
| Controller | the five controllers in `application/` |
| High Cohesion | swaps and the report have their own controllers |
| Information Expert | `Employee` (availability, certs) and `SchedulePeriod` (labor cost) |

### Rules

R1 availability, R2 approved time off, R3 minimum rest, R4 under 18, R5 role
qualification, R6 coverage, R7 overtime, R8 labor budget, R9 advance notice,
R10 required certifications, R11 on-site certifications.

R7 to R9 only warn, the rest block publishing. R1 is the only one a manager can
override. Thresholds (rest hours, curfew, overtime) are settings in the
database. Which certs each role needs is in
[docs/certifications.md](docs/certifications.md).

## Notes

- All rule checking happens on the server, so editing a request can't get
  around a rule.
- Swap claims are checked twice, when claimed and again when approved, since the
  schedule can change in between. Ben's claim in the demo shows it.
- A claim or override is checked against the week before and after the change,
  and only what's new for that person or the whole week counts against it.
- R3 also checks the published weeks either side, so closing Sunday and opening
  Monday is caught. Rest uses wall clock hours, so the time zone doesn't matter.
- A published week can't be edited, only unpublished. Every change is saved
  together with the notices and audit entries it causes.
- Employees only get published weeks and their own details. Sign ins last a week.

## Out of scope

- Registering accounts or changing passwords. Demo accounts come with the demo data.
- Editing a published week in place
- Auto-generating schedules
- Payroll, a time clock, texts or emails
