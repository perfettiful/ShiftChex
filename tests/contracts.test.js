const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { buildApp, publishable } = require("./helpers");

// the postconditions from the operation contracts actually hold

// published week, with dana's monday lunch shift up for grabs
function posted() {
  const app = publishable();
  app.schedule.publish();
  const shift = app.repo.currentPeriod().shifts.find((s) =>
    s.date === "2026-10-12" && s.roleId === "server" && s.startTime === "11:00" && s.employeeId === "e1");
  const { swap } = app.swaps.post(shift.id, "e1");
  return { app, shift, swap };
}

describe("contract tests", () => {
  describe("publish(periodId)", () => {
    test("refused while anything blocks, period stays in draft", () => {
      const { schedule, repo } = buildApp();
      assert.ok(schedule.publish().error);
      assert.equal(repo.currentPeriod().status, "draft");
    });
    test("period is published", () => {
      const app = publishable();
      app.schedule.publish();
      assert.equal(app.repo.currentPeriod().status, "published");
    });
    test("every shift is published", () => {
      const app = publishable();
      app.schedule.publish();
      assert.ok(app.repo.currentPeriod().shifts.every((s) => s.status === "published"));
    });
    test("one audit entry, one notice per person on the schedule", () => {
      const app = publishable();
      app.schedule.publish();
      const people = new Set(app.repo.currentPeriod().shifts.map((s) => s.employeeId));
      assert.equal(app.repo.audit().length, 1);
      assert.equal(app.repo.notices().length, people.size);
    });
    test("can't publish twice, it has to be in draft", () => {
      const app = publishable();
      app.schedule.publish();
      assert.ok(app.schedule.publish().error);
    });
  });

  describe("claimShift(shiftId, employeeId)", () => {
    test("swap is tied to the shift and the claimer, both marked claimed", () => {
      const { app, shift, swap } = posted();
      assert.ok(app.swaps.claim(swap.id, "e3").ok);
      assert.equal(swap.shiftId, shift.id);
      assert.equal(swap.claimedBy, "e3");
      assert.equal(swap.status, "claimed");
      assert.equal(shift.status, "claimed");
    });
    test("a refused claim changes nothing", () => {
      // riya only works evenings
      const { app, shift, swap } = posted();
      assert.ok(app.swaps.claim(swap.id, "e8").refused);
      assert.equal(swap.status, "posted");
      assert.equal(swap.claimedBy, null);
      assert.equal(shift.status, "openForSwap");
    });
  });
});
