const Rule = require("./Rule");

// Composite: a rule made of other rules, same interface as Rule
class CompositeRule extends Rule {
  constructor(id, title, children = []) {
    super(id, title);
    this.children = [...children];
  }
  add(rule) { this.children.push(rule); return this; }
  appliesTo(scope) { return this.children.some((c) => c.appliesTo(scope)); }
  check(ctx) {
    const out = [];
    for (const child of this.children) {
      if (!child.appliesTo(ctx.scope)) continue;
      out.push(...child.check(ctx));
    }
    return out;
  }
}
module.exports = CompositeRule;
