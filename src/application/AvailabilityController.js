const { TimeOffRequest } = require("../domain");

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// UC-01 and UC-02, the employee side. R1 checks availability, R2 checks approved time off
class AvailabilityController {
  constructor(repo) { this.repo = repo; }

  // UC-01. one time window per day, a day that's left out means they can't work it
  declare(employeeId, { effectiveFrom, slots } = {}) {
    if (!this.repo.employeesById().has(employeeId)) return { error: "No such employee." };
    if (!DATE.test(effectiveFrom || "")) return { error: "Pick the date this starts from." };
    if (effectiveFrom < this.repo.today()) return { error: "Availability can't start in the past." };
    if (!Array.isArray(slots)) return { error: "No availability sent." };
    const days = new Set();
    for (const a of slots) {
      if (!Number.isInteger(a.weekday) || a.weekday < 0 || a.weekday > 6) return { error: "Bad weekday." };
      if (days.has(a.weekday)) return { error: "One window per day." };
      days.add(a.weekday);
      if (!TIME.test(a.startTime || "") || !TIME.test(a.endTime || "")) return { error: "Times need to be HH:MM." };
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
    if (!DATE.test(startDate || "") || !DATE.test(endDate || "")) return { error: "Pick a start and end date." };
    if (startDate < this.repo.today()) return { error: "Time off can't start in the past." };
    if (endDate < startDate) return { error: "The end date is before the start date." };
    if (employee.timeOff.some((t) => t.status !== "denied" && t.overlaps(startDate, endDate))) {
      return { error: "You already asked for some of those days off." };
    }
    const request = new TimeOffRequest({
      id: this.repo.nextId("timeoff"), employeeId, startDate, endDate,
      reason: String(reason || "").trim() || null, status: "pending",
    });
    this.repo.addTimeOff(request);
    return { ok: true, request };
  }
}
module.exports = AvailabilityController;
