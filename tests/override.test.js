const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { buildApp, find, ruleIds } = require("./helpers");

// UC-12, through ScheduleController.assign(shiftId, employeeId, overrideReason). ben
// doesn't work sundays and next sunday's cook shift is empty, so R1 is all that's wrong
const benSunday = (app) => find(app, "2026-10-18", "cook", "08:00");
const blockingOn = (result, shiftId) => ruleIds(result.blocking.filter((v) => v.shiftId === shiftId));
const saved = (app, shiftId) => app.repo.workingPeriod().shifts.find((s) => s.id === shiftId);
// next tuesday's lunch has one server and one empty slot
const emptyLunch = (app) => app.repo.workingPeriod().shifts.find((s) => s.date === "2026-10-13"
  && s.roleId === "server" && s.startTime === "11:00" && !s.isAssigned());

describe("override tests (UC-12)", () => {
  test("without a reason, R1 blocks", () => {
    const app = buildApp();
    const { result } = app.schedule.assign(benSunday(app).id, "e7");
    assert.deepEqual(blockingOn(result, benSunday(app).id), ["R1"]);
  });

  test("with a reason, R1 turns into a warning that shows the reason", () => {
    const app = buildApp();
    const id = benSunday(app).id;
    const { ok, result } = app.schedule.assign(id, "e7", "  He offered to cover it  ");
    assert.ok(ok);
    assert.deepEqual(blockingOn(result, id), []);
    const r1 = result.warnings.find((v) => v.ruleId === "R1" && v.shiftId === id);
    assert.match(r1.message, /Ben Cole .* Overridden: He offered to cover it$/);
  });

  test("the reason is saved on the shift, trimmed", () => {
    const app = buildApp();
    const id = benSunday(app).id;
    app.schedule.assign(id, "e7", "  He offered to cover it  ");
    assert.equal(saved(app, id).overrideReason, "He offered to cover it");
    assert.equal(saved(app, id).employeeId, "e7");
  });

  test("an audit entry says who, which shift and why", () => {
    const app = buildApp();
    app.schedule.assign(benSunday(app).id, "e7", "He offered to cover it");
    assert.equal(app.repo.audit().at(-1).what,
      "Overrode R1 for Ben Cole on Sun, 10/18 Cook / prep 8am to 4pm. Reason: He offered to cover it");
  });

  test("3a: a blank reason is refused and nothing changes", () => {
    const app = buildApp();
    const id = benSunday(app).id;
    const audits = app.repo.audit().length;
    assert.equal(app.schedule.assign(id, "e7", "   ").error, "Give a reason for the override.");
    assert.equal(saved(app, id).employeeId, null);
    assert.equal(app.repo.audit().length, audits);
  });

  test("there's nothing to override when the person is available", () => {
    // sam can do next tuesday's lunch as is
    const app = buildApp();
    const id = emptyLunch(app).id;
    assert.match(app.schedule.assign(id, "e2", "just because").error, /nothing to override/);
    assert.equal(saved(app, id).employeeId, null);
  });

  test("4a: an override only covers R1, anything else still blocks", () => {
    // riya only does evenings and she's already on tuesday dinner, so lunch also breaks R3
    const app = buildApp();
    const lunch = emptyLunch(app);
    const { result } = app.schedule.assign(lunch.id, "e8", "She said yes");
    assert.deepEqual(blockingOn(result, lunch.id), []);
    assert.ok(result.warnings.some((v) => v.ruleId === "R1" && v.shiftId === lunch.id));
    // R3 lands on the later of the two shifts, her dinner
    const r3 = result.blocking.filter((v) => v.ruleId === "R3" && v.message.startsWith("Riya Iyer"));
    assert.equal(r3.length, 1);
    assert.match(r3[0].message, /finishes at 5pm on Tue, 10\/13 and starts at 5pm/);
  });

  test("putting someone else on the shift clears the override", () => {
    const app = buildApp();
    const id = benSunday(app).id;
    app.schedule.assign(id, "e7", "He offered to cover it");
    app.schedule.assign(id, "e6");
    assert.equal(saved(app, id).overrideReason, null);
  });

  test("an override isn't passed on to someone else checked for the shift", () => {
    // ben's override on this week's sunday cook shift is his. riya only does evenings
    const app = buildApp();
    const week = app.repo.period("p1");
    const shift = week.shifts.find((s) => s.date === "2026-10-11" && s.roleId === "cook");
    assert.ok(shift.overrideReason);
    const result = app.engine.validateAssignment(shift, "e8", week, app.repo);
    assert.ok(ruleIds(result.blocking).includes("R1"));
  });

  test("a published week can't be changed, override or not", () => {
    const app = buildApp();
    const shift = app.repo.period("p1").shifts.find((s) => s.date === "2026-10-11" && s.roleId === "cook");
    assert.match(app.schedule.assign(shift.id, "e6", "swap them").error, /published/);
  });

  test("assigning someone who doesn't exist is refused", () => {
    const app = buildApp();
    assert.equal(app.schedule.assign(benSunday(app).id, "nobody").error, "No such employee.");
  });
});
