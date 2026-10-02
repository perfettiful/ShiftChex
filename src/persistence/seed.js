const { Employee, Role, Qualification, CertType, Certificate, Availability,
        TimeOffRequest, Shift, SchedulePeriod } = require("../domain");

// fake demo data for a restaurant. dates are fixed so the demo is the same every run
const TODAY = "2026-10-05";
const WEEK_START = "2026-10-12";

const DAYS = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(WEEK_START + "T12:00:00");
  d.setDate(d.getDate() + i);
  return d.toISOString().slice(0, 10);
});

// days/dutyDays are indexes into DAYS (0 = mon). no days means every day
const BLOCKS = [
  { roleId: "lead",      startTime: "08:00", endTime: "16:00", slots: 1 },
  { roleId: "lead",      startTime: "16:00", endTime: "23:00", slots: 1 },
  { roleId: "cook",      startTime: "08:00", endTime: "16:00", slots: 1 },
  { roleId: "server",    startTime: "11:00", endTime: "17:00", slots: 2 },
  { roleId: "server",    startTime: "17:00", endTime: "23:00", slots: 2 },
  { roleId: "bartender", startTime: "17:00", endTime: "23:00", slots: 1 },
  { roleId: "busser",    startTime: "17:00", endTime: "22:00", slots: 1, duties: ["carriesDrinks"] },
  { roleId: "host",      startTime: "17:00", endTime: "22:00", slots: 1, duties: ["checksIds"], dutyDays: [4, 5] },
  { roleId: "dish",      startTime: "16:00", endTime: "23:00", slots: 1 },
  { roleId: "door",      startTime: "20:00", endTime: "23:00", slots: 1, days: [4, 5] },
];

const allWeek = (from = "2026-01-01", startTime = "06:00", endTime = "23:59") =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) =>
    new Availability({ weekday, startTime, endTime, effectiveFrom: from }));

const addYears = (date, n) => `${Number(date.slice(0, 4)) + n}${date.slice(4)}`;

// when everyone's certs were issued unless a person overrides it
const ISSUED = {
  foodHandler: "2025-03-01", medical: "2026-03-01", hygiene: "2025-08-01",
  alcohol: "2025-05-01", allergen: "2025-05-01", foodManager: "2024-01-15", firstAid: "2025-09-01",
};
const KITCHEN = ["foodHandler", "medical", "hygiene"];
const FLOOR = [...KITCHEN, "alcohol", "allergen"];

function seed() {
  const certTypes = [
    new CertType({ id: "foodHandler", name: "Food Handler Card",             graceDays: 30, renewYears: 3 }),
    new CertType({ id: "medical",     name: "Medical Health Card",           graceDays: 0,  renewYears: 1 }),
    new CertType({ id: "hygiene",     name: "Hygiene Refresher Training",    graceDays: 0,  renewYears: 2 }),
    new CertType({ id: "alcohol",     name: "Alcohol Server Certification",  graceDays: 60, renewYears: 3 }),
    new CertType({ id: "allergen",    name: "Allergen Awareness Training",   graceDays: 30, renewYears: 3 }),
    new CertType({ id: "foodManager", name: "Food Manager Certification",    graceDays: 0,  renewYears: 5 }),
    new CertType({ id: "firstAid",    name: "First Aid / CPR Certification", graceDays: 0,  renewYears: 2 }),
  ];
  const renewYears = new Map(certTypes.map((c) => [c.id, c.renewYears]));

  const roles = [
    new Role({ id: "lead",      name: "Manager / shift lead", certs: [...FLOOR, "foodManager"] }),
    new Role({ id: "cook",      name: "Cook / prep",          certs: KITCHEN }),
    new Role({ id: "server",    name: "Server",               certs: FLOOR }),
    new Role({ id: "bartender", name: "Bartender / barback",  certs: FLOOR }),
    new Role({ id: "busser",    name: "Busser",
      certs: [...KITCHEN, { certTypeId: "alcohol", onlyIf: "carriesDrinks" }] }),
    new Role({ id: "host",      name: "Host",
      certs: [{ certTypeId: "alcohol", onlyIf: "checksIds" }, "allergen"] }),
    new Role({ id: "dish",      name: "Dishwasher",           certs: KITCHEN }),
    new Role({ id: "door",      name: "Door / security",      certs: ["alcohol"] }),
  ];

  // certs: list of cert ids, or [id, issuedOn] to override the default date
  const people = [
    { id: "e1",  name: "Dana Park",    dob: "1998-04-02", quals: [["server", 17], ["host", 15]],
      certs: [...FLOOR, "firstAid"] },
    { id: "e2",  name: "Sam Ruiz",     dob: "1996-11-20", quals: [["server", 17.5], ["host", 15]],
      certs: [...FLOOR, "firstAid"] },
    { id: "e3",  name: "Tom Nguyen",   dob: "1994-01-15", quals: [["server", 18], ["bartender", 21]],
      certs: [...FLOOR, "firstAid"] },
    // alcohol cert runs out thu 10/15
    { id: "e4",  name: "Lena Haas",    dob: "1999-07-08", quals: [["bartender", 22]],
      certs: [...KITCHEN, "allergen", ["alcohol", "2023-10-15"]] },
    // alcohol cert lapsed 9/30, fine for dish but not the bar
    { id: "e5",  name: "Marcus Okoye", dob: "1993-02-27", quals: [["bartender", 22], ["dish", 16]],
      certs: [...KITCHEN, "allergen", ["alcohol", "2023-09-30"]] },
    { id: "e6",  name: "Ana Diaz",     dob: "1991-09-11", quals: [["cook", 20]],
      certs: [...KITCHEN, "foodManager", "firstAid"] },
    { id: "e7",  name: "Ben Cole",     dob: "1997-05-30", quals: [["cook", 19.5], ["server", 17]],
      certs: [...FLOOR, "firstAid"] },
    { id: "e8",  name: "Riya Iyer",    dob: "2000-12-01", quals: [["server", 17]],
      certs: FLOOR },
    // under 18 during this period -> triggers R4. no alcohol cert either
    { id: "e9",  name: "Kai Obi",      dob: "2009-03-14", quals: [["host", 14], ["server", 15]],
      certs: [...KITCHEN, "allergen"] },
    // food manager cert runs out wed 10/14
    { id: "e10", name: "Grace Kim",    dob: "1990-06-21", quals: [["lead", 24], ["server", 18]],
      certs: [...FLOOR, ["foodManager", "2021-10-14"], "firstAid"] },
    { id: "e11", name: "Omar Farah",   dob: "1988-03-09", quals: [["lead", 25]],
      certs: [...FLOOR, "foodManager", "firstAid"] },
    // no first aid
    { id: "e12", name: "Mia Torres",   dob: "1995-10-30", quals: [["lead", 23], ["bartender", 21]],
      certs: [...FLOOR, "foodManager"] },
    // new hire still inside the grace windows
    { id: "e13", name: "Jordan Lee",   dob: "2003-08-17", hired: "2026-09-21", quals: [["server", 16]],
      certs: [["medical", "2026-09-18"], ["hygiene", "2026-09-18"]] },
    // hired 8/20, food handler window closed 9/19
    { id: "e14", name: "Priya Shah",   dob: "2004-02-05", hired: "2026-08-20", quals: [["dish", 15], ["busser", 14]],
      certs: [["medical", "2026-08-15"], ["hygiene", "2026-08-15"]] },
    { id: "e15", name: "Luis Vega",    dob: "2001-01-26", quals: [["dish", 15]],
      certs: KITCHEN },
    { id: "e16", name: "Theo Brandt",  dob: "1992-12-12", quals: [["door", 18]],
      certs: ["alcohol"] },
    { id: "e17", name: "Nora Quinn",   dob: "2002-05-19", quals: [["busser", 14]],
      certs: [...KITCHEN, "alcohol"] },
  ];

  const employees = people.map((p) => {
    const e = new Employee({ id: p.id, name: p.name, dateOfBirth: p.dob, hireDate: p.hired || "2025-06-01" });
    e.qualifications = p.quals.map(([roleId, hourlyRate]) => new Qualification({ roleId, hourlyRate }));
    e.certs = p.certs.map((c) => {
      const [certTypeId, issuedOn = ISSUED[certTypeId]] = Array.isArray(c) ? c : [c];
      return new Certificate({ certTypeId, issuedOn, expiresOn: addYears(issuedOn, renewYears.get(certTypeId)) });
    });
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
    id: "p1", startDate: WEEK_START, endDate: DAYS[6], status: "draft", budget: 9500,
  });

  // starting roster, left a few slots empty on purpose so coverage shows up
  //                mon           tue           wed           thu           fri            sat            sun
  const roster = {
    lead_08:      [["e10"],      ["e10"],      ["e10"],      ["e11"],      ["e11"],       ["e11"],       ["e11"]],
    lead_16:      [["e11"],      ["e12"],      ["e12"],      ["e12"],      ["e12"],       ["e12"],       [null]],
    cook_08:      [["e6"],       ["e6"],       ["e6"],       ["e6"],       ["e6"],        ["e7"],        [null]],
    server_11:    [["e1","e2"],  ["e1",null],  ["e1","e7"],  ["e1","e7"],  ["e7","e13"],  ["e2","e13"],  ["e2","e13"]],
    server_17:    [["e13","e7"], ["e3","e8"],  ["e3","e8"],  ["e3","e8"],  ["e10","e8"],  ["e10","e8"],  ["e1","e8"]],
    bartender_17: [["e4"],       ["e4"],       ["e4"],       [null],       ["e3"],        ["e3"],        ["e3"]],
    busser_17:    [["e17"],      ["e17"],      ["e17"],      ["e17"],      ["e17"],       ["e17"],       ["e17"]],
    host_17:      [["e9"],       ["e9"],       ["e9"],       ["e9"],       ["e1"],        ["e1"],        ["e9"]],
    dish_16:      [["e15"],      ["e15"],      ["e15"],      ["e15"],      ["e15"],       ["e5"],        ["e5"]],
    door_20:      [[],           [],           [],           [],           ["e16"],       ["e16"],       []],
  };

  let n = 1;
  BLOCKS.forEach((b) => {
    const key = `${b.roleId}_${b.startTime.slice(0, 2)}`;
    DAYS.forEach((date, di) => {
      if (b.days && !b.days.includes(di)) return;
      const duties = b.duties && (!b.dutyDays || b.dutyDays.includes(di)) ? b.duties : [];
      const assigned = (roster[key] && roster[key][di]) || [];
      for (let slot = 0; slot < b.slots; slot++) {
        const who = assigned[slot] ?? null;
        period.addShift(new Shift({
          id: `s${n++}`, periodId: period.id, roleId: b.roleId, date,
          startTime: b.startTime, endTime: b.endTime, employeeId: who, duties,
        }));
      }
    });
  });

  return {
    organization: { id: "org1", name: "Northside Grill" },
    today: TODAY, roles, certTypes, employees, period, timeOff,
    settings: {
      minRestHours: 10,
      overtimeThreshold: 40,
      minorMaxDailyHours: 8,
      minorCurfew: "22:00",
      noticeDays: 14,
      // somebody on site with each of these the whole time
      siteCerts: ["foodManager", "firstAid"],
    },
  };
}
module.exports = seed;
