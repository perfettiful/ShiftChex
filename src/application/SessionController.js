const { DUTIES } = require("../domain");

// the manager isn't on the schedule so they don't have an employee row.
// for the demo we just set them up here instead of adding a users table
const MANAGER = { id: "manager", name: "R. Chen", role: "manager", employeeId: null };

// sign in plus the data each screen needs. the ui only talks to
// controllers, so building that data has to happen here
class SessionController {
  constructor(repo, schedule, swaps) {
    this.repo = repo; this.schedule = schedule; this.swaps = swaps;
  }

  users() {
    return [MANAGER, ...this.repo.employees().map((e) =>
      ({ id: e.id, name: e.name, role: "employee", employeeId: e.id }))];
  }

  user(id) { return this.users().find((u) => u.id === id) || null; }

  // runs before every API call. need = "manager", "employee" or "any"
  authorize(userId, need) {
    const user = userId ? this.user(userId) : null;
    if (!user) return { error: "Pick who you are first.", status: 401 };
    if (need !== "any" && user.role !== need) {
      return { error: `Only ${need === "manager" ? "the manager" : "employees"} can do that.`, status: 403 };
    }
    return { user };
  }

  // reset, then read it back from the db to make sure it actually took
  resetDemo() {
    this.repo.reset();
    const period = this.repo.currentPeriod();
    const check = {
      status: period.status,
      shifts: period.shifts.length,
      empty: period.shifts.filter((s) => !s.isAssigned()).length,
      swaps: this.repo.swaps().length,
      notices: this.repo.notices().length,
    };
    const clean = check.status === "draft" && check.swaps === 0 && check.notices === 0;
    return clean ? { ok: true, check } : { error: "The reset didn't take. Try npm run db:reset.", check };
  }

  about() {
    return { organization: this.repo.organization().name, weekOf: this.repo.currentPeriod().startDate };
  }

  // everything the screen needs, straight from the db
  stateFor(user) {
    const period = this.repo.currentPeriod();
    const employees = this.repo.employees();
    const byId = new Map(employees.map((e) => [e.id, e]));
    const rolesById = this.repo.rolesById();
    const certTypes = this.repo.certTypes();

    const state = {
      organization: this.repo.organization(),
      today: this.repo.today(),
      settings: this.repo.settings(),
      user: { id: user.id, name: user.name, role: user.role },
      employeeId: user.employeeId,
      duties: DUTIES,
      roles: [...rolesById.values()],
      employees: employees.map((e) => ({
        id: e.id, name: e.name, isMinor: e.isMinorOn(period.startDate),
        hireDate: e.hireDate, qualifications: e.qualifications,
        certs: certChecklist(e, period.startDate, rolesById, certTypes),
        availability: declaration(e, period.startDate),
      })),
      period: {
        id: period.id, startDate: period.startDate, endDate: period.endDate,
        status: period.status, budget: period.budget,
      },
      shifts: period.shifts.map((s) => ({
        id: s.id, roleId: s.roleId, date: s.date, startTime: s.startTime,
        endTime: s.endTime, employeeId: s.employeeId, status: s.status,
        hours: s.hours, overrideReason: s.overrideReason, duties: s.duties,
      })),
      result: this.schedule.validate(),
      projectedCost: Math.round(this.schedule.projectedCost()),
    };

    if (user.role === "manager") {
      state.timeOff = this.repo.timeOff().map((t) => ({ ...t, employeeName: byId.get(t.employeeId)?.name }));
      state.pendingSwaps = this.swaps.pending().map((p) => ({
        swapId: p.swap.id, shiftId: p.shift.id, date: p.shift.date,
        roleId: p.shift.roleId, startTime: p.shift.startTime, endTime: p.shift.endTime,
        postedByName: p.postedByName, claimedByName: p.claimedByName,
        result: p.result, note: p.swap.note,
      }));
    } else {
      const me = byId.get(user.employeeId);
      state.timeOff = me.timeOff.map((t) => ({ ...t }));
      // newest one even if it hasn't started yet, so the form shows what they last saved
      state.myAvailability = declaration(me, "9999-12-31");
      state.notices = this.repo.notices().filter((n) => n.employeeId === user.employeeId);
      state.board = this.swaps.board(user.employeeId).map((b) => ({
        swapId: b.swap.id, shiftId: b.shift.id, date: b.shift.date, roleId: b.shift.roleId,
        startTime: b.shift.startTime, endTime: b.shift.endTime, hours: b.shift.hours,
        mine: b.mine, result: b.result,
      }));
      state.mySwaps = this.repo.swaps()
        .filter((s) => s.postedBy === user.employeeId || s.claimedBy === user.employeeId)
        .map((s) => ({ ...s }));
    }
    return state;
  }
}

// every cert a person needs for any role they're trained in, plus any extra they hold
function certChecklist(e, date, rolesById, certTypes) {
  const needed = new Map();
  e.qualifications.forEach((q) => (rolesById.get(q.roleId)?.certs || []).forEach((c) => {
    if (!needed.has(c.certTypeId) || !c.onlyIf) needed.set(c.certTypeId, c.onlyIf);
  }));
  return certTypes
    .filter((t) => needed.has(t.id) || e.certs.some((c) => c.certTypeId === t.id))
    .map((t) => ({ certTypeId: t.id, name: t.name, onlyIf: needed.get(t.id) || null,
                   ...e.certStatus(t, date) }));
}

// the availability that applies on a date, and when it started
function declaration(e, date) {
  const slots = e.availabilityOn(date);
  return {
    effectiveFrom: slots[0]?.effectiveFrom || null,
    slots: slots.map((a) => ({ weekday: a.weekday, startTime: a.startTime, endTime: a.endTime })),
  };
}

module.exports = SessionController;
