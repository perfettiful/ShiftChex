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

  test("screens are read from the database, not kept in memory", () => {
    // write through one connection, read through another, no restart in between
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftchex-"));
    const file = path.join(dir, "test.db");
    const a = wiring.buildApp({ db: file });
    const b = wiring.buildApp({ db: file });
    const timeOff = () => a.session.stateFor(a.session.user("e3")).timeOff.length;
    const before = timeOff();
    b.availability.requestTimeOff("e3", { startDate: "2026-10-13", endDate: "2026-10-13" });
    assert.equal(timeOff(), before + 1);
    a.repo.close();
    b.repo.close();
    fs.rmSync(dir, { recursive: true, force: true });
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

  const call = async (method, url, user, body) => {
    const headers = { "Content-Type": "application/json", ...(user ? { "X-User-Id": user } : {}) };
    const res = await fetch(base + url, { method, headers, body: body && JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };

  test("the sign in list comes from the server, manager first", async () => {
    const { data } = await call("GET", "/api/users");
    assert.equal(data[0].role, "manager");
    assert.equal(data.filter((u) => u.role === "employee").length, 17);
  });

  test("nothing works without saying who you are", async () => {
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
  });
});
