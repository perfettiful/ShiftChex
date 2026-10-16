const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { buildApp, find } = require("./helpers");

// UC-01 and UC-02 go through the controller and get read back from the database

const EVENINGS = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "16:00", endTime: "23:59" }));
const blockedFor = (app, ruleId, name) => {
  const dates = new Map(app.repo.currentPeriod().shifts.map((s) => [s.id, s.date]));
  return app.schedule.validate().blocking
    .filter((v) => v.ruleId === ruleId && v.message.includes(name))
    .map((v) => dates.get(v.shiftId)).sort();
};

describe("availability tests", () => {
  describe("UC-01 declare availability", () => {
    test("the rules check the new declaration", () => {
      // dana works lunch mon to thu. evenings only means all four block
      const app = buildApp();
      assert.ok(app.availability.declare("e1", { effectiveFrom: "2026-10-05", slots: EVENINGS }).ok);
      assert.deepEqual(blockedFor(app, "R1", "Dana Park"),
        ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]);
    });
    test("dates before it starts still use the old one", () => {
      const app = buildApp();
      app.availability.declare("e1", { effectiveFrom: "2026-10-13", slots: EVENINGS });
      assert.deepEqual(blockedFor(app, "R1", "Dana Park"), ["2026-10-13", "2026-10-14", "2026-10-15"]);
    });
    test("a day left out means not available", () => {
      const app = buildApp();
      const notMonday = EVENINGS.filter((a) => a.weekday !== 1).map((a) => ({ ...a, startTime: "06:00" }));
      app.availability.declare("e1", { effectiveFrom: "2026-10-05", slots: notMonday });
      assert.deepEqual(blockedFor(app, "R1", "Dana Park"), ["2026-10-12"]);
    });
    test("replaces anything starting on or after its date, keeps older ones", () => {
      const app = buildApp();
      app.availability.declare("e1", { effectiveFrom: "2026-10-20", slots: EVENINGS });
      app.availability.declare("e1", { effectiveFrom: "2026-10-10", slots: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }] });
      const froms = new Set(app.repo.employeesById().get("e1").availability.map((a) => a.effectiveFrom));
      assert.deepEqual([...froms].sort(), ["2026-01-01", "2026-10-10"]);
    });
    test("bad input is refused and nothing is saved", () => {
      const app = buildApp();
      const day = (startTime, endTime, weekday = 1) => ({ weekday, startTime, endTime });
      [
        { effectiveFrom: "2026-10-01", slots: EVENINGS },               // before today (10/5)
        { effectiveFrom: "2026-10-12", slots: [day("17:00", "09:00")] },
        { effectiveFrom: "2026-10-12", slots: [day("9am", "17:00")] },
        { effectiveFrom: "2026-10-12", slots: [day("09:00", "12:00"), day("13:00", "17:00")] },
        { effectiveFrom: "2026-10-12", slots: [day("09:00", "17:00", 7)] },
        { effectiveFrom: "2026-10-12" },
      ].forEach((body) => assert.ok(app.availability.declare("e1", body).error, JSON.stringify(body)));
      assert.ok(app.repo.employeesById().get("e1").availability.every((a) => a.effectiveFrom === "2026-01-01"));
    });
  });

  describe("UC-02 request time off", () => {
    test("goes in as pending", () => {
      const app = buildApp();
      const { request } = app.availability.requestTimeOff("e3",
        { startDate: "2026-10-13", endDate: "2026-10-14", reason: " Wedding " });
      const saved = app.repo.timeOff().find((t) => t.id === request.id);
      assert.equal(saved.status, "pending");
      assert.equal(saved.employeeId, "e3");
      assert.equal(saved.reason, "Wedding");
    });
    test("pending doesn't block, once the manager approves it R2 does (UC-10)", () => {
      // tom is on the tue and wed evening server shifts
      const app = buildApp();
      const { request } = app.availability.requestTimeOff("e3", { startDate: "2026-10-13", endDate: "2026-10-14" });
      assert.deepEqual(blockedFor(app, "R2", "Tom Nguyen"), []);
      app.schedule.decideTimeOff(request.id, "approve");
      assert.deepEqual(blockedFor(app, "R2", "Tom Nguyen"), ["2026-10-13", "2026-10-14"]);
    });
    test("refuses the past, backwards dates and days already asked for", () => {
      const app = buildApp();
      const ask = (startDate, endDate) => app.availability.requestTimeOff("e3", { startDate, endDate });
      assert.ok(ask("2026-10-01", "2026-10-02").error);
      assert.ok(ask("2026-10-14", "2026-10-13").error);
      assert.ok(ask("2026-10-13", "2026-10-14").ok);
      assert.ok(ask("2026-10-14", "2026-10-20").error);
      assert.equal(app.repo.timeOff().filter((t) => t.employeeId === "e3").length, 1);
    });
    test("after a denial you can ask again", () => {
      // ana's 10/17 appointment is pending in the demo data
      const app = buildApp();
      app.schedule.decideTimeOff("t2", "deny");
      assert.ok(app.availability.requestTimeOff("e6", { startDate: "2026-10-17", endDate: "2026-10-17" }).ok);
    });
  });
});
