const Rule = require("./Rule");

// Composite: a rule made of other rules, same interface as Rule
class CompositeRule extends Rule {
  constructor(id, title, children = []) {
    super(id, title);
    this.children = [...children];
  }
  check(ctx) { return this.children.flatMap((child) => child.check(ctx)); }
}
module.exports = CompositeRule;
