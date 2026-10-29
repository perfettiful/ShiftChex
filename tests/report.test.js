const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { buildApp, publishable } = require("./helpers");

// UC-11 View coverage and labor report, ReportController.coverage(periodId).
// p1 is this week (published), p2 is next week (the draft). "today" is 10/5
const certs = (report, kind) => report.certs.filter((c) => c.kind === kind)
  .map((c) => `${c.name}: ${c.certTypeId} ${c.date}`);

describe("report tests (UC-11)", () => {
  describe("coverage", () => {
    test("open shifts by day, for next week's draft", () => {
      const { days } = buildApp().report.coverage("p2");
      assert.equal(days.length, 7);
      assert.deepEqual(days.filter((d) => d.open.length).map((d) => [d.date, d.open.length]),
        [["2026-10-13", 1], ["2026-10-15", 1], ["2026-10-18", 2]]);
      assert.deepEqual(days[6].open.map((o) => o.roleId).sort(), ["cook", "lead"]);
    });
    test("every shift is counted once, filled or open", () => {
      const { days } = buildApp().report.coverage("p2");
      assert.equal(days.reduce((t, d) => t + d.shifts, 0), 79);
      assert.equal(days.reduce((t, d) => t + d.filled + d.open.length, 0), 79);
    });
    test("leaving out the week gives the one being worked on, the first draft", () => {
      assert.equal(buildApp().report.coverage().period.id, "p2");
    });
    test("a week that doesn't exist is an error", () => {
      assert.ok(buildApp().report.coverage("nope").error);
    });
  });

  describe("labor", () => {
    test("the total matches the schedule's projected cost, against the budget", () => {
      const app = buildApp();
      const { labor } = app.report.coverage("p2");
      assert.equal(labor.cost, Math.round(app.schedule.projectedCost("p2")));
      assert.equal(labor.budget, 9500);
    });
    test("split by role and by day, both add back up to the total", () => {
      const { labor, days } = buildApp().report.coverage("p1");
      const near = (a, b) => assert.ok(Math.abs(a - b) <= 8, `${a} vs ${b}`);  // each part is rounded
      near(labor.byRole.reduce((t, r) => t + r.cost, 0), labor.cost);
      near(days.reduce((t, d) => t + d.cost, 0), labor.cost);
    });
  });

  describe("hours", () => {
    test("over and close to overtime, most hours first", () => {
      const { hours, overtimeThreshold, nearOvertime } = buildApp().report.coverage("p1");
      assert.deepEqual(hours.filter((h) => h.status === "over").map((h) => [h.name, h.hours]), [["Riya Iyer", 42]]);
      hours.filter((h) => h.status === "near").forEach((h) =>
        assert.ok(h.hours >= nearOvertime && h.hours <= overtimeThreshold, h.name));
      assert.ok(hours.some((h) => h.name === "Dana Park" && h.status === "near"));
      hours.slice(1).forEach((h, i) => assert.ok(hours[i].hours >= h.hours));
    });
    test("shows who's on more hours than they asked for", () => {
      // kai wants 20 at most and he's on 25 this week
      const kai = buildApp().report.coverage("p1").hours.find((h) => h.name === "Kai Obi");
      assert.deepEqual([kai.hours, kai.prefers, kai.overPreference], [25, 20, true]);
    });
    test("picks up changes to the draft", () => {
      // ana covers sunday too once the week is filled in, 48 hours
      const ana = publishable().report.coverage("p2").hours.find((h) => h.name === "Ana Diaz");
      assert.deepEqual([ana.hours, ana.status], [48, "over"]);
    });
  });

  describe("certifications in the next 30 days", () => {
    const report = buildApp().report.coverage("p2");
    test("already stopping someone: expired or missing past the new hire window", () => {
      assert.deepEqual(certs(report, "expired"), ["Marcus Okoye: alcohol 2026-09-30"]);
      assert.ok(certs(report, "missing").includes("Priya Shah: foodHandler 2026-09-19"));
    });
    test("running out soon", () => {
      assert.deepEqual(certs(report, "expiring"),
        ["Grace Kim: foodManager 2026-10-14", "Lena Haas: alcohol 2026-10-15"]);
    });
    test("new hires coming up on their deadline", () => {
      assert.ok(certs(report, "due").includes("Jordan Lee: foodHandler 2026-10-21"));
      // jordan's alcohol cert isn't due until 11/20, past the 30 days
      assert.ok(!report.certs.some((c) => c.name === "Jordan Lee" && c.certTypeId === "alcohol"));
    });
    test("the urgent ones come first", () => {
      const firstSoon = report.certs.findIndex((c) => c.kind === "expiring" || c.kind === "due");
      assert.ok(report.certs.slice(firstSoon).every((c) => c.kind === "expiring" || c.kind === "due"));
    });
  });

  describe("overrides and activity", () => {
    test("this week's override shows with its reason", () => {
      const { overrides } = buildApp().report.coverage("p1");
      assert.deepEqual(overrides.map((o) => [o.employeeName, o.date, o.reason]),
        [["Ben Cole", "2026-10-11", "Ben offered to cover Sunday this once."]]);
    });
    test("a new override on the draft shows up", () => {
      const app = buildApp();
      const sunday = app.repo.workingPeriod().shifts.find((s) => s.date === "2026-10-18" && s.roleId === "cook");
      assert.equal(app.report.coverage("p2").overrides.length, 0);
      app.schedule.assign(sunday.id, "e7", "Covering");
      assert.deepEqual(app.report.coverage("p2").overrides.map((o) => o.reason), ["Covering"]);
    });
    test("the activity log is newest first", () => {
      const app = buildApp();
      app.schedule.decideTimeOff("t2", "approve");
      const { activity } = app.report.coverage("p2");
      assert.equal(activity[0].what, "Approved time off for Ana Diaz, 10/17.");
      assert.equal(activity.at(-1).what.startsWith("Overrode R1 for Ben Cole"), true);
    });
  });

  test("the report doesn't change anything", () => {
    const app = buildApp();
    const before = JSON.stringify([app.repo.periods(), app.repo.swaps(), app.repo.audit(), app.repo.notices()]);
    app.report.coverage("p1");
    app.report.coverage("p2");
    assert.equal(JSON.stringify([app.repo.periods(), app.repo.swaps(), app.repo.audit(), app.repo.notices()]), before);
  });
});
