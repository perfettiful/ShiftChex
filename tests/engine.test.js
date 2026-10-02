const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/domain/rules");
const RuleFactory = require("../src/application/RuleFactory");
const { ctx, shift, buildApp, publishable, find, ruleIds } = require("./helpers");

describe("engine tests", () => {
  test("the factory gives one rule, split into blocking and warnings", () => {
    const [blocking, warnings] = RuleFactory.rulesFor({}).children;
    assert.equal(blocking.children.length, 8);
    assert.equal(warnings.children.length, 3);
  });

  test("a composite returns whatever its children return", () => {
    const both = new R.CompositeRule("c", "c", [new R.CoverageRule(), new R.CoverageRule()]);
    assert.equal(both.check(ctx({ shifts: [shift()] })).length, 2);
  });

  test("a composite skips children that don't fit the scope", () => {
    const c = new R.CompositeRule("c", "c", [new R.CoverageRule()]);
    assert.equal(c.check(ctx({ shifts: [shift()], scope: "assignment" })).length, 0);
  });

  test("the seeded week starts with its five known problems", () => {
    const { schedule } = buildApp();
    // four empty shifts, and nobody with a food manager cert sunday night
    assert.deepEqual(ruleIds(schedule.validate().blocking), ["R11", "R6", "R6", "R6", "R6"]);
  });

  test("filling the gaps makes the week ok", () => {
    const result = publishable().schedule.validate();
    assert.equal(result.ok, true);
    assert.equal(result.blocking.length, 0);
  });

  test("checking someone else on a shift doesn't change the real one", () => {
    const app = buildApp();
    const s = find(app, "2026-10-16", "server", "17:00");
    const before = s.employeeId;
    app.engine.validateAssignment(s, "e9", app.repo.currentPeriod(), app.repo);
    assert.equal(s.employeeId, before);
  });

  test("an assignment check only reports the person being checked", () => {
    const app = buildApp();
    const s = find(app, "2026-10-16", "server", "17:00");
    const result = app.engine.validateAssignment(s, "e9", app.repo.currentPeriod(), app.repo);
    result.violations.forEach((v) => assert.match(v.message, /Kai Obi/));
  });

  test("period-only rules stay out of an assignment check", () => {
    const app = buildApp();
    const s = find(app, "2026-10-16", "server", "17:00");
    const ids = ruleIds(app.engine.validateAssignment(s, "e9", app.repo.currentPeriod(), app.repo).violations);
    ["R6", "R8", "R9", "R11"].forEach((id) => assert.ok(!ids.includes(id), `${id} showed up`));
  });

  test("an assignment check catches what's wrong with that person", () => {
    // kai is 17, this shift ends at 11pm
    const app = buildApp();
    const s = find(app, "2026-10-16", "server", "17:00");
    const ids = ruleIds(app.engine.validateAssignment(s, "e9", app.repo.currentPeriod(), app.repo).blocking);
    assert.ok(ids.includes("R4"));
  });
});
