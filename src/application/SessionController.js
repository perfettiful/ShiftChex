const crypto = require("crypto");
const { DUTIES, Shift } = require("../domain");
const { checkPassword } = require("../domain/password");

// how long a sign in lasts
const SESSION_SECONDS = 7 * 24 * 60 * 60;

// sign in plus the data each screen needs. the ui only talks to
// controllers, so building that data has to happen here
class SessionController {
  constructor(repo, schedule, swaps) {
    this.repo = repo; this.schedule = schedule; this.swaps = swaps;
  }

  // manager first, then the employees. same ids as the employees they belong to
  users() {
    return this.repo.accounts().map(({ id, name, role, employeeId }) => ({ id, name, role, employeeId }));
  }

  user(id) {
    const a = this.repo.account(id);
    return a && { id: a.id, name: a.name, role: a.role, employeeId: a.employeeId };
  }

  // for the login screen's dropdown, demo only
  demoAccounts() {
    return this.repo.demoAccounts()
      .map(({ id, username, password, name, role }) => ({ id, username, password, name, role }));
  }

  // the token goes back to the browser as a cookie and comes in with every request after
  login(username, password) {
    const account = this.repo.accountByUsername(String(username || "").trim().toLowerCase());
    if (!account || !checkPassword(password || "", account.passwordHash)) {
      return { error: "Wrong username or password.", status: 401 };
    }
    const token = crypto.randomBytes(24).toString("hex");
    // a good time to clear out sign ins that have run out
    this.repo.deleteSessionsBefore(sessionCutoff());
    this.repo.addSession(token, account.id, new Date().toISOString());
    return { ok: true, token, maxAge: SESSION_SECONDS, user: this.user(account.id) };
  }

  // token: null tells the server to clear the cookie
  logout(token) {
    if (token) this.repo.deleteSession(token);
    return { ok: true, token: null };
  }

  userForToken(token) {
    const id = token ? this.repo.sessionUserId(token, sessionCutoff()) : null;
    return id ? this.user(id) : null;
  }

  // runs before every signed in API call, with whoever owns the cookie
  authorizeToken(token, need) {
    return this.authorize(this.userForToken(token)?.id, need);
  }

  // need = "manager", "employee" or "any"
  authorize(userId, need) {
    const user = userId ? this.user(userId) : null;
    if (!user) return { error: "Sign in first.", status: 401 };
    if (need !== "any" && user.role !== need) {
      return { error: `Only ${need === "manager" ? "the manager" : "employees"} can do that.`, status: 403 };
    }
    return { user };
  }

  // reset, then read it back from the db to make sure it actually took
  resetDemo() {
    this.repo.reset();
    const working = this.repo.workingPeriod();
    const check = {
      weeks: this.repo.periods().length,
      draftWeek: working.startDate,
      status: working.status,
      shifts: working.shifts.length,
      empty: working.shifts.filter((s) => !s.isAssigned()).length,
    };
    return check.status === "draft" ? { ok: true, check }
      : { error: "The reset didn't take. Try npm run db:reset.", check };
  }

  about() {
    return { organization: this.repo.organization().name, weekOf: this.repo.workingPeriod().startDate };
  }

  // employees can only clear their own
  dismissNotice(employeeId, noticeId) {
    const n = this.repo.notices().find((x) => x.id === noticeId);
    if (!n || n.employeeId !== employeeId) return { error: "No such notice." };
    this.repo.deleteNotice(n.id);
    return { ok: true };
  }

  // everything the screen needs, straight from the db.
  // periodId picks the manager's week. employees always get every published week
  stateFor(user, periodId) {
    const periods = this.repo.periods();
    const employees = this.repo.employees();
    const data = {
      periods, employees,
      byId: new Map(employees.map((e) => [e.id, e])),
      rolesById: this.repo.rolesById(),
      certTypes: this.repo.certTypes(),
      swaps: this.repo.swaps(),
      today: this.repo.today(),
    };
    const state = {
      organization: this.repo.organization(),
      today: data.today,
      user: { id: user.id, name: user.name, role: user.role },
      employeeId: user.employeeId,
      duties: DUTIES,
      roles: [...data.rolesById.values()],
      periods: periods.map(weekSummary),
    };
    return user.role === "manager"
      ? Object.assign(state, this.#forManager(data, periodId))
      : Object.assign(state, this.#forEmployee(data, user.employeeId));
  }

  #forManager({ periods, employees, byId, rolesById, certTypes, swaps }, periodId) {
    // the week they picked, else the first draft, else the newest week
    const period = periods.find((p) => p.id === periodId)
      || periods.find((p) => p.isDraft()) || periods[periods.length - 1];
    const statusOf = new Map(periods.map((p) => [p.id, p.status]));
    const open = new Map(swaps.filter((s) => s.isOpen()).map((s) => [s.shiftId, s]));
    const nameOf = (id) => byId.get(id)?.name || null;
    return {
      period: { ...weekSummary(period), budget: period.budget },
      employees: employees.map((e) => person(e, period.startDate, rolesById, certTypes)),
      shifts: period.shifts.map((s) => {
        const sw = open.get(s.id);
        return { ...shiftFields(s), swap: sw
          ? { status: sw.status, postedByName: nameOf(sw.postedBy), claimedByName: nameOf(sw.claimedBy) } : null };
      }),
      result: this.schedule.validate(period.id),
      projectedCost: Math.round(this.schedule.projectedCost(period.id)),
      timeOff: this.repo.timeOff().map((t) => ({
        ...t, employeeName: nameOf(t.employeeId),
        // what approving it would run into
        conflicts: t.status !== "pending" ? [] : this.schedule.timeOffConflicts(t)
          .map((s) => ({ ...shiftFields(s), published: statusOf.get(s.periodId) === "published" })),
      })),
      pendingSwaps: this.swaps.pending().map((p) => ({
        swapId: p.swap.id, shiftId: p.shift.id, date: p.shift.date, weekOf: p.period.startDate,
        roleId: p.shift.roleId, startTime: p.shift.startTime, endTime: p.shift.endTime,
        postedByName: p.postedByName, claimedByName: p.claimedByName, postedOn: p.swap.postedOn,
        result: p.result,
      })),
    };
  }

  #forEmployee({ periods, employees, byId, rolesById, certTypes, swaps, today }, employeeId) {
    const me = byId.get(employeeId);
    // only weeks that are out. a draft can still change, so nobody sees it yet
    const published = periods.filter((p) => !p.isDraft());
    const shiftById = new Map(periods.flatMap((p) => p.shifts.map((s) => [s.id, s])));
    const open = new Map(swaps.filter((s) => s.isOpen()).map((s) => [s.shiftId, s]));
    return {
      // just names for everyone else, the rest is only for the manager
      employees: employees.map(({ id, name }) => ({ id, name })),
      me: person(me, today, rolesById, certTypes),
      myShifts: published.flatMap((p) => p.shifts)
        .filter((s) => s.employeeId === employeeId && s.date >= today).sort(Shift.byStart)
        .map((s) => ({ ...shiftFields(s), swapStatus: open.get(s.id)?.status || null, swapId: open.get(s.id)?.id || null })),
      // swaps they posted or claimed, newest first
      mySwaps: swaps.filter((s) => s.postedBy === employeeId || s.claimedBy === employeeId).reverse().map((sw) => {
        const shift = shiftById.get(sw.shiftId);
        const postedIt = sw.postedBy === employeeId;
        return {
          id: sw.id, status: sw.status, postedIt, postedOn: sw.postedOn, decidedOn: sw.decidedOn,
          date: shift.date, roleId: shift.roleId, startTime: shift.startTime, endTime: shift.endTime,
          otherName: byId.get(postedIt ? sw.claimedBy : sw.postedBy)?.name || null,
        };
      }),
      timeOff: me.timeOff.map((t) => ({ ...t })),
      // newest one even if it hasn't started yet, so the form shows what they last saved
      myAvailability: declaration(me, "9999-12-31"),
      notices: this.repo.notices().filter((n) => n.employeeId === employeeId).reverse(),
      board: this.swaps.board(employeeId).map((b) => ({
        swapId: b.swap.id, shiftId: b.shift.id, date: b.shift.date, roleId: b.shift.roleId,
        startTime: b.shift.startTime, endTime: b.shift.endTime, hours: b.shift.hours,
        postedByName: byId.get(b.swap.postedBy)?.name, mine: b.mine, result: b.result,
      })),
    };
  }
}

const sessionCutoff = () => new Date(Date.now() - SESSION_SECONDS * 1000).toISOString();

const weekSummary = (p) => ({ id: p.id, startDate: p.startDate, endDate: p.endDate,
                              status: p.status, publishedOn: p.publishedOn });

const shiftFields = (s) => ({ id: s.id, periodId: s.periodId, roleId: s.roleId, date: s.date,
  startTime: s.startTime, endTime: s.endTime, employeeId: s.employeeId, status: s.status,
  hours: s.hours, overrideReason: s.overrideReason, duties: s.duties });

// one person as the screens show them, as of a date
const person = (e, date, rolesById, certTypes) => ({
  id: e.id, name: e.name, isMinor: e.isMinorOn(date), hireDate: e.hireDate,
  qualifications: e.qualifications, maxHoursPreference: e.maxHoursPreference,
  certs: certChecklist(e, date, rolesById, certTypes),
  availability: declaration(e, date),
});

// every cert a person needs for any role they're trained in, plus any extra they hold
function certChecklist(e, date, rolesById, certTypes) {
  const needed = e.requiredCerts(rolesById);
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
