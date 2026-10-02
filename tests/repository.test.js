const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const Repository = require("../src/persistence/repository");

describe("repository tests", () => {
  test("loads all 17 employees", () => {
    assert.equal(new Repository().employees().length, 17);
  });

  test("loads 8 roles and 7 cert types", () => {
    const repo = new Repository();
    assert.equal(repo.roles().length, 8);
    assert.equal(repo.certTypes().length, 7);
  });

  test("builds the whole week of shifts", () => {
    // 11 a day, plus door on fri and sat
    assert.equal(new Repository().currentPeriod().shifts.length, 79);
  });

  test("starts with four empty shifts", () => {
    const empty = new Repository().currentPeriod().shifts.filter((s) => !s.isAssigned());
    assert.equal(empty.length, 4);
  });

  test("looks things up by id", () => {
    const repo = new Repository();
    assert.equal(repo.employeesById().get("e1").name, "Dana Park");
    assert.equal(repo.rolesById().get("lead").name, "Manager / shift lead");
    assert.equal(repo.certTypesById().get("alcohol").graceDays, 60);
  });

  test("hands out ids in order, per kind", () => {
    const repo = new Repository();
    assert.equal(repo.nextId("swap"), "swap-1");
    assert.equal(repo.nextId("swap"), "swap-2");
    assert.equal(repo.nextId("notice"), "notice-1");
  });

  test("reset puts everything back", () => {
    const repo = new Repository();
    repo.currentPeriod().shifts.pop();
    repo.swaps().push({ id: "x" });
    repo.reset();
    assert.equal(repo.currentPeriod().shifts.length, 79);
    assert.equal(repo.swaps().length, 0);
  });

  test("a change is still there on the next read", () => {
    const repo = new Repository();
    repo.currentPeriod().shifts[0].assign("e11");
    assert.equal(repo.currentPeriod().shifts[0].employeeId, "e11");
  });
});
