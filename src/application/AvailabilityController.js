const { TimeOffRequest } = require("../domain");

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// the body is JSON from the browser, so check the type before the format.
// a date also has to exist, so 2026-02-30 is out
const isDate = (x) => {
  if (typeof x !== "string" || !DATE.test(x)) return false;
  const d = new Date(`${x}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(x);
};
const isTime = (x) => typeof x === "string" && TIME.test(x);

// UC-01 and UC-02, the employee side. R1 checks availability, R2 checks approved time off
class AvailabilityController {
  constructor(repo) { this.repo = repo; }

  // UC-01. one time window per day, a day that's left out means they can't work it
  declare(employeeId, { effectiveFrom, slots } = {}) {
    if (!this.repo.employeesById().has(employeeId)) return { error: "No such employee." };
    if (!isDate(effectiveFrom)) return { error: "Pick the date this starts from." };
    if (effectiveFrom < this.repo.today()) return { error: "Availability can't start in the past." };
    if (!Array.isArray(slots)) return { error: "No availability sent." };
    // an empty list would save nothing and leave the old availability in place
    if (!slots.length) return { error: "Tick at least one day. If you can't work at all, ask for time off instead." };
    const days = new Set();
    for (const a of slots) {
      if (!a || typeof a !== "object") return { error: "Bad availability." };
      if (!Number.isInteger(a.weekday) || a.weekday < 0 || a.weekday > 6) return { error: "Bad weekday." };
      if (days.has(a.weekday)) return { error: "One window per day." };
      days.add(a.weekday);
      if (!isTime(a.startTime) || !isTime(a.endTime)) return { error: "Times need to be HH:MM." };
      if (a.startTime >= a.endTime) return { error: "Each day's end time has to be after its start time." };
    }
    this.repo.saveAvailability(employeeId, effectiveFrom,
      slots.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })));
    return { ok: true };
  }

  // UC-02. goes in as pending, the manager decides it in UC-10
  requestTimeOff(employeeId, { startDate, endDate, reason } = {}) {
    const employee = this.repo.employeesById().get(employeeId);
    if (!employee) return { error: "No such employee." };
    if (!isDate(startDate) || !isDate(endDate)) return { error: "Pick a start and end date." };
    if (startDate < this.repo.today()) return { error: "Time off can't start in the past." };
    if (endDate < startDate) return { error: "The end date is before the start date." };
    if (employee.timeOff.some((t) => t.status !== "denied" && t.overlaps(startDate, endDate))) {
      return { error: "You already asked for some of those days off." };
    }
    const request = new TimeOffRequest({
      id: this.repo.nextId("timeoff"), employeeId, startDate, endDate,
      reason: (typeof reason === "string" && reason.trim()) || null, status: "pending",
    });
    this.repo.addTimeOff(request);
    return { ok: true, request };
  }

  // take back a request the manager hasn't decided yet
  cancelTimeOff(employeeId, requestId) {
    const request = this.repo.timeOff().find((t) => t.id === requestId);
    if (!request || request.employeeId !== employeeId) return { error: "No such request." };
    if (request.status !== "pending") return { error: "The manager already decided that one." };
    this.repo.deleteTimeOff(request.id);
    return { ok: true };
  }
}
module.exports = AvailabilityController;
