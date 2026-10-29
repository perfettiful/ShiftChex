const { Employee, Role, Qualification, CertType, Certificate, Availability,
        TimeOffRequest, Shift, SchedulePeriod, SwapRequest } = require("../domain");
const { addDays } = require("../domain/format");
const { notice, audit, shiftLabel } = require("../domain/messages");

// made up demo data, with fixed dates so the demo runs the same every time. this week is
// published, next week is the draft, and the usual roster fills every week to the end of the year
const TODAY = "2026-10-05";

// thanksgiving, christmas day and new year's day. no shifts at all
const CLOSED = ["2026-11-26", "2026-12-25", "2027-01-01"];

// days/dutyDays are indexes into the week (0 = mon). no days means every day
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
    // alcohol cert runs out thu 10/15 and her renewal course is sat 10/17,
    // so she can't bartend on fri 10/16. the new card counts from the day it's issued
    { id: "e4",  name: "Lena Haas",    dob: "1999-07-08", quals: [["bartender", 22]],
      certs: [...KITCHEN, "allergen", ["alcohol", "2023-10-15"], ["alcohol", "2026-10-17"]] },
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
      certs: [...KITCHEN, "allergen"], maxHours: 20 },
    // food manager cert runs out wed 10/14, renewal exam is that same day so there's no gap
    { id: "e10", name: "Grace Kim",    dob: "1990-06-21", quals: [["lead", 24], ["server", 18]],
      certs: [...FLOOR, ["foodManager", "2021-10-14"], ["foodManager", "2026-10-14"], "firstAid"] },
    { id: "e11", name: "Omar Farah",   dob: "1988-03-09", quals: [["lead", 25]],
      certs: [...FLOOR, "foodManager", "firstAid"] },
    // no first aid
    { id: "e12", name: "Mia Torres",   dob: "1995-10-30", quals: [["lead", 23], ["bartender", 21]],
      certs: [...FLOOR, "foodManager"] },
    // new hire still inside the grace windows. his classes are booked before each one closes
    { id: "e13", name: "Jordan Lee",   dob: "2003-08-17", hired: "2026-09-21", quals: [["server", 16]],
      certs: [["medical", "2026-09-18"], ["hygiene", "2026-09-18"], ["foodHandler", "2026-10-19"],
              ["allergen", "2026-10-19"], ["alcohol", "2026-11-16"]], maxHours: 30 },
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
    const e = new Employee({ id: p.id, name: p.name, dateOfBirth: p.dob, hireDate: p.hired || "2025-06-01",
      maxHoursPreference: p.maxHours ?? null });
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
    // next week
    new TimeOffRequest({ id: "t1", employeeId: "e2", startDate: "2026-10-14",
      endDate: "2026-10-16", reason: "Family", status: "approved" }),
    new TimeOffRequest({ id: "t2", employeeId: "e6", startDate: "2026-10-17",
      endDate: "2026-10-17", reason: "Appointment", status: "pending" }),
    // this week. ben's came through after he'd claimed a shift that same day (see w6)
    new TimeOffRequest({ id: "t3", employeeId: "e7", startDate: "2026-10-07",
      endDate: "2026-10-07", reason: "Doctor's appointment", status: "approved" }),
    // riya is on friday dinner, so approving this one makes R2 block a published shift
    new TimeOffRequest({ id: "t4", employeeId: "e8", startDate: "2026-10-09",
      endDate: "2026-10-09", reason: "Concert", status: "pending" }),
    new TimeOffRequest({ id: "t5", employeeId: "e3", startDate: "2026-10-10",
      endDate: "2026-10-10", reason: "Wedding", status: "denied" }),
    // on the week of 10/19, still a draft
    new TimeOffRequest({ id: "t6", employeeId: "e1", startDate: "2026-10-24",
      endDate: "2026-10-25", reason: "Out of town", status: "pending" }),
    // sam isn't on either day, and the place is shut for thanksgiving anyway
    new TimeOffRequest({ id: "t7", employeeId: "e2", startDate: "2026-11-25",
      endDate: "2026-11-26", reason: "Thanksgiving travel", status: "approved" }),
    new TimeOffRequest({ id: "t8", employeeId: "e12", startDate: "2026-12-24",
      endDate: "2026-12-24", reason: "Christmas Eve", status: "pending" }),
  ];

  // one roster per week, mon to sun. each day lists who's on each slot, null = nobody yet
  //                mon           tue           wed           thu           fri            sat            sun
  const live = {
    lead_08:      [["e10"],      ["e10"],      ["e10"],      ["e11"],      ["e11"],       ["e11"],       ["e10"]],
    lead_16:      [["e11"],      ["e12"],      ["e12"],      ["e12"],      ["e12"],       ["e12"],       ["e11"]],
    cook_08:      [["e7"],       ["e6"],       ["e6"],       ["e6"],       ["e6"],        ["e7"],        ["e7"]],
    server_11:    [["e1","e2"],  ["e1","e2"],  ["e1","e13"], ["e1","e7"],  ["e7","e13"],  ["e2","e13"],  ["e2","e13"]],
    server_17:    [["e3","e8"],  ["e3","e8"],  ["e3","e8"],  ["e10","e8"], ["e2","e8"],   ["e3","e8"],   ["e1","e8"]],
    bartender_17: [["e4"],       ["e4"],       ["e4"],       ["e4"],       ["e3"],        ["e4"],        ["e3"]],
    busser_17:    [["e17"],      ["e17"],      ["e17"],      ["e17"],      ["e17"],       ["e17"],       ["e17"]],
    host_17:      [["e9"],       ["e9"],       ["e9"],       ["e9"],       ["e1"],        ["e1"],        ["e9"]],
    dish_16:      [["e15"],      ["e15"],      ["e15"],      ["e15"],      ["e15"],       ["e5"],        ["e5"]],
    door_20:      [[],           [],           [],           [],           ["e16"],       ["e16"],       []],
  };
  // every week after next. this week without the one offs: ana back on sunday cook,
  // and jordan on monday dinner so riya isn't over 40 hours
  const usual = {
    ...live,
    cook_08:      [["e7"],       ["e6"],       ["e6"],       ["e6"],       ["e6"],        ["e7"],        ["e6"]],
    server_17:    [["e3","e13"], ["e3","e8"],  ["e3","e8"],  ["e10","e8"], ["e2","e8"],   ["e3","e8"],   ["e1","e8"]],
  };
  // left a few slots empty on purpose so coverage shows up
  const draft = {
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
  const buildWeek = ({ id, startDate, status, publishedOn = null, budget, roster }) => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
    const period = new SchedulePeriod({ id, startDate, endDate: days[6], status, budget, publishedOn });
    BLOCKS.forEach((b) => {
      const key = `${b.roleId}_${b.startTime.slice(0, 2)}`;
      days.forEach((date, di) => {
        if (b.days && !b.days.includes(di)) return;
        if (CLOSED.includes(date)) return;
        const duties = b.duties && (!b.dutyDays || b.dutyDays.includes(di)) ? b.duties : [];
        const assigned = (roster[key] && roster[key][di]) || [];
        for (let slot = 0; slot < b.slots; slot++) {
          period.addShift(new Shift({
            id: `s${n++}`, periodId: id, roleId: b.roleId, date, status: status === "published" ? "published" : "draft",
            startTime: b.startTime, endTime: b.endTime, employeeId: assigned[slot] ?? null, duties,
          }));
        }
      });
    });
    return period;
  };
  const periods = [
    // published two weeks ahead, so R9 is happy with it
    buildWeek({ id: "p1", startDate: TODAY, status: "published", publishedOn: "2026-09-21", budget: 9500, roster: live }),
    buildWeek({ id: "p2", startDate: "2026-10-12", status: "draft", budget: 9500, roster: draft }),
  ];
  // then the usual week, every week until the end of the year
  for (let start = "2026-10-19"; start <= "2026-12-28"; start = addDays(start, 7)) {
    periods.push(buildWeek({ id: `p${periods.length + 1}`, startDate: start, status: "draft", budget: 9500, roster: usual }));
  }
  const [thisWeek] = periods;
  const at = (date, roleId, startTime, employeeId) => thisWeek.shifts.find((s) =>
    s.date === date && s.roleId === roleId && s.startTime === startTime && s.employeeId === employeeId);
  const roleName = (id) => roles.find((r) => r.id === id).name;
  const name = (id) => byId.get(id).name;

  // UC-12 on the live week. ben doesn't do sundays but said yes to this one
  const benSunday = at("2026-10-11", "cook", "08:00", "e7");
  benSunday.overrideReason = "Ben offered to cover Sunday this once.";

  // swaps on the live week, a couple in each state
  const swaps = [
    // tom gave up thursday dinner and grace took it, so it's hers on the roster now
    new SwapRequest({ id: "w1", shiftId: at("2026-10-08", "server", "17:00", "e10").id, postedBy: "e3",
      claimedBy: "e10", status: "approved", postedOn: "2026-09-24", decidedOn: "2026-09-28" }),
    // jordan wanted dana's tuesday lunch and the manager said no
    new SwapRequest({ id: "w2", shiftId: at("2026-10-06", "server", "11:00", "e1").id, postedBy: "e1",
      claimedBy: "e13", status: "denied", postedOn: "2026-09-27", decidedOn: "2026-09-30" }),
    // on the board right now
    new SwapRequest({ id: "w3", shiftId: at("2026-10-08", "server", "11:00", "e1").id, postedBy: "e1",
      status: "posted", postedOn: "2026-10-02" }),
    new SwapRequest({ id: "w4", shiftId: at("2026-10-09", "bartender", "17:00", "e3").id, postedBy: "e3",
      status: "posted", postedOn: "2026-10-03" }),
    // claimed and waiting on the manager. marcus's still passes
    new SwapRequest({ id: "w5", shiftId: at("2026-10-07", "dish", "16:00", "e15").id, postedBy: "e15",
      claimedBy: "e5", status: "claimed", postedOn: "2026-09-30" }),
    // ben's passed when he claimed it on 10/2. then his 10/7 day off got approved,
    // so the second check at approval catches it
    new SwapRequest({ id: "w6", shiftId: at("2026-10-07", "server", "11:00", "e13").id, postedBy: "e13",
      claimedBy: "e7", status: "claimed", postedOn: "2026-10-01" }),
  ];
  const STATUS = { posted: "openForSwap", claimed: "claimed" };
  swaps.forEach((sw) => {
    const shift = thisWeek.shifts.find((s) => s.id === sw.shiftId);
    if (STATUS[sw.status]) shift.status = STATUS[sw.status];
  });

  // what the observers would have written while all that happened
  const notices = [], auditLog = [];
  const tell = (employeeId, text, createdOn) => notices.push({ id: `n${notices.length + 1}`, employeeId, text, createdOn });
  const log = (on, what) => auditLog.push({ at: on, what });

  log("2026-09-20", audit.override(name("e7"), benSunday, roleName("cook"), benSunday.overrideReason));
  log("2026-09-21", audit.published(thisWeek));
  [...new Set(thisWeek.shifts.map((s) => s.employeeId).filter(Boolean))].forEach((id) =>
    tell(id, notice.published(thisWeek), "2026-09-21"));
  swaps.filter((sw) => sw.decidedOn).forEach((sw) => {
    const shift = thisWeek.shifts.find((s) => s.id === sw.shiftId);
    const label = shiftLabel(shift, roleName(shift.roleId));
    const approved = sw.status === "approved";
    log(sw.decidedOn, audit.swap(approved, name(sw.claimedBy), name(sw.postedBy), label));
    tell(sw.claimedBy, approved ? notice.swapApprovedClaimer(name(sw.postedBy), label)
                                : notice.swapDeniedClaimer(name(sw.postedBy), label), sw.decidedOn);
    tell(sw.postedBy, approved ? notice.swapApprovedPoster(name(sw.claimedBy), label)
                               : notice.swapDeniedPoster(label), sw.decidedOn);
  });
  timeOff.filter((t) => ["t3", "t5", "t7"].includes(t.id)).forEach((t) => {
    log("2026-10-03", audit.timeOff(t, name(t.employeeId)));
    tell(t.employeeId, notice.timeOff(t), "2026-10-03");
  });

  return {
    organization: { id: "org1", name: "Northside Grill" },
    today: TODAY, roles, certTypes, employees, periods, timeOff, swaps, notices, audit: auditLog,
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

// demo sign in. every account uses the same password and the login screen fills it in.
// the manager isn't on the schedule, so they get an account but no employee row
const DEMO_PASSWORD = "shiftchex";
const MANAGER = { id: "manager", name: "R. Chen" };
// "Dana Park" -> "dana.park"
const username = (name) => name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");

module.exports = Object.assign(seed, { DEMO_PASSWORD, MANAGER, username });
