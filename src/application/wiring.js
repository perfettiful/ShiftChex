const Repository = require("../persistence/repository");
const RuleFactory = require("./RuleFactory");
const RuleEngine = require("./RuleEngine");
const ScheduleController = require("./ScheduleController");
const SwapController = require("./SwapController");
const AvailabilityController = require("./AvailabilityController");
const ReportController = require("./ReportController");
const SessionController = require("./SessionController");
const StaffController = require("./StaffController");
const EventBus = require("./events");
const { subscribe } = require("./observers");

// db: sqlite file path, or ":memory:" for tests. defaults to data/shiftchex.db
function buildApp({ db } = {}) {
  const repo = new Repository(db);
  const events = new EventBus();
  const engine = new RuleEngine(RuleFactory.rulesFor());
  const schedule = new ScheduleController(repo, engine, events);
  const swaps = new SwapController(repo, engine, events);
  const availability = new AvailabilityController(repo);
  const report = new ReportController(repo);
  const session = new SessionController(repo, schedule, swaps);
  const staff = new StaffController(repo, events);
  subscribe(events, repo);

  return { repo, events, engine, schedule, swaps, availability, report, session, staff, file: repo.file };
}
module.exports = { buildApp };
