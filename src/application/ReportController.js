const { addDays } = require("../domain/format");

// someone at 90% of the overtime threshold (36 of 40 hours) shows up as close to it
const NEAR_OVERTIME = 0.9;
// certs that run out or come due within this many days of today
const CERT_WINDOW_DAYS = 30;

// UC-11 View coverage and labor report. read only, it never changes anything.
// its own controller so the reporting doesn't pile onto ScheduleController (High Cohesion)
class ReportController {
  constructor(repo) { this.repo = repo; }

  // viewCoverageReport(periodId) from the SSD
  coverage(periodId) {
    const period = this.repo.periodOrWorking(periodId);
    if (!period) return { error: "No such week." };
    const byId = this.repo.employeesById();
    const rolesById = this.repo.rolesById();
    const { overtimeThreshold } = this.repo.settings();
    const today = this.repo.today();
    const costOf = (shifts) => Math.round(period.laborCost(byId, shifts));

    // open shifts and labor, a day at a time
    const days = Array.from({ length: 7 }, (_, i) => addDays(period.startDate, i)).map((date) => {
      const shifts = period.shiftsOn(date);
      const filled = shifts.filter((s) => s.isAssigned());
      return {
        date, shifts: shifts.length, filled: filled.length,
        open: shifts.filter((s) => !s.isAssigned())
          .map(({ id, roleId, startTime, endTime }) => ({ shiftId: id, roleId, startTime, endTime })),
        hours: filled.reduce((t, s) => t + s.hours, 0),
        cost: costOf(shifts),
      };
    });

    const byRole = [...rolesById.values()].map((r) => {
      const shifts = period.shifts.filter((s) => s.roleId === r.id && s.isAssigned());
      return { roleId: r.id, name: r.name, hours: shifts.reduce((t, s) => t + s.hours, 0),
               cost: costOf(shifts) };
    }).filter((r) => r.hours > 0);
    const cost = costOf(period.shifts);

    // everyone on the week, most hours first
    const totals = new Map();
    period.shifts.filter((s) => s.isAssigned()).forEach((s) => {
      const t = totals.get(s.employeeId) || { hours: 0, shifts: 0 };
      totals.set(s.employeeId, { hours: t.hours + s.hours, shifts: t.shifts + 1 });
    });
    const hours = [...totals].map(([employeeId, t]) => {
      const e = byId.get(employeeId);
      const status = t.hours > overtimeThreshold ? "over"
        : t.hours >= overtimeThreshold * NEAR_OVERTIME ? "near" : "ok";
      return { employeeId, name: e.name, hours: t.hours, shifts: t.shifts, status,
               prefers: e.maxHoursPreference, overPreference: e.maxHoursPreference != null && t.hours > e.maxHoursPreference };
    }).sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));

    return {
      period: { id: period.id, startDate: period.startDate, endDate: period.endDate,
                status: period.status, budget: period.budget },
      today, overtimeThreshold, nearOvertime: overtimeThreshold * NEAR_OVERTIME, certWindowDays: CERT_WINDOW_DAYS,
      days,
      labor: { cost, budget: period.budget, byRole },
      hours,
      certs: this.#certsComingDue(byId, rolesById, today),
      // UC-12 leaves a reason behind, this is where the manager sees them all together
      overrides: period.shifts.filter((s) => s.overrideReason).map((s) => ({
        shiftId: s.id, date: s.date, roleId: s.roleId, startTime: s.startTime, endTime: s.endTime,
        employeeName: byId.get(s.employeeId)?.name, reason: s.overrideReason,
      })),
      activity: this.repo.audit().reverse(),
    };
  }

  // certs a person's roles need that are already a problem, or will be soon
  #certsComingDue(byId, rolesById, today) {
    const until = addDays(today, CERT_WINDOW_DAYS);
    const types = this.repo.certTypesById();
    const out = [];
    for (const e of byId.values()) {
      for (const [certTypeId, onlyIf] of e.requiredCerts(rolesById)) {
        const type = types.get(certTypeId);
        const st = e.certStatus(type, today);
        let kind = null, date = null;
        if (st.expiredOn) [kind, date] = ["expired", st.expiredOn];
        else if (st.missing && !st.ok) [kind, date] = ["missing", st.graceEnds || null];
        else if (st.missing && st.graceEnds <= until) [kind, date] = ["due", st.graceEnds];
        else if (st.ok && st.expiresOn <= until) [kind, date] = ["expiring", st.expiresOn];
        if (kind) out.push({ employeeId: e.id, name: e.name, certTypeId, certName: type.name, onlyIf, kind, date });
      }
    }
    // the ones already stopping someone from working go first
    const urgent = (c) => (c.kind === "expired" || c.kind === "missing" ? 0 : 1);
    return out.sort((a, b) => urgent(a) - urgent(b) || String(a.date).localeCompare(String(b.date))
      || a.name.localeCompare(b.name));
  }
}
module.exports = ReportController;
