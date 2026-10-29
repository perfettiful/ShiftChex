const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { buildApp, publishable, ruleIds, setToday } = require("./helpers");

// p1 is this week (10/5, published), p2 is next week (10/12, the draft).
// the weeks, and the swap lifecycle from posting to unpublish
const thisWeek = (app) => app.repo.period("p1");
const shiftOf = (app, swapId) => {
  const sw = app.repo.swaps().find((s) => s.id === swapId);
  return thisWeek(app).shifts.find((s) => s.id === sw.shiftId);
};
const noticesFor = (app, employeeId) => app.repo.notices().filter((n) => n.employeeId === employeeId);
const lastNotice = (app, employeeId) => noticesFor(app, employeeId).at(-1)?.text;

describe("demo data", () => {
  test("this week is published and nothing on it blocks", () => {
    const app = buildApp();
    assert.equal(thisWeek(app).status, "published");
    const result = app.schedule.validate("p1");
    assert.deepEqual(result.blocking, []);
    // ben's sunday override, jordan's new hire certs, riya at 42 hours
    assert.deepEqual(ruleIds(result.warnings), ["R1", "R10", "R7"]);
  });
  test("next week is the draft, and it's the default week", () => {
    const app = buildApp();
    const weeks = app.repo.periods();
    assert.deepEqual(weeks.slice(0, 2).map((p) => [p.id, p.status]), [["p1", "published"], ["p2", "draft"]]);
    assert.equal(app.schedule.period().id, "p2");
  });
  test("weeks are filled in every week until the end of the year", () => {
    const app = buildApp();
    const weeks = app.repo.periods();
    assert.equal(weeks.length, 13);
    assert.equal(weeks.at(-1).startDate, "2026-12-28");
    // each one starts the monday after the last
    weeks.slice(1).forEach((w, i) => assert.equal((new Date(w.startDate) - new Date(weeks[i].startDate)) / 86400000, 7));
    // after next week they're the usual roster, nothing empty and nothing blocking
    weeks.slice(2).forEach((w) => {
      assert.ok(w.shifts.every((s) => s.isAssigned()), w.startDate);
      assert.deepEqual(app.schedule.validate(w.id).blocking, [], w.startDate);
    });
  });
  test("closed on thanksgiving, christmas and new year's day", () => {
    const app = buildApp();
    const dates = new Set(app.repo.periods().flatMap((p) => p.shifts.map((s) => s.date)));
    ["2026-11-26", "2026-12-25", "2027-01-01"].forEach((d) => assert.ok(!dates.has(d), d));
    assert.ok(dates.has("2026-11-27"));
  });
  test("renewals that are already booked count from the day they're issued", () => {
    // lena's alcohol card runs out 10/15 and the new one starts 10/17, so 10/16 is the gap
    const app = buildApp();
    const lena = app.repo.employeesById().get("e4");
    const alcohol = app.repo.certTypesById().get("alcohol");
    assert.equal(lena.certStatus(alcohol, "2026-10-15").ok, true);
    assert.equal(lena.certStatus(alcohol, "2026-10-16").ok, false);
    assert.equal(lena.certStatus(alcohol, "2026-10-17").ok, true);
  });
  test("there's something in every queue", () => {
    const app = buildApp();
    const count = (status) => app.repo.swaps().filter((s) => s.status === status).length;
    assert.deepEqual(["posted", "claimed", "approved", "denied"].map(count), [2, 2, 1, 1]);
    assert.equal(app.repo.timeOff().filter((t) => t.status === "pending").length, 4);
    assert.ok(noticesFor(app, "e1").length > 1);
  });
});

describe("week to week", () => {
  test("R3 sees across the weekend: closing sunday then opening monday blocks", () => {
    // omar closes this sunday (10/11) at 11pm. next monday's 8am lead is grace's
    const app = buildApp();
    const monday = app.repo.workingPeriod().shifts.find((s) => s.date === "2026-10-12" && s.roleId === "lead"
      && s.startTime === "08:00");
    const { result } = app.schedule.assign(monday.id, "e11");
    const r3 = result.blocking.filter((v) => v.ruleId === "R3" && v.shiftId === monday.id);
    assert.equal(r3.length, 1);
    assert.match(r3[0].message, /Omar Farah finishes at 11pm on Sun, 10\/11 and starts at 8am on Mon, 10\/12/);
  });
  test("a draft week doesn't count against the published one next to it", () => {
    // grace opens next monday on the draft. taking omar's sunday close is fine on the
    // board, and the draft's own check flags it, since the draft is what has to change
    const app = buildApp();
    const sundayClose = thisWeek(app).shifts.find((s) => s.date === "2026-10-11" && s.roleId === "lead"
      && s.startTime === "16:00");
    const result = app.engine.validateAssignment(sundayClose, "e10", thisWeek(app), app.repo);
    assert.ok(!result.violations.some((v) => /10\/12/.test(v.message)));
    // put it in place and the draft's check sees it
    sundayClose.assign("e10");
    app.repo.saveShift(sundayClose);
    const draftR3 = app.schedule.validate("p2").blocking.filter((v) => v.ruleId === "R3");
    assert.match(draftR3[0].message, /Grace Kim finishes at 11pm on Sun, 10\/11/);
  });
  test("each week publishes and unpublishes on its own", () => {
    const app = buildApp();
    assert.ok(app.schedule.unpublish("p1").ok);
    assert.equal(app.repo.period("p2").status, "draft");
    assert.ok(app.schedule.publish("p1").ok);
    assert.equal(app.repo.period("p1").status, "published");
  });
  test("a week that doesn't exist is an error", () => {
    const app = buildApp();
    assert.ok(app.schedule.publish("nope").error);
    assert.ok(app.schedule.unpublish("nope").error);
    assert.ok(app.schedule.unpublish("p2").error, "p2 is already a draft");
  });
});

describe("swap board", () => {
  test("shows the two posted shifts, each checked for whoever is looking", () => {
    const app = buildApp();
    const board = (who) => app.swaps.board(who).map((b) => [b.swap.id, ruleIds(b.result.blocking)]);
    // sam can take dana's thursday lunch. he's already on friday dinner so tom's bar shift is out
    assert.deepEqual(board("e2"), [["w3", []], ["w4", ["R3", "R5"]]]);
    // riya only does evenings, and she's on thursday dinner. the board shows the first reason
    const [riya] = app.swaps.board("e8");
    assert.deepEqual(ruleIds(riya.result.blocking), ["R1", "R3"]);
    assert.match(riya.result.blocking[0].message, /Riya Iyer has not said they can work 11am to 5pm/);
  });
  test("lena can take tom's friday bar shift but marcus's cert has lapsed", () => {
    const app = buildApp();
    const bar = (who) => app.swaps.board(who).find((b) => b.swap.id === "w4");
    assert.deepEqual(bar("e4").result.blocking, []);
    assert.deepEqual(ruleIds(bar("e5").result.blocking), ["R10"]);
  });
  test("your own post shows as yours, with no check", () => {
    const mine = buildApp().swaps.board("e1").find((b) => b.swap.id === "w3");
    assert.deepEqual([mine.mine, mine.result], [true, null]);
  });
  test("shifts that already happened drop off", () => {
    const app = buildApp();
    setToday(app, "2026-10-09");
    assert.deepEqual(app.swaps.board("e2").map((b) => b.swap.id), ["w4"]);
  });
});

describe("posting and withdrawing (UC-04)", () => {
  test("can't post a shift on the draft week", () => {
    const app = buildApp();
    const draftShift = app.repo.workingPeriod().shifts.find((s) => s.employeeId === "e1");
    assert.match(app.swaps.post(draftShift.id, "e1").error, /not been published/);
  });
  test("can't post a shift that already happened", () => {
    const app = buildApp();
    setToday(app, "2026-10-07");
    const monday = thisWeek(app).shifts.find((s) => s.date === "2026-10-05" && s.employeeId === "e1");
    assert.match(app.swaps.post(monday.id, "e1").error, /already happened/);
  });
  test("can't post the same shift twice", () => {
    const app = buildApp();
    assert.match(app.swaps.post(shiftOf(app, "w3").id, "e1").error, /already posted/);
  });
  test("an approved swap's shift can be posted again by its new owner", () => {
    const app = buildApp();
    assert.ok(app.swaps.post(shiftOf(app, "w1").id, "e10").ok);
  });
  test("withdrawing takes it off the board and the shift stays yours", () => {
    const app = buildApp();
    assert.ok(app.swaps.withdraw("w3", "e1").ok);
    assert.ok(!app.swaps.board("e2").some((b) => b.swap.id === "w3"));
    // it stays on record, so it still shows in dana's swaps
    assert.equal(app.repo.swaps().find((s) => s.id === "w3").status, "withdrawn");
    assert.equal(app.session.stateFor(app.session.user("e1")).mySwaps.find((s) => s.id === "w3").status, "withdrawn");
    const shift = thisWeek(app).shifts.find((s) => s.date === "2026-10-08" && s.roleId === "server"
      && s.startTime === "11:00" && s.employeeId === "e1");
    assert.equal(shift.status, "published");
    assert.match(app.repo.audit().at(-1).what, /Dana Park took their Thu, 10\/8 Server shift off the swap board/);
  });
  test("only the person who posted it can withdraw, and only before a claim", () => {
    const app = buildApp();
    assert.match(app.swaps.withdraw("w3", "e2").error, /didn't post/);
    assert.match(app.swaps.withdraw("w5", "e15").error, /already claimed/);
  });
});

describe("approving and denying swaps (UC-09)", () => {
  test("ben's claim passed when he made it, but his day off came through since", () => {
    const app = buildApp();
    const ben = app.swaps.pending().find((p) => p.swap.id === "w6");
    assert.deepEqual(ruleIds(ben.result.blocking), ["R2"]);
    assert.match(app.swaps.decide("w6", "approve").error, /^Cannot approve\. Ben Cole has approved time off/);
    assert.equal(app.repo.swaps().find((s) => s.id === "w6").status, "claimed");
  });
  test("approving moves the shift and tells both people", () => {
    const app = buildApp();
    assert.ok(app.swaps.decide("w5", "approve").ok);
    const shift = shiftOf(app, "w5");
    assert.deepEqual([shift.employeeId, shift.status], ["e5", "published"]);
    assert.equal(lastNotice(app, "e5"), "You got Luis Vega's Wed, 10/7 Dishwasher shift. The manager approved the swap.");
    assert.equal(lastNotice(app, "e15"), "Marcus Okoye is taking your Wed, 10/7 Dishwasher shift. The manager approved the swap.");
    assert.equal(app.repo.audit().at(-1).what, "Approved Marcus Okoye taking Luis Vega's Wed, 10/7 Dishwasher shift.");
  });
  test("denying leaves the shift where it was and tells both people", () => {
    const app = buildApp();
    assert.ok(app.swaps.decide("w6", "deny").ok);
    assert.equal(shiftOf(app, "w6").employeeId, "e13");
    assert.match(lastNotice(app, "e7"), /turned down your claim on Jordan Lee's Wed, 10\/7 Server shift/);
    assert.match(lastNotice(app, "e13"), /stays with you/);
  });
  test("a claim on a shift that already happened can be denied but not approved", () => {
    const app = buildApp();
    setToday(app, "2026-10-09");
    assert.match(app.swaps.decide("w5", "approve").error, /already happened/);
    assert.ok(app.swaps.decide("w5", "deny").ok);
  });
  test("a claim that would leave nobody on site with first aid is refused", () => {
    // grace is the only one with first aid on thursday dinner. jordan doesn't have it
    const app = buildApp();
    const thursday = thisWeek(app).shifts.find((s) => s.date === "2026-10-08" && s.startTime === "17:00"
      && s.employeeId === "e10");
    const { swap } = app.swaps.post(thursday.id, "e10");
    const r = app.swaps.claim(swap.id, "e13");
    assert.ok(r.refused);
    assert.deepEqual(ruleIds(r.result.blocking), ["R11"]);
    assert.match(r.error, /nobody on site has a First Aid/);
  });
  test("anything other than approve or deny is refused", () => {
    const app = buildApp();
    assert.ok(app.swaps.decide("w5", "maybe").error);
    assert.equal(app.repo.swaps().find((s) => s.id === "w5").status, "claimed");
  });
});

describe("unpublishing a week with swaps open", () => {
  test("open swaps are cancelled, decided ones stay as history", () => {
    const app = buildApp();
    assert.deepEqual(app.schedule.unpublish("p1"), { ok: true, cancelled: 4 });
    assert.deepEqual(app.repo.swaps().map((s) => [s.id, s.status]), [["w1", "approved"], ["w2", "denied"],
      ["w3", "cancelled"], ["w4", "cancelled"], ["w5", "cancelled"], ["w6", "cancelled"]]);
    assert.ok(thisWeek(app).shifts.every((s) => s.status === "draft"));
    assert.deepEqual(app.swaps.board("e2"), []);
    assert.deepEqual(app.swaps.pending(), []);
  });
  test("everyone on the week hears about it, and so does everyone in a cancelled swap", () => {
    const app = buildApp();
    app.schedule.unpublish("p1");
    assert.match(lastNotice(app, "e8"), /week of 10\/5 went back to draft/);
    // marcus claimed luis's dish shift. he's on the week too, so he gets both
    const marcus = noticesFor(app, "e5").slice(-2).map((n) => n.text);
    assert.ok(marcus.some((t) => /Your swap for the Wed, 10\/7 Dishwasher shift was cancelled/.test(t)));
    assert.match(app.repo.audit().at(-1).what, /cancelled 4 open swap requests/);
  });
});

describe("time off (UC-02, UC-10)", () => {
  test("the manager sees which shifts a request would land on", () => {
    const { timeOff } = buildApp().session.stateFor({ id: "manager", name: "R. Chen", role: "manager" });
    const riya = timeOff.find((t) => t.id === "t4");
    assert.deepEqual(riya.conflicts.map((s) => [s.date, s.roleId, s.startTime, s.published]),
      [["2026-10-09", "server", "17:00", true]]);
    // dana's 10/24 to 10/25 lands on the week of 10/19, which is still a draft
    assert.deepEqual(timeOff.find((t) => t.id === "t6").conflicts.map((s) => [s.date, s.roleId, s.published]),
      [["2026-10-24", "host", false], ["2026-10-25", "server", false]]);
    // and sam's thanksgiving days off don't touch anything
    assert.equal(timeOff.find((t) => t.id === "t7").status, "approved");
  });
  test("deciding tells the employee", () => {
    const app = buildApp();
    app.schedule.decideTimeOff("t4", "deny");
    assert.equal(lastNotice(app, "e8"), "Your time off for 10/9 was turned down.");
  });
  test("a request can only be decided once", () => {
    const app = buildApp();
    assert.ok(app.schedule.decideTimeOff("t2", "approve").ok);
    assert.match(app.schedule.decideTimeOff("t2", "deny").error, /already decided/);
    assert.ok(app.schedule.decideTimeOff("t6", "sure").error);
  });
  test("an employee can take back their own pending request, nothing else", () => {
    const app = buildApp();
    assert.ok(app.availability.cancelTimeOff("e2", "t1").error, "already approved");
    assert.ok(app.availability.cancelTimeOff("e2", "t6").error, "that's dana's");
    assert.ok(app.availability.cancelTimeOff("e1", "t6").ok);
    assert.ok(!app.repo.timeOff().some((t) => t.id === "t6"));
  });
});

describe("what each person sees", () => {
  const employee = (app, id) => app.session.stateFor(app.session.user(id));
  test("employees only get published weeks, and only their own shifts", () => {
    const state = employee(buildApp(), "e1");
    assert.ok(state.myShifts.length > 0);
    assert.ok(state.myShifts.every((s) => s.periodId === "p1" && s.employeeId === "e1"));
    assert.equal(state.result, undefined);
    assert.equal(state.shifts, undefined);
  });
  test("employees don't get everyone else's details", () => {
    const state = employee(buildApp(), "e1");
    state.employees.forEach((e) => assert.deepEqual(Object.keys(e), ["id", "name"]));
    assert.equal(state.me.name, "Dana Park");
  });
  test("your own shifts show if they're posted for swap", () => {
    const state = employee(buildApp(), "e1");
    const thursday = state.myShifts.find((s) => s.date === "2026-10-08" && s.startTime === "11:00");
    assert.deepEqual([thursday.swapStatus, thursday.swapId], ["posted", "w3"]);
  });
  test("your swaps show both sides, newest first", () => {
    const { mySwaps } = employee(buildApp(), "e13");
    assert.deepEqual(mySwaps.map((s) => [s.id, s.postedIt, s.otherName, s.status]),
      [["w6", true, "Ben Cole", "claimed"], ["w2", false, "Dana Park", "denied"]]);
  });
  test("next week shows up for employees once it's published", () => {
    const app = publishable();
    assert.ok(!employee(app, "e6").myShifts.some((s) => s.periodId === "p2"));
    app.schedule.publish("p2");
    assert.ok(employee(app, "e6").myShifts.some((s) => s.periodId === "p2"));
  });
  test("the manager can pick either week", () => {
    const app = buildApp();
    const manager = app.session.user("manager");
    assert.equal(app.session.stateFor(manager).period.id, "p2");
    const live = app.session.stateFor(manager, "p1");
    assert.equal(live.period.id, "p1");
    assert.equal(live.shifts.find((s) => s.swap?.status === "claimed" && s.date === "2026-10-07"
      && s.roleId === "dish").swap.claimedByName, "Marcus Okoye");
  });
  test("notices can be dismissed, but only your own", () => {
    const app = buildApp();
    const [first] = noticesFor(app, "e1");
    assert.ok(app.session.dismissNotice("e2", first.id).error);
    assert.ok(app.session.dismissNotice("e1", first.id).ok);
    assert.ok(!app.repo.notices().some((n) => n.id === first.id));
  });
});
