const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const wiring = require("../src/application/wiring");
const { createServer } = require("../src/ui/server");
const { buildApp, publishable } = require("./helpers");

describe("session tests", () => {
  test("the manager signs in without being an employee", () => {
    const { session, repo } = buildApp();
    const managers = session.users().filter((u) => u.role === "manager");
    assert.equal(managers.length, 1);
    assert.equal(managers[0].employeeId, null);
    assert.ok(!repo.employeesById().has(managers[0].id));
  });

  test("every employee signs in as themselves", () => {
    const { session, repo } = buildApp();
    const employees = session.users().filter((u) => u.role === "employee");
    assert.equal(employees.length, repo.employees().length);
    employees.forEach((u) => assert.equal(u.employeeId, u.id));
  });

  test("each side can only do its own things", () => {
    const { session } = buildApp();
    assert.equal(session.authorize("e1", "manager").status, 403);
    assert.equal(session.authorize("manager", "employee").status, 403);
    assert.equal(session.authorize("nobody", "any").status, 401);
    assert.equal(session.authorize(undefined, "any").status, 401);
    assert.equal(session.authorize("manager", "manager").user.role, "manager");
  });

  test("an employee only sees their own notices and time off", () => {
    const app = publishable();
    app.schedule.publish();
    const state = app.session.stateFor(app.session.user("e6"));
    assert.ok(state.notices.length > 0);
    assert.ok(state.notices.every((n) => n.employeeId === "e6"));
    assert.ok(state.timeOff.every((t) => t.employeeId === "e6"));
  });

  test("reset puts the demo weeks back and says what's there", () => {
    const app = publishable();
    app.schedule.publish();
    const { ok, check } = app.session.resetDemo();
    assert.ok(ok);
    assert.deepEqual(check, { weeks: 13, draftWeek: "2026-10-12", status: "draft", shifts: 79, empty: 4 });
    assert.equal(app.repo.workingPeriod().status, "draft");
  });

  test("screens are read from the database, not kept in memory", (t) => {
    // save with one connection and read with another, no restart
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftchex-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, "test.db");
    const a = wiring.buildApp({ db: file });
    const b = wiring.buildApp({ db: file });
    const timeOff = () => a.session.stateFor(a.session.user("e3")).timeOff.length;
    const before = timeOff();
    b.availability.requestTimeOff("e3", { startDate: "2026-10-13", endDate: "2026-10-13" });
    assert.equal(timeOff(), before + 1);
    a.repo.close();
    b.repo.close();
  });
});

describe("api tests", () => {
  let server, base;
  before(async () => {
    server = createServer(buildApp());
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => { server.closeAllConnections(); server.close(); });

  const login = (username, password) => fetch(base + "/api/login",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });

  // signs in with the demo account for that user id once, then reuses the cookie
  const cookies = {};
  const cookieFor = async (id) => {
    if (!cookies[id]) {
      const accounts = await (await fetch(base + "/api/demo-accounts")).json();
      const a = accounts.find((x) => x.id === id);
      const res = await login(a.username, a.password);
      cookies[id] = res.headers.get("set-cookie").split(";")[0];
    }
    return cookies[id];
  };

  const call = async (method, url, user, body) => {
    const headers = { "Content-Type": "application/json", ...(user ? { Cookie: await cookieFor(user) } : {}) };
    const res = await fetch(base + url, { method, headers, body: body && JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };

  test("the demo accounts come from the server, manager first", async () => {
    const { data } = await call("GET", "/api/demo-accounts");
    assert.equal(data[0].role, "manager");
    assert.equal(data.filter((u) => u.role === "employee").length, 17);
    assert.equal(data.find((u) => u.id === "e1").username, "dana.park");
  });

  test("signing in with the right password sets a session cookie", async () => {
    const res = await login("dana.park", "shiftchex");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("set-cookie"), /^shiftchex_session=\w+;.*HttpOnly/);
    assert.equal((await res.json()).user.id, "e1");
  });

  test("a wrong password or unknown name gets nothing", async () => {
    const bad = await login("dana.park", "nope");
    assert.equal(bad.status, 401);
    assert.equal(bad.headers.get("set-cookie"), null);
    assert.equal((await login("nobody", "shiftchex")).status, 401);
  });

  test("signing out ends the session", async () => {
    const res = await login("tom.nguyen", "shiftchex");
    const cookie = res.headers.get("set-cookie").split(";")[0];
    const me = async () => (await (await fetch(base + "/api/me", { headers: { Cookie: cookie } })).json()).user;
    assert.equal((await me()).id, "e3");
    await fetch(base + "/api/logout", { method: "POST", headers: { Cookie: cookie } });
    assert.equal(await me(), null);
    assert.equal((await fetch(base + "/api/state", { headers: { Cookie: cookie } })).status, 401);
  });

  test("a made up cookie doesn't get in", async () => {
    const res = await fetch(base + "/api/state", { headers: { Cookie: "shiftchex_session=madeup" } });
    assert.equal(res.status, 401);
  });

  test("nothing works without signing in", async () => {
    assert.equal((await call("GET", "/api/state")).status, 401);
    assert.equal((await call("POST", "/api/publish")).status, 401);
  });

  test("an employee can't approve their own time off", async () => {
    const r = await call("POST", "/api/decide-timeoff", "e6", { requestId: "t2", decision: "approve" });
    assert.equal(r.status, 403);
    const { data } = await call("GET", "/api/state", "manager");
    assert.equal(data.timeOff.find((t) => t.id === "t2").status, "pending");
  });

  test("employee actions use whoever is signed in, not an id in the body", async () => {
    const r = await call("POST", "/api/time-off", "e3",
      { employeeId: "e1", startDate: "2026-10-20", endDate: "2026-10-20" });
    assert.equal(r.data.request.employeeId, "e3");
  });

  test("UC-02 then UC-10 end to end", async () => {
    const asked = await call("POST", "/api/time-off", "e7", { startDate: "2026-10-21", endDate: "2026-10-22", reason: "Trip" });
    const id = asked.data.request.id;
    const mgr = await call("GET", "/api/state", "manager");
    assert.equal(mgr.data.timeOff.find((t) => t.id === id).status, "pending");
    assert.equal((await call("POST", "/api/decide-timeoff", "manager", { requestId: id, decision: "approve" })).status, 200);
    const ben = await call("GET", "/api/state", "e7");
    assert.equal(ben.data.timeOff.find((t) => t.id === id).status, "approved");
    assert.match(ben.data.notices[0].text, /time off for 10\/21 to 10\/22 was approved/);
  });

  test("UC-11 the report is the manager's, for whichever week they ask for", async () => {
    assert.equal((await call("GET", "/api/report", "e1")).status, 403);
    const { status, data } = await call("GET", "/api/report?periodId=p1", "manager");
    assert.equal(status, 200);
    assert.equal(data.period.id, "p1");
    assert.equal(data.days.length, 7);
    assert.equal((await call("GET", "/api/report?periodId=nope", "manager")).status, 400);
  });

  test("UC-12 the override reason goes through /api/assign, manager only", async () => {
    const { data: state } = await call("GET", "/api/state", "manager");
    const sunday = state.shifts.find((s) => s.date === "2026-10-18" && s.roleId === "cook");
    const body = { shiftId: sunday.id, employeeId: "e7", overrideReason: "He offered" };
    assert.equal((await call("POST", "/api/assign", "e7", body)).status, 403);
    assert.equal((await call("POST", "/api/assign", "manager", { ...body, overrideReason: " " })).status, 400);
    const { status, data } = await call("POST", "/api/assign", "manager", body);
    assert.equal(status, 200);
    assert.ok(data.result.warnings.some((v) => v.ruleId === "R1" && v.shiftId === sunday.id));
  });

  test("the manager's state follows the week they pick", async () => {
    const live = await call("GET", "/api/state?periodId=p1", "manager");
    assert.equal(live.data.period.status, "published");
    const draft = await call("GET", "/api/state", "manager");
    assert.equal(draft.data.period.id, "p2");
  });

  test("withdrawing and dismissing use whoever is signed in", async () => {
    // tom posted w4. dana can't take it down for him
    assert.equal((await call("POST", "/api/withdraw-swap", "e1", { swapId: "w4" })).status, 400);
    assert.equal((await call("POST", "/api/withdraw-swap", "e3", { swapId: "w4" })).status, 200);
    const { data } = await call("GET", "/api/state", "e3");
    const notice = data.notices[0];
    assert.equal((await call("POST", "/api/dismiss-notice", "e1", { noticeId: notice.id })).status, 400);
    assert.equal((await call("POST", "/api/dismiss-notice", "e3", { noticeId: notice.id })).status, 200);
  });

  test("bad requests get a JSON error, not a crash", async () => {
    const res = await fetch(base + "/api/nope");
    assert.equal(res.status, 404);
    assert.ok((await res.json()).error);
    const cookie = await cookieFor("manager");
    const send = (body) => fetch(base + "/api/publish", { method: "POST", headers: { Cookie: cookie }, body });
    assert.equal((await send("{not json")).status, 400);
    assert.equal((await send("[1, 2]")).status, 400);
    assert.equal((await send("null")).status, 400);
    // wrong types in an otherwise fine body
    const typed = async (url, user, body) => (await call("POST", url, user, body)).status;
    assert.equal(await typed("/api/assign", "manager", { shiftId: true, employeeId: "e1" }), 400);
    assert.equal(await typed("/api/unpublish", "manager", { periodId: true }), 400);
    assert.equal(await typed("/api/time-off", "e3", { startDate: ["2026-10-20"], endDate: "2026-10-20" }), 400);
    assert.equal(await typed("/api/availability", "e3", { effectiveFrom: "2026-10-12", slots: [null] }), 400);
  });

  test("only the manager can reset the demo data", async () => {
    assert.equal((await call("POST", "/api/reset", "e1")).status, 403);
  });
});
