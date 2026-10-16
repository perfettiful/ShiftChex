# ShiftChex prototype

ICS 370, Group 3.

ShiftChex is a scheduling app for a small restaurant. The manager fills in the
week, and every time they put someone on a shift the app checks it against the
rules (are they available, are they 17, is their alcohol cert expired, etc).
You can't publish until nothing is blocking. Employees get their own screens
for their shifts, availability, time off and swapping shifts.

This prototype has the use cases from Elaboration 1 and 2. All the people and
data in it are made up.

## What you need

Just Node, version 22.13 or newer. We don't use any npm packages, so there's
no `npm install`. SQLite comes built into Node now so that's covered too. It
runs on Mac and Windows.

```
node --version
```

## Setup

```
git clone git@github.com:perfettiful/ShiftChex.git
cd ShiftChex
git update-index --skip-worktree data/shiftchex.db
npm start
```

Then go to http://localhost:3000. Ctrl+C stops the server.

About that `git update-index` line. The database file is committed so we all
start with the same demo data, but it changes whenever you click around in the
app and you don't want to commit that. Running the line once tells git to stop
tracking your local changes to it. The file is in `.gitignore` too, but that
doesn't do anything for a file that was already committed.

## Database

Everything is stored in SQLite in `data/shiftchex.db`. On startup the server
runs any migrations that haven't run yet. If the database is empty it fills it
with the demo week from `src/persistence/seed.js`.

The app doesn't keep any data in memory between requests. Every page load reads
from the database. So if you change something in the file directly (the SQLite
Viewer extension in VS Code works, so does `sqlite3`) you'll see it as soon as
you refresh.

```
npm run db:migrate   # run migrations that haven't run yet
npm run db:seed      # reset to the demo week, keeps the tables
npm run db:reset     # delete the file and build it again
npm run db:status    # shows which migrations ran and some row counts
```

Migrations are the numbered `.sql` files in `src/persistence/migrations/`, and
each one only runs once. If you need to change the schema add a new one, like
`003_something.sql`. Don't edit one that already ran. You can also point the
app at a different file with `SHIFTCHEX_DB`.

## Tests

```
npm test
```

There are 82 tests in `tests/` and they use Node's built in test runner. Every
test gets its own in memory database so they never mess with
`data/shiftchex.db`.

## Demo

All the dates are fixed so the demo goes the same way every time. "Today" in
the app is 10/5/2026 and the schedule is the week of 10/12. Hit Reset demo in
the top right before you start (and whenever you want the original data back).

To sign in you just pick a name from the "Signed in as" dropdown. No
passwords. The server still checks who you are on every request though, so an
employee can't publish or approve anything, and an employee can't do something
as someone else by messing with the request.

### 1. Rule checks

Sign in as R. Chen (Manager). The rule check panel on the right updates every
time you change someone in the grid.

1. Put Riya Iyer on a Server 11am shift. She only works evenings so R1 blocks it.
2. Put Marcus Okoye on Thursday's Bartender shift. His alcohol cert expired
   9/30, and renewals don't get a grace period, so R10 blocks him.
3. Put Lena Haas on Thursday's Bartender shift instead. That works. Now try her
   on Friday. Her alcohol cert runs out 10/15, and R10 looks at the shift date
   instead of today, so Friday gets blocked.
4. Put Kai Obi on Friday's Server 5pm to 11pm shift. He's 17, so R4 blocks it
   because of curfew, and R10 also says servers need an alcohol cert. Friday's
   Host shift blocks him too since that shift checks IDs.
5. Put Priya Shah on any Dishwasher shift. She was hired 8/20 and never got her
   Food Handler Card. She had 30 days and that ran out 9/19.
6. Jordan Lee is already scheduled. Jordan's a new hire who's still inside the
   grace windows, so R10 only warns.
7. Take Dana Park off Tuesday lunch and put Jordan there. Mia is leading that
   night and doesn't have First Aid, so between 4pm and 5pm nobody on site has
   it. R11 blocks it.
8. Try publishing. You can't, the button stays disabled while anything blocks.

### 2. Publishing

Hit Reset demo first. Anything left over from part 1 is still blocking and you
won't be able to publish. Same goes for parts 4 and 5, so don't do those on
this week before you publish (or reset after).

The fresh week starts with 5 blocking problems. 4 of them are empty cells, and
the 5th is that nobody on Sunday night has a Food Manager cert. Fill the cells
in like this:

- Sam Ruiz on Tuesday Server 11am
- Lena Haas on Thursday Bartender
- Ana Diaz on Sunday Cook
- Mia Torres on Sunday Manager / shift lead 4pm

Mia has the Food Manager cert, so that fixes Sunday night too. Blocking goes to
0 and you can publish.

There will still be 4 warnings and that's fine, warnings don't stop you from
publishing:

- R10, Jordan Lee is a new hire who still needs some certs
- R7, Mia is at 42 hours and Ana is at 48 (the limit is 40)
- R9, the week starts in 7 days and we want 14 days notice

If anyone asks about Ana's 48 hours, overtime isn't illegal, so R7 just warns
and leaves it up to the manager.

It also still works if you approve Ana's time off request (10/17) first. Ana
isn't working that Saturday so it doesn't block anything.

Once it's published everyone on the schedule gets a notice. Sign in as Dana
Park and it's at the top of My schedule.

### 3. Swaps

You need the published week from part 2 for this.

1. Sign in as Dana Park and post Monday's Server shift for swap (it's on My
   schedule).
2. Sign in as Riya Iyer and open the Swap board. The shift shows up but she
   can't claim it, and it tells her why. It's a lunch shift.
3. Sign in as Tom Nguyen and claim it.
4. Sign in as the manager and go to Approvals. The rules already ran on it. If
   they'd failed, Approve would be greyed out. Approve it and Tom gets the
   shift.

### 4. Availability (UC-01)

Hit Reset demo so the week is back in draft.

1. Sign in as Tom Nguyen and open Availability.
2. Untick Tuesday and save.
3. Sign in as the manager. R1 is now blocking Tom's Tuesday evening shift.

The Starting date matters. New availability only counts from that day forward,
anything before it still gets checked against the old availability.

### 5. Time off (UC-02 and UC-10)

1. Sign in as Tom Nguyen, open Time off and ask for 10/13 to 10/14.
2. Sign in as the manager. It's in Approvals, under Ana's request that was
   already there. Pending requests don't block anything.
3. Approve it. Now R2 blocks Tom's Tuesday and Wednesday shifts.
4. Sign back in as Tom and the request says approved.

### People tab

The manager's People tab has everyone's roles, pay, availability and certs.
Green means fine. Amber means a new hire still in their window, or a cert that
runs out this week. Red means expired or missing.

## Use cases

| Use case | Status |
|---|---|
| UC-01 Declare weekly availability | done |
| UC-02 Request time off | done |
| UC-03 View my schedule | done |
| UC-04 Post shift for swap | done |
| UC-05 Claim posted shift | done |
| UC-06 Build draft schedule | done (you assign people to the week's shifts) |
| UC-07 Validate schedule against rules | done, all 11 rules |
| UC-08 Publish schedule | done |
| UC-09 Approve or deny swap | done |
| UC-10 Approve or deny time off | done |
| UC-11 Coverage and labor report | Elaboration 3 |
| UC-12 Override a violation | Elaboration 3 |

## Code layout

The folders in `src/` match the four packages in our architecture doc, and
dependencies only point down. `ui` uses `application`. `application` and
`persistence` both use `domain`. `domain` doesn't import anything.

```
src/
  ui/
    server.js      API routes
    public/        index.html, app.css
    public/js/     main.js starts things up, plus small shared helpers
    public/js/views/  one file per screen (schedule, approvals, people, ...)
  application/     controllers, rule engine, rule factory, event bus
  domain/          domain classes
  domain/rules/    Rule interface, CompositeRule and the 11 rules
  persistence/     SQLite repository, migrations, demo data
scripts/db.js      the db:* commands
data/              shiftchex.db
tests/             the tests
```

The `ui` code never goes to the database itself, it only calls controllers.
The repository gets created in one place, `application/wiring.js`, which hands
it to the controllers.

### Patterns

| Pattern | Where |
|---|---|
| Strategy | `domain/rules/Rule.js` and the rules next to it |
| Composite | `domain/rules/CompositeRule.js` |
| Factory | `application/RuleFactory.js` |
| Observer | `application/events.js`, hooked up in `application/wiring.js` |
| Adapter | `persistence/repository.js`, turns SQLite rows into domain objects and back |
| Pure Fabrication | `application/RuleEngine.js` |
| Controller | `ScheduleController.js`, `SwapController.js`, `AvailabilityController.js`, `SessionController.js` in `application/` |
| Information Expert | `Employee.isAvailableOn` and `Employee.certStatus` in `domain/index.js` |

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

R1 through R6, R10 and R11 stop you from publishing. R7 to R9 just warn. R10
also warns about new hires who are still in their grace window. The limits
(hours of rest, curfew, overtime and so on) are settings in the database, not
hardcoded, so one restaurant could use 10 hours of rest and another could use 12.

### Certifications

The full list of which certs each role needs, how long new hires get and how
often each one renews is in [docs/certifications.md](docs/certifications.md).
R10 checks each person against it. R11 checks the restaurant as a whole, since
someone with First Aid and someone with a Food Manager cert have to be on site
the entire time it's open.

## Notes

- The rule checking all happens on the server. The browser only shows what
  comes back, so you can't get around a rule by editing a request.
- Swap claims get checked twice. Once when the employee claims it and again
  when the manager approves, because the schedule could change in between. We
  found that one while building it, it's in the Elaboration 2 writeup.

## Out of scope

- Real logins and passwords. You just pick who you are. The manager isn't on
  the schedule so there's no employee row for them, their account is set up in
  `SessionController` instead.
- Auto-generating schedules
- Payroll, a time clock, texts or emails
