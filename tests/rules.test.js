const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/domain/rules");
const { TimeOffRequest, Availability } = require("../src/domain");
const { ctx, person, shift } = require("./helpers");

// each rule by itself. one that passes, one that fails, and the edge case if there's a threshold

describe("rule tests", () => {
  describe("R1 availability", () => {
    const riya = person("e1", "Riya", { from: "16:00", to: "23:00" });
    const run = (s) => new R.AvailabilityRule().check(ctx({ shifts: [s], employees: [riya] }));

    test("inside her hours is fine", () => {
      assert.equal(run(shift({ employeeId: "e1", start: "17:00", end: "22:00" })).length, 0);
    });
    test("outside her hours blocks", () => {
      const v = run(shift({ employeeId: "e1", start: "11:00", end: "17:00" }));
      assert.equal(v.length, 1);
      assert.equal(v[0].severity, "blocking");
    });
    test("edge: exactly her window is fine", () => {
      assert.equal(run(shift({ employeeId: "e1", start: "16:00", end: "23:00" })).length, 0);
    });
    test("only the newest declaration that has started counts", () => {
      // all day since 2020, then from october only monday evenings
      const e = person("e1", "Riya");
      e.availability.push(new Availability({ weekday: 1, startTime: "16:00", endTime: "23:00", effectiveFrom: "2026-10-01" }));
      const check = (date, start, end) => new R.AvailabilityRule()
        .check(ctx({ shifts: [shift({ employeeId: "e1", date, start, end })], employees: [e] })).length;
      assert.equal(check("2026-10-12", "17:00", "22:00"), 0);
      assert.equal(check("2026-10-12", "11:00", "17:00"), 1);
      assert.equal(check("2026-10-13", "17:00", "22:00"), 1);
    });
    test("an override turns it into a warning", () => {
      const v = run(shift({ employeeId: "e1", start: "11:00", end: "17:00", overrideReason: "asked her" }));
      assert.equal(v[0].severity, "warning");
    });
  });

  describe("R2 time off", () => {
    const off = (status) => [new TimeOffRequest({ id: "x", employeeId: "e1", startDate: "2026-10-14",
                                                  endDate: "2026-10-16", reason: "trip", status })];
    const run = (status, date) => new R.TimeOffRule().check(ctx({
      shifts: [shift({ employeeId: "e1", date })],
      employees: [person("e1", "Sam", { timeOff: off(status) })],
    }));

    test("approved time off blocks", () => {
      assert.equal(run("approved", "2026-10-15").length, 1);
    });
    test("edge: the first day off is blocked too", () => {
      assert.equal(run("approved", "2026-10-14").length, 1);
    });
    test("a pending request doesn't block", () => {
      assert.equal(run("pending", "2026-10-15").length, 0);
    });
  });

  describe("R3 rest", () => {
    const run = (...shifts) => new R.RestRule().check(ctx({ shifts, employees: [person("e1", "Ben")] }));
    const close = () => shift({ employeeId: "e1", date: "2026-10-12", start: "14:00", end: "23:00" });
    const open = (start) => shift({ employeeId: "e1", date: "2026-10-13", start, end: "17:00" });

    test("plenty of rest is fine", () => {
      assert.equal(run(close(), open("11:00")).length, 0);
    });
    test("9 hours blocks", () => {
      const v = run(close(), open("08:00"));
      assert.equal(v.length, 1);
      assert.match(v[0].message, /9\.0 hours rest/);
    });
    test("the server's time zone and daylight saving don't change the answer", () => {
      // clocks go back the night of 10/31 in Chicago. it's still 9 hours on the schedule
      const zone = process.env.TZ;
      process.env.TZ = "America/Chicago";
      try {
        const v = run(shift({ employeeId: "e1", date: "2026-10-31", start: "14:00", end: "23:00" }),
                      shift({ employeeId: "e1", date: "2026-11-01", start: "08:00", end: "17:00" }));
        assert.match(v[0].message, /9\.0 hours rest/);
      } finally {
        if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone;
      }
    });
    test("edge: exactly 10 hours is fine", () => {
      assert.equal(run(close(), open("09:00")).length, 0);
    });
    test("overlapping shifts say double booked", () => {
      const v = run(shift({ employeeId: "e1", start: "17:00", end: "22:00" }),
                    shift({ employeeId: "e1", start: "17:00", end: "23:00" }));
      assert.equal(v.length, 1);
      assert.match(v[0].message, /double booked/);
      assert.doesNotMatch(v[0].message, /-\d/);
    });
    test("a shift inside a longer one is still caught", () => {
      const v = run(shift({ employeeId: "e1", start: "08:00", end: "23:00" }),
                    shift({ employeeId: "e1", start: "12:00", end: "14:00" }),
                    shift({ employeeId: "e1", start: "15:00", end: "16:00" }));
      assert.equal(v.length, 2);
      v.forEach((x) => assert.match(x.message, /double booked/));
    });

    // the week is 10/12 to 10/18, so 10/11 and 10/19 belong to the weeks either side
    const withNearby = (inWeek, nearby) => new R.RestRule().check(ctx({
      shifts: [inWeek], nearby, employees: [person("e1", "Ben")] }));
    test("closing the sunday before and opening monday blocks, on monday's shift", () => {
      const lastSunday = shift({ employeeId: "e1", date: "2026-10-11", start: "16:00", end: "23:00" });
      const monday = shift({ employeeId: "e1", date: "2026-10-12", start: "08:00", end: "16:00" });
      const v = withNearby(monday, [lastSunday]);
      assert.equal(v.length, 1);
      assert.equal(v[0].shiftId, monday.id);
      assert.match(v[0].message, /Sun, 10\/11.*9\.0 hours rest/);
    });
    test("closing sunday and opening the next monday blocks, on sunday's shift", () => {
      const sunday = shift({ employeeId: "e1", date: "2026-10-18", start: "16:00", end: "23:00" });
      const nextMonday = shift({ employeeId: "e1", date: "2026-10-19", start: "08:00", end: "16:00" });
      const v = withNearby(sunday, [nextMonday]);
      assert.equal(v.length, 1);
      assert.equal(v[0].shiftId, sunday.id);
    });
    test("the weeks either side don't get checked against each other", () => {
      const a = shift({ employeeId: "e1", date: "2026-10-11", start: "16:00", end: "23:00" });
      const b = shift({ employeeId: "e1", date: "2026-10-11", start: "17:00", end: "18:00" });
      assert.equal(withNearby(shift({ employeeId: "e1", date: "2026-10-14" }), [a, b]).length, 0);
    });
  });

  describe("R4 under 18", () => {
    const kai = person("e1", "Kai", { dob: "2009-03-14" });
    const adult = person("e2", "Dana");
    const run = (who, start, end) => new R.MinorHoursRule().check(ctx({
      shifts: [shift({ employeeId: who.id, start, end })], employees: [kai, adult],
    }));

    test("adults can close", () => {
      assert.equal(run(adult, "17:00", "23:00").length, 0);
    });
    test("past curfew blocks", () => {
      assert.equal(run(kai, "17:00", "23:00").length, 1);
    });
    test("edge: ending right at curfew is fine", () => {
      assert.equal(run(kai, "17:00", "22:00").length, 0);
    });
    test("over the daily cap blocks", () => {
      assert.equal(run(kai, "08:00", "17:00").length, 1);
    });
    test("edge: exactly 8 hours is fine", () => {
      assert.equal(run(kai, "09:00", "17:00").length, 0);
    });
    test("the cap is for the whole day, two short shifts can go over it", () => {
      const v = new R.MinorHoursRule().check(ctx({ employees: [kai], shifts: [
        shift({ employeeId: "e1", start: "08:00", end: "13:00" }),
        shift({ employeeId: "e1", start: "15:00", end: "20:00" })] }));
      assert.equal(v.length, 1);
      assert.match(v[0].message, /would work 10 hours/);
    });
  });

  describe("R5 qualification", () => {
    const run = (roleId) => new R.QualificationRule().check(ctx({
      shifts: [shift({ employeeId: "e1", roleId })], employees: [person("e1", "Luis")],
    }));

    test("trained for the role is fine", () => {
      assert.equal(run("server").length, 0);
    });
    test("not trained blocks", () => {
      assert.match(run("bartender")[0].message, /not trained for Bartender/);
    });
  });

  describe("R6 coverage", () => {
    test("a filled shift is covered", () => {
      const c = ctx({ shifts: [shift({ employeeId: "e1" })], employees: [person("e1", "Ana")] });
      assert.equal(new R.CoverageRule().check(c).length, 0);
    });
    test("an empty shift blocks", () => {
      assert.equal(new R.CoverageRule().check(ctx({ shifts: [shift()] })).length, 1);
    });
  });

  describe("R7 overtime", () => {
    // 8 hour shifts on different days
    const days = (count) => Array.from({ length: count }, (_, i) =>
      shift({ employeeId: "e1", date: `2026-10-1${2 + i}`, start: "09:00", end: "17:00" }));
    const run = (count) => new R.OvertimeRule().check(ctx({ shifts: days(count), employees: [person("e1", "Tom")] }));

    test("under 40 is quiet", () => {
      assert.equal(run(4).length, 0);
    });
    test("edge: exactly 40 is quiet", () => {
      assert.equal(run(5).length, 0);
    });
    test("over 40 warns, doesn't block", () => {
      const v = run(6);
      assert.equal(v.length, 1);
      assert.equal(v[0].severity, "warning");
    });
  });

  describe("R8 budget", () => {
    // $20 an hour against a $100 budget
    const run = (end) => new R.BudgetRule().check(ctx({
      budget: 100, shifts: [shift({ employeeId: "e1", start: "09:00", end })], employees: [person("e1", "Mia")],
    }));

    test("under budget is quiet", () => {
      assert.equal(run("13:00").length, 0);
    });
    test("edge: exactly on budget is quiet", () => {
      assert.equal(run("14:00").length, 0);
    });
    test("over budget warns", () => {
      assert.equal(run("15:00")[0].severity, "warning");
    });
  });

  describe("R9 notice", () => {
    // period starts 10/12
    const run = (today) => new R.NoticeRule().check(ctx({ today }));

    test("plenty of notice is quiet", () => {
      assert.equal(run("2026-09-01").length, 0);
    });
    test("edge: exactly 14 days is quiet", () => {
      assert.equal(run("2026-09-28").length, 0);
    });
    test("short notice warns", () => {
      assert.equal(run("2026-10-05")[0].severity, "warning");
    });
    test("once it's published, it counts from the publish date, not today", () => {
      const published = (publishedOn) => new R.NoticeRule().check(ctx({ today: "2026-10-12", publishedOn }));
      assert.equal(published("2026-09-28").length, 0);
      assert.match(published("2026-10-05")[0].message, /went out 7 days ahead/);
    });
  });

  describe("R10 certifications", () => {
    const run = (who, s) => new R.CertificationRule().check(ctx({ shifts: [s], employees: [who] }));
    const bar = (date = "2026-10-16") => shift({ employeeId: "e1", roleId: "bartender", date });

    test("a current cert is fine", () => {
      const lena = person("e1", "Lena", { roles: ["bartender"], certs: [["alcohol", "2025-01-01", "2028-01-01"]] });
      assert.equal(run(lena, bar()).length, 0);
    });
    test("good today but expired by the shift date blocks", () => {
      // today is 10/1, cert ends 10/14, shift is 10/16
      const marcus = person("e1", "Marcus", { roles: ["bartender"], certs: [["alcohol", "2023-10-14", "2026-10-14"]] });
      const v = run(marcus, bar());
      assert.equal(v[0].severity, "blocking");
      assert.match(v[0].message, /expired/);
    });
    test("new hires get a warning in the window and a block after", () => {
      const fresh = person("e1", "Jordan", { roles: ["bartender"], hired: "2026-09-20" });
      assert.equal(run(fresh, bar())[0].severity, "warning");
      const late = person("e1", "Priya", { roles: ["bartender"], hired: "2026-07-01" });
      assert.match(run(late, bar())[0].message, /window closed/);
    });
    test("a duty-only cert only counts when the shift has that duty", () => {
      const nora = person("e1", "Nora", { roles: ["busser"] });
      assert.equal(run(nora, shift({ employeeId: "e1", roleId: "busser" })).length, 0);
      assert.equal(run(nora, shift({ employeeId: "e1", roleId: "busser", duties: ["carriesDrinks"] })).length, 1);
    });
  });

  describe("R11 on-site certs", () => {
    const omar = person("e1", "Omar", { roles: ["lead"], certs: [["foodManager", "2024-01-01", "2029-01-01"]] });
    const dana = person("e2", "Dana");
    const run = (leadEnd) => new R.OnSiteCertRule().check(ctx({
      settings: { siteCerts: ["foodManager"] },
      employees: [omar, dana],
      shifts: [shift({ employeeId: "e1", roleId: "lead", start: "08:00", end: leadEnd }),
               shift({ employeeId: "e2", start: "11:00", end: "17:00" })],
    }));

    test("someone certified on site the whole time is fine", () => {
      assert.equal(run("17:00").length, 0);
    });
    test("reports the stretch where nobody's certified", () => {
      const v = run("16:00");
      assert.equal(v.length, 1);
      assert.match(v[0].message, /4pm to 5pm/);
    });
    test("a new hire still inside their window doesn't count as holding it", () => {
      // alcohol gives new hires 60 days, and jo was hired a week before
      const jo = person("e3", "Jo", { hired: "2026-10-05" });
      const v = new R.OnSiteCertRule().check(ctx({ settings: { siteCerts: ["alcohol"] }, employees: [jo],
        shifts: [shift({ employeeId: "e3", start: "11:00", end: "17:00" })] }));
      assert.equal(v.length, 1);
    });
  });
});
