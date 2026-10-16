const Repository = require("../persistence/repository");
const RuleFactory = require("./RuleFactory");
const RuleEngine = require("./RuleEngine");
const ScheduleController = require("./ScheduleController");
const SwapController = require("./SwapController");
const AvailabilityController = require("./AvailabilityController");
const SessionController = require("./SessionController");
const EventBus = require("./events");

// wires everything together
// db: sqlite file path, or ":memory:" for tests. defaults to data/shiftchex.db
function buildApp({ db } = {}) {
  const repo = new Repository(db);
  const events = new EventBus();
  const engine = new RuleEngine(RuleFactory.rulesFor(repo.organization()));
  const schedule = new ScheduleController(repo, engine, events);
  const swaps = new SwapController(repo, engine, events);
  const availability = new AvailabilityController(repo);
  const session = new SessionController(repo, schedule, swaps);

  // observers
  events.on("schedule.published", ({ period }) => {
    const affected = new Set(period.shifts.filter((s) => s.isAssigned()).map((s) => s.employeeId));
    affected.forEach((employeeId) => repo.addNotice({
      id: repo.nextId("notice"), employeeId,
      text: `The schedule for the week of ${period.startDate} has been published.`,
    }));
  });
  events.on("schedule.published", ({ period }) => {
    repo.addAudit({ at: repo.today(), what: `Published period ${period.id}` });
  });
  events.on("swap.decided", ({ swap }) => {
    repo.addAudit({ at: repo.today(), what: `Swap ${swap.id} ${swap.status}` });
  });

  return { repo, events, engine, schedule, swaps, availability, session, file: repo.file };
}
module.exports = { buildApp };
