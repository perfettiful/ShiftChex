const { addDays } = require("../domain/format");

// Pure Fabrication. there's no "rule engine" in a real restaurant, we made it
// up so all the checking lives in one spot instead of spread over Shift/Employee
class RuleEngine {
  constructor(root) {
    this.root = root;
  }

  // the whole week (UC-06, UC-07, UC-08)
  validate(period, repo) {
    return result(this.root.check(this.#context(period, repo)));
  }

  // what putting employeeId on this shift would change (claims, approvals, overrides).
  // compares the week before and after, and keeps what's new for that person or the whole week
  validateAssignment(shift, employeeId, period, repo) {
    const hypothetical = Object.create(Object.getPrototypeOf(shift));
    // an override belongs to the person it was given for, so it doesn't come along
    Object.assign(hypothetical, shift, { employeeId, overrideReason: null });
    const ctx = this.#context(period, repo);
    const before = new Set(this.root.check(ctx).map(key));
    const after = this.root.check({ ...ctx, shifts: period.shifts.map((s) => (s.id === shift.id ? hypothetical : s)) });
    return result(after.filter((v) => !before.has(key(v)) && (v.employeeId === employeeId || v.employeeId === null)));
  }

  #context(period, repo) {
    return {
      period,
      shifts: period.shifts,
      // the day before and after the week, for R3. only from published weeks: a draft
      // can still change, and its own check catches it against this one
      nearby: repo.shiftsBetween(addDays(period.startDate, -1), addDays(period.endDate, 1), { publishedOnly: true })
        .filter((s) => s.periodId !== period.id),
      employeeById: repo.employeesById(),
      roleById: repo.rolesById(),
      certTypeById: repo.certTypesById(),
      // read every time so changing a setting doesn't need a restart
      settings: repo.settings(),
      today: repo.today(),
    };
  }
}

const key = (v) => `${v.ruleId}|${v.shiftId}|${v.message}`;

function result(violations) {
  return {
    violations,
    blocking: violations.filter((v) => v.blocks),
    warnings: violations.filter((v) => !v.blocks),
    get ok() { return this.blocking.length === 0; },
  };
}

module.exports = RuleEngine;
