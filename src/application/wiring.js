const Repository = require("../persistence/repository");
const RuleFactory = require("./RuleFactory");
const RuleEngine = require("./RuleEngine");
const ScheduleController = require("./ScheduleController");
const SwapController = require("./SwapController");
const EventBus = require("./events");

// wires everything together
function buildApp() {
  const repo = new Repository();
  const events = new EventBus();
  const engine = new RuleEngine(RuleFactory.rulesFor(repo.organization), repo.settings);
  const schedule = new ScheduleController(repo, engine, events);
  const swaps = new SwapController(repo, engine, events);

  // observers
  events.on("schedule.published", ({ period }) => {
    const affected = new Set(period.shifts.filter((s) => s.isAssigned()).map((s) => s.employeeId));
    affected.forEach((employeeId) => repo.notices().push({
      id: repo.nextId("notice"), employeeId,
      text: `The schedule for the week of ${period.startDate} has been published.`,
    }));
  });
  events.on("schedule.published", ({ period }) => {
    repo.audit().push({ at: repo.today(), what: `Published period ${period.id}` });
  });
  events.on("swap.decided", ({ swap }) => {
    repo.audit().push({ at: repo.today(), what: `Swap ${swap.id} ${swap.status}` });
  });

  return { repo, events, engine, schedule, swaps };
}
module.exports = { buildApp };
