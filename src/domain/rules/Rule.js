// Strategy: base class for all the rules
class Rule {
  constructor(id, title) { this.id = id; this.title = title; }
  // returns a list of Violations
  check(_ctx) { throw new Error(`${this.constructor.name} must implement check(ctx)`); }
}
module.exports = Rule;
