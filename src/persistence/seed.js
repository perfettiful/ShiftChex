const { Employee, Role, Qualification, Availability, TimeOffRequest,
        Shift, SchedulePeriod } = require("../domain");

// fake demo data for a restaurant. dates are fixed so the demo is the same every run
const TODAY = "2026-10-05";
const WEEK_START = "2026-10-12";

const DAYS = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(WEEK_START + "T12:00:00");
  d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 10);
});

const BLOCKS = [
  { roleId: "server",    startTime: "11:00", endTime: "17:00", slots: 2 },
  { roleId: "server",    startTime: "17:00", endTime: "23:00", slots: 2 },
  { roleId: "bartender", startTime: "17:00", endTime: "23:00", slots: 1 },
  { roleId: "host",      startTime: "17:00", endTime: "22:00", slots: 1 },
  { roleId: "cook",      startTime: "08:00", endTime: "16:00", slots: 1 },
];

const allWeek = (from = "2026-01-01", startTime = "06:00", endTime = "23:59") =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) =>
    new Availability({ weekday, startTime, endTime, effectiveFrom: from }));

function seed() {
  const roles = [
    new Role({ id: "server", name: "Server" }),
    new Role({ id: "bartender", name: "Bartender", requiresCert: true }),
    new Role({ id: "host", name: "Host" }),
    new Role({ id: "cook", name: "Cook" }),
  ];

  const people = [
    { id: "e1", name: "Dana Park",    dob: "1998-04-02", quals: [["server", 17], ["host", 15]] },
    { id: "e2", name: "Sam Ruiz",     dob: "1996-11-20", quals: [["server", 17.5], ["host", 15]] },
    { id: "e3", name: "Tom Nguyen",   dob: "1994-01-15", quals: [["server", 18], ["bartender", 21, "2026-11-30"]] },
    { id: "e4", name: "Lena Haas",    dob: "1999-07-08", quals: [["bartender", 22, "2026-10-15"]] },
    { id: "e5", name: "Marcus Okoye", dob: "1993-02-27", quals: [["bartender", 22, "2026-09-30"], ["server", 17]] },
    { id: "e6", name: "Ana Diaz",     dob: "1991-09-11", quals: [["cook", 20]] },
    { id: "e7", name: "Ben Cole",     dob: "1997-05-30", quals: [["cook", 19.5], ["server", 17]] },
    { id: "e8", name: "Riya Iyer",    dob: "2000-12-01", quals: [["server", 17]] },
    // under 18 during this period -> triggers R4
    { id: "e9", name: "Kai Obi",      dob: "2009-03-14", quals: [["host", 14], ["server", 15]] },
  ];

  const employees = people.map((p) => {
    const e = new Employee({ id: p.id, name: p.name, dateOfBirth: p.dob, hireDate: "2025-06-01" });
    e.qualifications = p.quals.map(([roleId, hourlyRate, certExpiresOn = null]) =>
      new Qualification({ roleId, hourlyRate, certExpiresOn }));
    e.availability = allWeek();
    return e;
  });

  const byId = new Map(employees.map((e) => [e.id, e]));
  // riya is evenings only (lunch shift trips R1)
  byId.get("e8").availability = allWeek("2026-01-01", "16:00", "23:59");
  // ben doesn't work sundays
  byId.get("e7").availability = allWeek().filter((a) => a.weekday !== 0);

  const timeOff = [
    new TimeOffRequest({ id: "t1", employeeId: "e2", startDate: "2026-10-14",
      endDate: "2026-10-16", reason: "Family", status: "approved" }),
    new TimeOffRequest({ id: "t2", employeeId: "e6", startDate: "2026-10-17",
      endDate: "2026-10-17", reason: "Appointment", status: "pending" }),
  ];
  timeOff.filter((t) => t.status === "approved")
         .forEach((t) => byId.get(t.employeeId).timeOff.push(t));

  const period = new SchedulePeriod({
    id: "p1", startDate: WEEK_START, endDate: DAYS[6], status: "draft", budget: 5200,
  });

  // starting roster, left a few slots empty on purpose so coverage shows up
  const roster = {
    server_11:    [["e1","e2"], ["e1",null], ["e1","e5"], ["e7","e5"], ["e5","e7"], ["e1","e5"], ["e1","e5"]],
    server_17:    [["e3","e7"], ["e3","e8"], ["e3","e8"], ["e3","e8"], ["e1","e8"], ["e2","e8"], ["e2","e8"]],
    bartender_17: [["e4"],      ["e4"],      ["e4"],      [null],      ["e3"],      ["e3"],      ["e3"]],
    host_17:      [["e9"],      ["e9"],      ["e9"],      ["e9"],      ["e9"],      ["e9"],      ["e9"]],
    cook_08:      [["e6"],      ["e6"],      ["e6"],      ["e6"],      ["e6"],      ["e7"],      [null]],
  };

  let n = 1;
  BLOCKS.forEach((b) => {
    const key = `${b.roleId}_${b.startTime.slice(0, 2)}`;
    DAYS.forEach((date, di) => {
      const assigned = (roster[key] && roster[key][di]) || [];
      for (let slot = 0; slot < b.slots; slot++) {
        const who = assigned[slot] ?? null;
        period.addShift(new Shift({
          id: `s${n++}`, periodId: period.id, roleId: b.roleId, date,
          startTime: b.startTime, endTime: b.endTime, employeeId: who,
        }));
      }
    });
  });

  return {
    organization: { id: "org1", name: "Northside Grill" },
    today: TODAY, roles, employees, period, timeOff,
    settings: {
      minRestHours: 10,
      overtimeThreshold: 40,
      minorMaxDailyHours: 8,
      minorCurfew: "22:00",
      noticeDays: 14,
    },
  };
}
module.exports = seed;
