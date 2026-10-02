// Pure Fabrication. not a real domain concept, just keeps all the rule
// checking in one place instead of spread across Shift/Employee
class RuleEngine {
  constructor(root, settings) {
    this.root = root;       // root of the rule tree
    this.settings = settings;
  }

  // check whole period (UC-06, UC-08)
  validate(period, repo) {
    return this.#run({
      scope: "period",
      period,
      shifts: period.shifts,
      ...this.#lookups(repo),
    });
  }

  // check a single assignment for a different employee (UC-05 claim)
  validateAssignment(shift, employeeId, period, repo) {
    const hypothetical = Object.create(Object.getPrototypeOf(shift));
    Object.assign(hypothetical, shift, { employeeId });
    const shifts = period.shifts.map((s) => (s.id === shift.id ? hypothetical : s));
    return this.#run({
      scope: "assignment",
      period,
      shifts,
      subjectId: employeeId,
      ...this.#lookups(repo),
    });
  }

  #lookups(repo) {
    return {
      employeeById: repo.employeesById(),
      roleById: repo.rolesById(),
      certTypeById: repo.certTypesById(),
      settings: this.settings,
      today: repo.today(),
    };
  }

  #run(ctx) {
    const violations = this.root.check(ctx);
    // only care about the claimer's violations here
    const relevant = ctx.scope === "assignment"
      ? violations.filter((v) => this.#concerns(v, ctx))
      : violations;
    return {
      violations: relevant,
      blocking: relevant.filter((v) => v.blocks),
      warnings: relevant.filter((v) => !v.blocks),
      get ok() { return this.blocking.length === 0; },
    };
  }

  #concerns(violation, ctx) {
    const subject = ctx.employeeById.get(ctx.subjectId);
    return subject ? violation.message.includes(subject.name) : true;
  }
}
module.exports = RuleEngine;
