const { Shift } = require("../domain");

// Controller for the manager's operations (UC-06, 07, 08, 10, 12). no periodId means the first
// draft week. events fire inside the save, so their notices and audit entries go with it
class ScheduleController {
  constructor(repo, engine, events) {
    this.repo = repo; this.engine = engine; this.events = events;
  }

  period(periodId) { return this.repo.periodOrWorking(periodId); }

  // UC-07
  validate(periodId) {
    const period = this.period(periodId);
    return period ? this.engine.validate(period, this.repo) : null;
  }

  // UC-06, and UC-12 when there's an override reason.
  // employeeId null takes whoever is on the shift off it
  assign(shiftId, employeeId, overrideReason = null) {
    const period = this.repo.periodOfShift(shiftId);
    if (!period) return { error: "No such shift." };
    if (!period.isDraft()) return { error: "That week is published. Unpublish it to make changes." };
    const shift = period.shifts.find((s) => s.id === shiftId);

    if (employeeId === null) {
      shift.unassign();
      this.repo.saveShift(shift);
      return { ok: true, result: this.validate(period.id) };
    }
    const employee = this.repo.employeesById().get(employeeId);
    if (!employee) return { error: "No such employee." };

    let reason = null;
    if (overrideReason !== null && overrideReason !== undefined) {
      reason = String(overrideReason).trim();
      // UC-12 extension 3a
      if (!reason) return { error: "Give a reason for the override." };
      // only R1 can be overridden, and only when it's actually blocking this person here
      const check = this.engine.validateAssignment(shift, employeeId, period, this.repo);
      if (!check.blocking.some((v) => v.ruleId === "R1" && v.shiftId === shift.id)) {
        return { error: `${employee.name} is available for that shift, so there's nothing to override.` };
      }
    }
    shift.assign(employeeId);
    shift.overrideReason = reason;
    this.repo.transaction(() => {
      this.repo.saveShift(shift);
      if (reason) this.events.emit("shift.overridden", { shift, employee, reason });
    });
    return { ok: true, result: this.validate(period.id) };
  }

  projectedCost(periodId) {
    const period = this.period(periodId);
    return period ? period.laborCost(this.repo.employeesById()) : 0;
  }

  // UC-08
  publish(periodId) {
    const period = this.period(periodId);
    if (!period) return { error: "No such week." };
    if (!period.isDraft()) return { error: "Already published." };
    const result = this.engine.validate(period, this.repo);
    if (result.blocking.length) {
      return { error: "Cannot publish while blocking violations are open.", result };
    }
    period.status = "published";
    period.publishedOn = this.repo.today();
    period.shifts.forEach((s) => { if (s.status === "draft") s.status = "published"; });
    this.repo.transaction(() => {
      this.repo.savePeriod(period);
      // Observer: fire event, subscribers handle the rest
      this.events.emit("schedule.published", { period });
    });
    return { ok: true, result };
  }

  // back to draft so it can be changed. any swap still open on that week gets
  // cancelled, since the shift it was for might change
  unpublish(periodId) {
    const period = this.period(periodId);
    if (!period) return { error: "No such week." };
    if (period.isDraft()) return { error: "That week is already a draft." };
    const shiftIds = new Set(period.shifts.map((s) => s.id));
    const cancelled = this.repo.swaps().filter((sw) => shiftIds.has(sw.shiftId) && sw.isOpen());
    period.status = "draft";
    period.publishedOn = null;
    period.shifts.forEach((s) => { s.status = "draft"; });
    cancelled.forEach((sw) => { sw.status = "cancelled"; sw.decidedOn = this.repo.today(); });
    this.repo.transaction(() => {
      cancelled.forEach((sw) => this.repo.saveSwap(sw));
      this.repo.savePeriod(period);
      this.events.emit("schedule.unpublished", { period, cancelled });
    });
    return { ok: true, cancelled: cancelled.length };
  }

  // UC-10
  decideTimeOff(requestId, decision) {
    if (decision !== "approve" && decision !== "deny") return { error: "Approve or deny?" };
    const request = this.repo.timeOff().find((t) => t.id === requestId);
    if (!request) return { error: "No such request." };
    if (request.status !== "pending") return { error: "That request was already decided." };
    request.status = decision === "approve" ? "approved" : "denied";
    this.repo.transaction(() => {
      this.repo.saveTimeOff(request);
      this.events.emit("timeoff.decided", { request });
    });
    return { ok: true };
  }

  // shifts a time off request would land on, so the manager sees it before approving
  timeOffConflicts(request) {
    return this.repo.shiftsBetween(request.startDate, request.endDate)
      .filter((s) => s.employeeId === request.employeeId)
      .sort(Shift.byStart);
  }
}
module.exports = ScheduleController;
