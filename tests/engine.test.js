const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/domain/rules");
const RuleFactory = require("../src/application/RuleFactory");
const { ctx, shift, buildApp, publishable, find, ruleIds } = require("./helpers");

describe("engine tests", () => {
  test("the factory gives one rule, split into blocking and warnings", () => {
    const [blocking, warnings] = RuleFactory.rulesFor().children;
    assert.equal(blocking.children.length, 8);
    assert.equal(warnings.children.length, 3);
  });

  test("a composite returns whatever its children return", () => {
    const both = new R.CompositeRule("c", "c", [new R.CoverageRule(), new R.CoverageRule()]);
    assert.equal(both.check(ctx({ shifts: [shift()] })).length, 2);
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

  describe("checking one assignment", () => {
    // kai is 17 with no alcohol cert. friday dinner ends at 11pm
    const check = (app, who = "e9") => app.engine.validateAssignment(
      find(app, "2026-10-16", "server", "17:00"), who, app.repo.workingPeriod(), app.repo);

    test("doesn't change the real shift", () => {
      const app = buildApp();
      const s = find(app, "2026-10-16", "server", "17:00");
      const before = s.employeeId;
      check(app);
      assert.equal(find(app, "2026-10-16", "server", "17:00").employeeId, before);
    });
    test("catches what's wrong with that person", () => {
      assert.deepEqual(ruleIds(check(buildApp()).blocking), ["R10", "R4"]);
    });
    test("only reports problems about that person, or about the week as a whole", () => {
      check(buildApp()).violations.forEach((v) => assert.ok(v.employeeId === "e9" || v.employeeId === null, v.message));
    });
    test("leaves out what was already wrong with the week", () => {
      // the four empty shifts and the sunday R11 gap are there either way
      const ids = ruleIds(check(buildApp()).violations);
      ["R6", "R9", "R11"].forEach((id) => assert.ok(!ids.includes(id), `${id} showed up`));
    });
    test("doesn't hold someone's existing problems against them", () => {
      // sam is on monday lunch, then gets monday off. that's a problem, but it has
      // nothing to do with him taking tuesday's empty lunch
      const app = buildApp();
      app.availability.requestTimeOff("e2", { startDate: "2026-10-12", endDate: "2026-10-12" });
      app.schedule.decideTimeOff(app.repo.timeOff().at(-1).id, "approve");
      assert.ok(app.schedule.validate().blocking.some((v) => v.ruleId === "R2" && v.employeeId === "e2"));
      const week = app.repo.workingPeriod();
      const tuesday = week.shifts.find((s) => s.date === "2026-10-13" && s.roleId === "server" && !s.isAssigned());
      assert.deepEqual(app.engine.validateAssignment(tuesday, "e2", week, app.repo).blocking, []);
    });
  });
});
