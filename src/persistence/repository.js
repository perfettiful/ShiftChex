const seed = require("./seed");

// Adapter, in-memory for now. to use a real db just write another class
// with the same methods
class InMemoryRepository {
  constructor() { this.reset(); }

  reset() {
    const data = seed();
    this._employees = data.employees;
    this._roles = data.roles;
    this._certTypes = data.certTypes;
    this._period = data.period;
    this._timeOff = data.timeOff;
    this._swaps = [];
    this._notices = [];
    this._audit = [];
    this._today = data.today;
    this._counters = { swap: 1, notice: 1 };
    this.settings = data.settings;
    this.organization = data.organization;
  }

  today() { return this._today; }
  employees() { return this._employees; }
  roles() { return this._roles; }
  certTypes() { return this._certTypes; }
  currentPeriod() { return this._period; }
  timeOff() { return this._timeOff; }
  swaps() { return this._swaps; }
  notices() { return this._notices; }
  audit() { return this._audit; }

  employeesById() { return new Map(this._employees.map((e) => [e.id, e])); }
  rolesById() { return new Map(this._roles.map((r) => [r.id, r])); }
  certTypesById() { return new Map(this._certTypes.map((c) => [c.id, c])); }

  nextId(kind) { return `${kind}-${this._counters[kind]++}`; }
}
module.exports = InMemoryRepository;
