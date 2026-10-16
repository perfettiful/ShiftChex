const { DUTIES } = require("../domain");

// the manager signs in but isn't on the schedule, so there's no employee row for them.
// handled here instead of in the database (no logins in the prototype, see README)
const MANAGER = { id: "manager", name: "R. Chen", role: "manager", employeeId: null };

// who can sign in, what they're allowed to do, and what each of them sees.
// the UI only ever talks to controllers, so building the screen data lives here too
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

  resetDemo() {
    this.repo.reset();
    return { ok: true };
  }

  about() {
    return { organization: this.repo.organization().name, weekOf: this.repo.currentPeriod().startDate };
  }

  // everything one screen needs, read fresh from the database
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
      // the newest declaration, even if it hasn't started yet, so the form shows what they last sent
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

// the availability in force on a date, and when it started
function declaration(e, date) {
  const slots = e.availabilityOn(date);
  return {
    effectiveFrom: slots[0]?.effectiveFrom || null,
    slots: slots.map((a) => ({ weekday: a.weekday, startTime: a.startTime, endTime: a.endTime })),
  };
}

module.exports = SessionController;
