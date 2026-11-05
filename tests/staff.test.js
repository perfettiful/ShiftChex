const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { buildApp } = require("./helpers");

// UC-13 add employee. goes through the controller, then reads it back from the db

const JANE = { name: "Jane Doe", dateOfBirth: "2000-04-02", hireDate: "2026-10-05", roleId: "server", hourlyRate: 16 };

describe("staff tests", () => {
  describe("UC-13 add employee", () => {
    test("saved with their role and pay", () => {
      const app = buildApp();
      const r = app.staff.add({ ...JANE, maxHoursPreference: "30" });
      assert.ok(r.ok);
      const jane = app.repo.employeesById().get(r.employee.id);
      assert.equal(jane.name, "Jane Doe");
      assert.equal(jane.hireDate, "2026-10-05");
      assert.equal(jane.maxHoursPreference, 30);
      assert.equal(jane.rateFor("server"), 16);
    });

    test("they can sign in with the demo password", () => {
      const app = buildApp();
      const r = app.staff.add(JANE);
      assert.equal(r.username, "jane.doe");
      const login = app.session.login("jane.doe", "shiftchex");
      assert.ok(login.ok);
      assert.equal(login.user.employeeId, r.employee.id);
      assert.equal(login.user.role, "employee");
    });

    test("the same name twice gets a different username", () => {
      const app = buildApp();
      assert.equal(app.staff.add(JANE).username, "jane.doe");
      assert.equal(app.staff.add(JANE).username, "jane.doe2");
    });

    test("certs they don't have yet fall in the new hire window", () => {
      const app = buildApp();
      const { employee } = app.staff.add({ ...JANE, hireDate: app.repo.today() });
      const jane = app.repo.employeesById().get(employee.id);
      const graced = app.repo.certTypes().find((t) => t.graceDays > 0);
      const status = jane.certStatus(graced, app.repo.today());
      assert.ok(status.missing);
      assert.ok(status.ok);
    });

    test("goes in the audit log", () => {
      const app = buildApp();
      app.staff.add(JANE);
      assert.equal(app.repo.audit().at(-1).what, "Added Jane Doe as Server at $16/hr.");
    });

    test("bad input is turned away and nothing is saved", () => {
      const app = buildApp();
      const before = app.repo.employees().length;
      const bad = [
        { name: "  " },
        { dateOfBirth: "2000-02-30" },
        { hireDate: "soon" },
        { dateOfBirth: "2026-10-06" },
        { roleId: "astronaut" },
        { hourlyRate: 0 },
        { hourlyRate: "lots" },
        { maxHoursPreference: 0 },
      ];
      for (const change of bad) assert.ok(app.staff.add({ ...JANE, ...change }).error, JSON.stringify(change));
      assert.equal(app.repo.employees().length, before);
      assert.equal(app.repo.accountByUsername("jane.doe"), null);
    });
  });
});
