// Controller: handles the system operations from the SSDs
class ScheduleController {
  constructor(repo, engine, events) {
    this.repo = repo; this.engine = engine; this.events = events;
  }

  currentPeriod() { return this.repo.currentPeriod(); }

  validate() {
    return this.engine.validate(this.repo.currentPeriod(), this.repo);
  }

  assign(shiftId, employeeId, overrideReason = null) {
    const period = this.repo.currentPeriod();
    if (!period.isDraft()) return { error: "This period is published. Unpublish it to make changes." };
    const shift = period.shifts.find((s) => s.id === shiftId);
    if (!shift) return { error: "No such shift." };
    if (employeeId === null) shift.unassign();
    else { shift.assign(employeeId); shift.overrideReason = overrideReason; }
    return { ok: true, result: this.validate() };
  }

  projectedCost() {
    const period = this.repo.currentPeriod();
    const byId = this.repo.employeesById();
    return period.shifts.reduce((sum, s) => {
      const e = s.isAssigned() ? byId.get(s.employeeId) : null;
      return sum + (e ? e.rateFor(s.roleId) * s.hours : 0);
    }, 0);
  }

  publish() {
    const period = this.repo.currentPeriod();
    if (!period.isDraft()) return { error: "Already published." };
    const result = this.validate();
    if (result.blocking.length) {
      return { error: "Cannot publish while blocking violations are open.", result };
    }
    period.status = "published";
    period.publishedOn = this.repo.today();
    period.shifts.forEach((s) => { if (s.status === "draft") s.status = "published"; });
    // Observer: fire event, subscribers handle the rest
    this.events.emit("schedule.published", { period });
    return { ok: true, result };
  }

  unpublish() {
    const period = this.repo.currentPeriod();
    period.status = "draft";
    period.publishedOn = null;
    period.shifts.forEach((s) => { if (s.status === "published") s.status = "draft"; });
    return { ok: true };
  }

  decideTimeOff(requestId, decision) {
    const r = this.repo.timeOff().find((t) => t.id === requestId);
    if (!r) return { error: "No such request." };
    r.status = decision === "approve" ? "approved" : "denied";
    return { ok: true, result: this.validate() };
  }
}
module.exports = ScheduleController;
