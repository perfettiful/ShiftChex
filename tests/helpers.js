const { Employee, Role, Qualification, CertType, Certificate, Availability,
        Shift, SchedulePeriod } = require("../src/domain");
const { buildApp } = require("../src/application/wiring");

const SETTINGS = {
  minRestHours: 10, overtimeThreshold: 40, minorMaxDailyHours: 8,
  minorCurfew: "22:00", noticeDays: 14, siteCerts: [],
};

const CERTS = [
  new CertType({ id: "alcohol", name: "Alcohol Server Certification", graceDays: 60, renewYears: 3 }),
  new CertType({ id: "foodManager", name: "Food Manager Certification", graceDays: 0, renewYears: 5 }),
];

const ROLES = [
  new Role({ id: "server", name: "Server" }),
  new Role({ id: "bartender", name: "Bartender", certs: ["alcohol"] }),
  new Role({ id: "busser", name: "Busser", certs: [{ certTypeId: "alcohol", onlyIf: "carriesDrinks" }] }),
  new Role({ id: "lead", name: "Shift lead" }),
];

// just what the rules read. no repo, no server
function ctx({ shifts = [], employees = [], scope = "period", today = "2026-10-01",
               budget = 10000, settings = {} } = {}) {
  const period = new SchedulePeriod({ id: "p", startDate: "2026-10-12", endDate: "2026-10-18", budget });
  period.shifts = shifts;
  return {
    scope, period, shifts, today,
    settings: { ...SETTINGS, ...settings },
    employeeById: new Map(employees.map((e) => [e.id, e])),
    roleById: new Map(ROLES.map((r) => [r.id, r])),
    certTypeById: new Map(CERTS.map((c) => [c.id, c])),
  };
}

// certs are [type, issuedOn, expiresOn]
function person(id, name, { dob = "1995-01-01", hired = "2025-01-01", roles = ["server"],
                            from = "06:00", to = "23:59", certs = [], timeOff = [] } = {}) {
  const e = new Employee({ id, name, dateOfBirth: dob, hireDate: hired });
  e.qualifications = roles.map((roleId) => new Qualification({ roleId, hourlyRate: 20 }));
  e.availability = [0, 1, 2, 3, 4, 5, 6].map((weekday) =>
    new Availability({ weekday, startTime: from, endTime: to, effectiveFrom: "2020-01-01" }));
  e.certs = certs.map(([certTypeId, issuedOn, expiresOn]) => new Certificate({ certTypeId, issuedOn, expiresOn }));
  e.timeOff = timeOff;
  return e;
}

let n = 0;
function shift({ employeeId = null, roleId = "server", date = "2026-10-12", start = "11:00",
                 end = "17:00", duties = [], overrideReason = null } = {}) {
  return new Shift({ id: `t${++n}`, periodId: "p", roleId, date, startTime: start,
                     endTime: end, employeeId, duties, overrideReason });
}

// the four fills that clear the seeded week
const FILLS = [
  ["2026-10-18", "lead", "16:00", "e12"],
  ["2026-10-18", "cook", "08:00", "e6"],
  ["2026-10-13", "server", "11:00", "e2"],
  ["2026-10-15", "bartender", "17:00", "e4"],
];

function publishable() {
  const app = buildApp();
  const shifts = app.repo.currentPeriod().shifts;
  for (const [date, roleId, start, who] of FILLS) {
    const s = shifts.find((x) => x.date === date && x.roleId === roleId && x.startTime === start && !x.isAssigned());
    app.schedule.assign(s.id, who);
  }
  return app;
}

const find = (app, date, roleId, start) =>
  app.repo.currentPeriod().shifts.find((s) => s.date === date && s.roleId === roleId && s.startTime === start);

const ruleIds = (violations) => violations.map((v) => v.ruleId).sort();

module.exports = { ctx, person, shift, buildApp, publishable, find, ruleIds };
