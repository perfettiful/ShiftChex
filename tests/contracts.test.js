const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { buildApp, publishable } = require("./helpers");

// checks the postconditions from our operation contracts are actually true.
// p2 is next week, the draft that publishable() fills in

// published week, with dana's monday lunch shift up for grabs
function posted() {
  const app = publishable();
  app.schedule.publish();
  const shift = app.repo.period("p2").shifts.find((s) =>
    s.date === "2026-10-12" && s.roleId === "server" && s.startTime === "11:00" && s.employeeId === "e1");
  const { swap } = app.swaps.post(shift.id, "e1");
  return { app, shiftId: shift.id, swapId: swap.id };
}

// read it back from the db instead of checking the objects we passed in
const saved = (app, shiftId, swapId) => ({
  shift: app.repo.period("p2").shifts.find((s) => s.id === shiftId),
  swap: app.repo.swaps().find((s) => s.id === swapId),
});

describe("contract tests", () => {
  describe("publish(periodId)", () => {
    test("refused while anything blocks, period stays in draft", () => {
      const { schedule, repo } = buildApp();
      assert.ok(schedule.publish().error);
      assert.equal(repo.period("p2").status, "draft");
    });
    test("period is published", () => {
      const app = publishable();
      app.schedule.publish();
      assert.equal(app.repo.period("p2").status, "published");
    });
    test("every shift is published", () => {
      const app = publishable();
      app.schedule.publish();
      assert.ok(app.repo.period("p2").shifts.every((s) => s.status === "published"));
    });
    test("one audit entry, one notice per person on the schedule", () => {
      const app = publishable();
      const [audits, notices] = [app.repo.audit().length, app.repo.notices().length];
      app.schedule.publish();
      const people = new Set(app.repo.period("p2").shifts.map((s) => s.employeeId));
      assert.equal(app.repo.audit().length, audits + 1);
      assert.equal(app.repo.audit().at(-1).what, "Published the week of 10/12.");
      const sent = app.repo.notices().slice(notices);
      assert.deepEqual(new Set(sent.map((n) => n.employeeId)), people);
      sent.forEach((n) => assert.equal(n.createdOn, "2026-10-05"));
    });
    test("can't publish twice, it has to be in draft", () => {
      const app = publishable();
      app.schedule.publish("p2");
      assert.ok(app.schedule.publish("p2").error);
    });
  });

  describe("claimShift(shiftId, employeeId)", () => {
    test("swap is tied to the shift and the claimer, both marked claimed", () => {
      const { app, shiftId, swapId } = posted();
      assert.ok(app.swaps.claim(swapId, "e3").ok);
      const { shift, swap } = saved(app, shiftId, swapId);
      assert.equal(swap.shiftId, shift.id);
      assert.equal(swap.claimedBy, "e3");
      assert.equal(swap.status, "claimed");
      assert.equal(shift.status, "claimed");
    });
    test("a refused claim changes nothing", () => {
      // riya only works evenings
      const { app, shiftId, swapId } = posted();
      assert.ok(app.swaps.claim(swapId, "e8").refused);
      const { shift, swap } = saved(app, shiftId, swapId);
      assert.equal(swap.status, "posted");
      assert.equal(swap.claimedBy, null);
      assert.equal(shift.status, "openForSwap");
    });
  });
});
