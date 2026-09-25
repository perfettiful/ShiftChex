# ShiftChex prototype

## Running it

```
node server.js
```

Then go to http://localhost:3000. You just need Node 18+, nothing to install
(no npm install, no database). Works on Windows and Mac.

## Demo steps

**Schedule builder.** Sign in as R. Chen (Manager). The rule check panel on the
right updates whenever you change an assignment.

1. Put Riya Iyer on a Server 11am shift. She only works evenings so R1 blocks it
   and shows her hours.
2. Put Marcus Okoye on a Bartender shift. His cert expired Sept 30 so R5 blocks
   it (it checks the shift date, not today's date).
3. Put Kai Obi on a Server 5pm-11pm shift. He's 17 so R4 blocks it because of
   curfew.
4. Try publishing. It won't let you while there are blocking violations.
5. Fill in the 3 empty cells and publish. Everyone on the schedule gets a notice.

**Swaps.** Sign in as an employee and post one of your shifts, then sign in as
someone else and open the swap board. Shifts you can't take still show up with
the reason. Claim one you can take, then switch to the manager and go to
Approvals. The rule check result is already there, and if it failed the approve
button is disabled.

`Reset demo` resets all the data.

## Code layout

Folders match the packages in our design docs. Dependencies only go downward,
and `domain` doesn't import anything from the other folders.

```
public/            browser client (UI only)
src/
  application/     controllers, rule engine, factory, event bus
  domain/          domain model classes
  domain/rules/    Rule interface, CompositeRule, the 9 rules
  persistence/     repository + demo data
```

### Patterns

| Pattern | File |
|---|---|
| Strategy | `domain/rules/Rule.js` + the rules in that folder |
| Composite | `domain/rules/CompositeRule.js` |
| Factory | `application/RuleFactory.js` |
| Observer | `application/events.js`, hooked up in `application/wiring.js` |
| Adapter | `persistence/repository.js` |
| Pure Fabrication | `application/RuleEngine.js` |
| Controller | `application/ScheduleController.js`, `SwapController.js` |
| Information Expert | `Employee.isAvailableOn`, `Shift.isCovered` in `domain/index.js` |

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

R1-R6 block publishing, R7-R9 are just warnings. The thresholds are in
`persistence/seed.js` under `settings` instead of hardcoded in the rules, so
one business could use 10 hours of rest and another could use 12.

## Notes

- All the rule checking is done on the server in `RuleEngine`. The browser just
  displays what it gets back, so you can't get around a rule by editing the
  request.
- Swap claims get checked twice: once when the employee claims it, and again
  when the manager approves, since the schedule could change in between. We
  found this while building it (it's written up in Elaboration 2).

## Out of scope

- No real login/passwords, there's just a role picker (documented as out of
  scope)
- No auto-generating schedules
- No payroll, time clock, or text/email notifications
- Data is in memory only and resets when the server restarts
