// Strategy: base class for all the rules
class Rule {
  constructor(id, title) { this.id = id; this.title = title; }
  // should return an array of Violations
  check(_ctx) { throw new Error(`${this.constructor.name} must implement check(ctx)`); }
  // period-only rules (coverage, budget, notice) override this
  appliesTo(_scope) { return true; }
}
module.exports = Rule;
