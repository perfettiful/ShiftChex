const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Repository = require("../src/persistence/repository");
const { open, migrate, migrations } = require("../src/persistence/db");

const fresh = () => new Repository(":memory:");

describe("repository tests", () => {
  test("runs each migration once", () => {
    const db = open(":memory:");
    assert.deepEqual(migrate(db), ["001_create_tables.sql", "002_add_indexes.sql"]);
    assert.deepEqual(migrate(db), []);
    assert.equal(migrations(db).length, 2);
  });

  test("loads 17 employees, 8 roles and 7 cert types", () => {
    const repo = fresh();
    assert.equal(repo.employees().length, 17);
    assert.equal(repo.roles().length, 8);
    assert.equal(repo.certTypes().length, 7);
  });

  test("builds the whole week of shifts", () => {
    // 11 a day, plus door on fri and sat
    assert.equal(fresh().currentPeriod().shifts.length, 79);
  });

  test("starts with four empty shifts", () => {
    const empty = fresh().currentPeriod().shifts.filter((s) => !s.isAssigned());
    assert.equal(empty.length, 4);
  });

  test("looks things up by id", () => {
    const repo = fresh();
    assert.equal(repo.employeesById().get("e1").name, "Dana Park");
    assert.equal(repo.rolesById().get("lead").name, "Manager / shift lead");
    assert.equal(repo.certTypesById().get("alcohol").graceDays, 60);
  });

  test("hands out ids in order, per kind", () => {
    const repo = fresh();
    assert.equal(repo.nextId("swap"), "swap-1");
    assert.equal(repo.nextId("swap"), "swap-2");
    assert.equal(repo.nextId("notice"), "notice-1");
  });

  test("reset puts everything back", () => {
    const repo = fresh();
    const s = repo.currentPeriod().shifts[0];
    s.assign("e11");
    repo.saveShift(s);
    repo.addAudit({ at: "2026-10-05", what: "test" });
    repo.reset();
    assert.equal(repo.currentPeriod().shifts[0].employeeId, "e10");
    assert.equal(repo.audit().length, 0);
    assert.equal(repo.nextId("swap"), "swap-1");
  });

  test("changes are still there after reopening the file", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "shiftchex-")), "test.db");
    const repo = new Repository(file);
    const s = repo.currentPeriod().shifts[0];
    s.assign("e11");
    repo.saveShift(s);
    repo.addNotice({ id: repo.nextId("notice"), employeeId: "e11", text: "hi" });
    repo.close();

    const again = new Repository(file);
    assert.equal(again.currentPeriod().shifts[0].employeeId, "e11");
    assert.deepEqual(again.notices(), [{ id: "notice-1", employeeId: "e11", text: "hi" }]);
    again.close();
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });
});
