const { Employee, Role, Qualification, CertType, Certificate, Availability,
        TimeOffRequest, Shift, SchedulePeriod, SwapRequest } = require("../domain");
const { open, migrate, DEFAULT_FILE } = require("./db");
const seed = require("./seed");
const { hashPassword } = require("../domain/password");

// child tables first so foreign keys don't complain
const TABLES = ["notice", "audit_entry", "swap_request", "shift_duty", "shift", "schedule_period",
  "time_off_request", "availability", "certificate", "qualification", "user_account", "employee", "role_cert",
  "role", "cert_type", "setting", "organization", "id_counter"];

const groupBy = (rows, key) => rows.reduce((m, r) => {
  if (!m.has(r[key])) m.set(r[key], []);
  m.get(r[key]).push(r);
  return m;
}, new Map());

// sqlite won't take undefined
const v = (x) => (x === undefined ? null : x);
const toPeriod = (p) => new SchedulePeriod({ id: p.id, startDate: p.start_date, endDate: p.end_date,
  status: p.status, budget: p.budget, publishedOn: p.published_on });
const account = (r) => ({ id: r.id, username: r.username, name: r.name, role: r.role, employeeId: r.employee_id });

// Adapter: turns sqlite rows into domain objects and back.
// nothing is cached, every read is a new query
class SqliteRepository {
  constructor(file = DEFAULT_FILE) {
    this.file = file;
    this.db = open(file);
    this.statements = new Map();
    migrate(this.db);
    if (this.#get("SELECT COUNT(*) AS n FROM organization").n === 0) this.#seed();
    // a database from before 003 has people but no accounts yet
    else if (this.#get("SELECT COUNT(*) AS n FROM user_account").n === 0) this.#seedAccounts();
  }

  // wipe the data (not the schema) and put the demo weeks back
  reset() {
    this.transaction(() => {
      TABLES.forEach((t) => this.db.exec(`DELETE FROM ${t}`));
      this.#seed();
    });
  }

  // reads

  organization() { return { ...this.#get("SELECT id, name FROM organization") }; }

  // rule thresholds. today is in the same table but has its own method
  settings() {
    const { today: _today, ...rules } = this.#settings();
    return rules;
  }
  today() { return this.#settings().today; }

  certTypes() {
    return this.#all("SELECT * FROM cert_type ORDER BY rowid").map((r) =>
      new CertType({ id: r.id, name: r.name, graceDays: r.grace_days, renewYears: r.renew_years }));
  }

  roles() {
    const roleCerts = groupBy(this.#all("SELECT * FROM role_cert ORDER BY rowid"), "role_id");
    return this.#all("SELECT * FROM role ORDER BY rowid").map((r) => new Role({
      id: r.id, name: r.name,
      certs: (roleCerts.get(r.id) || []).map((c) => ({ certTypeId: c.cert_type_id, onlyIf: c.only_if })),
    }));
  }

  employees() {
    const quals = groupBy(this.#all("SELECT * FROM qualification ORDER BY rowid"), "employee_id");
    const certs = groupBy(this.#all("SELECT * FROM certificate ORDER BY id"), "employee_id");
    const avail = groupBy(this.#all("SELECT * FROM availability ORDER BY id"), "employee_id");
    const timeOff = groupBy(this.timeOff(), "employeeId");
    return this.#all("SELECT * FROM employee ORDER BY rowid").map((r) => {
      const e = new Employee({ id: r.id, name: r.name, dateOfBirth: r.date_of_birth,
        hireDate: r.hire_date, maxHoursPreference: r.max_hours_preference });
      e.qualifications = (quals.get(r.id) || []).map((q) =>
        new Qualification({ roleId: q.role_id, hourlyRate: q.hourly_rate }));
      e.certs = (certs.get(r.id) || []).map((c) =>
        new Certificate({ certTypeId: c.cert_type_id, issuedOn: c.issued_on, expiresOn: c.expires_on }));
      e.availability = (avail.get(r.id) || []).map((a) => new Availability({
        weekday: a.weekday, startTime: a.start_time, endTime: a.end_time, effectiveFrom: a.effective_from }));
      // all of them, R2 only looks at approved ones
      e.timeOff = timeOff.get(r.id) || [];
      return e;
    });
  }

  timeOff() {
    return this.#all("SELECT * FROM time_off_request ORDER BY rowid").map((r) => new TimeOffRequest({
      id: r.id, employeeId: r.employee_id, startDate: r.start_date, endDate: r.end_date,
      reason: r.reason, status: r.status,
    }));
  }

  // every week, oldest first, each with its shifts
  periods() {
    const shifts = groupBy(this.#shiftsWhere("1 = 1"), "periodId");
    return this.#all("SELECT * FROM schedule_period ORDER BY start_date").map((p) => {
      const period = toPeriod(p);
      (shifts.get(p.id) || []).forEach((s) => period.addShift(s));
      return period;
    });
  }

  // one week with its shifts, or null
  period(id) {
    if (typeof id !== "string") return null;
    const p = this.#get("SELECT * FROM schedule_period WHERE id = ?", id);
    if (!p) return null;
    const period = toPeriod(p);
    this.#shiftsWhere("period_id = ?", p.id).forEach((s) => period.addShift(s));
    return period;
  }

  // a week by id, or with no id, the week the manager is working on
  periodOrWorking(id) {
    return id ? this.period(id) : this.workingPeriod();
  }

  // the first week still in draft, or the newest week if every one is published
  workingPeriod() {
    const p = this.#get("SELECT id FROM schedule_period WHERE status = 'draft' ORDER BY start_date LIMIT 1")
      || this.#get("SELECT id FROM schedule_period ORDER BY start_date DESC LIMIT 1");
    return p ? this.period(p.id) : null;
  }

  periodOfShift(shiftId) {
    if (typeof shiftId !== "string") return null;
    const r = this.#get("SELECT period_id FROM shift WHERE id = ?", shiftId);
    return r ? this.period(r.period_id) : null;
  }

  // shifts in any week between two dates (both included). publishedOnly leaves
  // out draft weeks, which is what R3 wants for the days either side of a week
  shiftsBetween(from, to, { publishedOnly = false } = {}) {
    return publishedOnly
      ? this.#shiftsWhere(`date BETWEEN ? AND ?
          AND period_id IN (SELECT id FROM schedule_period WHERE status = 'published')`, from, to)
      : this.#shiftsWhere("date BETWEEN ? AND ?", from, to);
  }

  swaps() {
    return this.#all("SELECT * FROM swap_request ORDER BY rowid").map((r) => new SwapRequest({
      id: r.id, shiftId: r.shift_id, postedBy: r.posted_by, claimedBy: r.claimed_by, status: r.status,
      postedOn: r.posted_on, decidedOn: r.decided_on,
    }));
  }

  notices() {
    return this.#all("SELECT * FROM notice ORDER BY rowid").map((r) =>
      ({ id: r.id, employeeId: r.employee_id, text: r.text, createdOn: r.created_on }));
  }

  audit() {
    return this.#all("SELECT at, what FROM audit_entry ORDER BY id").map((r) => ({ at: r.at, what: r.what }));
  }

  employeesById() { return new Map(this.employees().map((e) => [e.id, e])); }
  // just the name, for notices and the audit log
  employeeName(id) { return this.#get("SELECT name FROM employee WHERE id = ?", id)?.name ?? null; }
  roleName(id) { return this.#get("SELECT name FROM role WHERE id = ?", id)?.name ?? null; }
  rolesById() { return new Map(this.roles().map((r) => [r.id, r])); }
  certTypesById() { return new Map(this.certTypes().map((c) => [c.id, c])); }

  // sign in. accounts come back without the password hash unless asked for by username
  accounts() {
    return this.#all("SELECT id, username, name, role, employee_id FROM user_account ORDER BY rowid").map(account);
  }
  account(id) {
    const r = this.#get("SELECT id, username, name, role, employee_id FROM user_account WHERE id = ?", id);
    return r ? account(r) : null;
  }
  accountByUsername(username) {
    const r = this.#get("SELECT * FROM user_account WHERE username = ?", username);
    return r ? { ...account(r), passwordHash: r.password_hash } : null;
  }
  // what the login screen's dropdown fills in
  demoAccounts() {
    return this.accounts().map((a) => ({ ...a, password: seed.DEMO_PASSWORD }));
  }
  // only sessions started on or after `since` count
  sessionUserId(token, since) {
    return this.#get("SELECT user_id FROM login_session WHERE token = ? AND created_at >= ?", token, since)?.user_id ?? null;
  }

  nextId(kind) {
    const { n } = this.#get(`INSERT INTO id_counter (kind, next) VALUES (?, 2)
      ON CONFLICT (kind) DO UPDATE SET next = next + 1 RETURNING next - 1 AS n`, kind);
    return `${kind}-${n}`;
  }

  // writes

  saveShift(s) {
    this.#run("UPDATE shift SET employee_id = ?, status = ?, override_reason = ? WHERE id = ?",
      v(s.employeeId), s.status, v(s.overrideReason), s.id);
  }

  savePeriod(p) {
    this.transaction(() => {
      this.#run("UPDATE schedule_period SET status = ?, published_on = ?, budget = ? WHERE id = ?",
        p.status, v(p.publishedOn), p.budget, p.id);
      p.shifts.forEach((s) => this.saveShift(s));
    });
  }

  // UC-01. replaces anything starting on or after this date. older rows stay
  // so earlier dates still get checked against what was true back then
  saveAvailability(employeeId, effectiveFrom, slots) {
    this.transaction(() => {
      this.#run("DELETE FROM availability WHERE employee_id = ? AND effective_from >= ?", employeeId, effectiveFrom);
      slots.forEach((a) => this.#run(`INSERT INTO availability (employee_id, weekday, start_time, end_time,
        effective_from) VALUES (?, ?, ?, ?, ?)`, employeeId, a.weekday, a.startTime, a.endTime, effectiveFrom));
    });
  }

  addTimeOff(t) {
    this.#run(`INSERT INTO time_off_request (id, employee_id, start_date, end_date, reason, status)
      VALUES (?, ?, ?, ?, ?, ?)`, t.id, t.employeeId, t.startDate, t.endDate, v(t.reason), t.status);
  }

  saveTimeOff(t) {
    this.#run("UPDATE time_off_request SET status = ? WHERE id = ?", t.status, t.id);
  }

  // only for pending requests the employee takes back
  deleteTimeOff(id) {
    this.#run("DELETE FROM time_off_request WHERE id = ?", id);
  }

  addSwap(sw) {
    this.#run(`INSERT INTO swap_request (id, shift_id, posted_by, claimed_by, status, posted_on, decided_on)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      sw.id, sw.shiftId, sw.postedBy, v(sw.claimedBy), sw.status, sw.postedOn, v(sw.decidedOn));
  }

  saveSwap(sw) {
    this.#run("UPDATE swap_request SET claimed_by = ?, status = ?, decided_on = ? WHERE id = ?",
      v(sw.claimedBy), sw.status, v(sw.decidedOn), sw.id);
  }

  addNotice(n) {
    this.#run("INSERT INTO notice (id, employee_id, text, created_on) VALUES (?, ?, ?, ?)",
      n.id, n.employeeId, n.text, v(n.createdOn));
  }

  deleteNotice(id) {
    this.#run("DELETE FROM notice WHERE id = ?", id);
  }

  addAudit(a) {
    this.#run("INSERT INTO audit_entry (at, what) VALUES (?, ?)", a.at, a.what);
  }

  addSession(token, userId, at) {
    this.#run("INSERT INTO login_session (token, user_id, created_at) VALUES (?, ?, ?)", token, userId, at);
  }

  deleteSession(token) {
    this.#run("DELETE FROM login_session WHERE token = ?", token);
  }

  deleteSessionsBefore(at) {
    this.#run("DELETE FROM login_session WHERE created_at < ?", at);
  }

  // savepoints instead of BEGIN so these can nest
  transaction(fn) {
    const name = `sp${(this._depth = (this._depth || 0) + 1)}`;
    this.db.exec(`SAVEPOINT ${name}`);
    try {
      const out = fn();
      this.db.exec(`RELEASE ${name}`);
      return out;
    } catch (err) {
      this.db.exec(`ROLLBACK TO ${name}`);
      this.db.exec(`RELEASE ${name}`);
      throw err;
    } finally {
      this._depth -= 1;
    }
  }

  close() { this.db.close(); }

  // reuse prepared statements since these queries run on every request
  #stmt(sql) {
    if (!this.statements.has(sql)) this.statements.set(sql, this.db.prepare(sql));
    return this.statements.get(sql);
  }
  #all(sql, ...params) { return this.#stmt(sql).all(...params); }
  #get(sql, ...params) { return this.#stmt(sql).get(...params); }
  #run(sql, ...params) { return this.#stmt(sql).run(...params); }

  // shift rows -> Shift objects, with their duties
  #shiftsWhere(where, ...params) {
    const rows = this.#all(`SELECT * FROM shift WHERE ${where} ORDER BY rowid`, ...params);
    // only the duties for these shifts, not the whole table
    const duties = groupBy(this.#all(`SELECT * FROM shift_duty
      WHERE shift_id IN (SELECT id FROM shift WHERE ${where}) ORDER BY rowid`, ...params), "shift_id");
    return rows.map((r) => new Shift({
      id: r.id, periodId: r.period_id, roleId: r.role_id, date: r.date, startTime: r.start_time,
      endTime: r.end_time, employeeId: r.employee_id, status: r.status,
      overrideReason: r.override_reason, duties: (duties.get(r.id) || []).map((d) => d.duty),
    }));
  }

  #settings() {
    return Object.fromEntries(this.#all("SELECT key, value FROM setting").map((r) => [r.key, JSON.parse(r.value)]));
  }

  // demo data from seed.js -> rows
  #seed() {
    const data = seed();
    const ins = (sql) => this.db.prepare(sql);
    this.transaction(() => {
      ins("INSERT INTO organization (id, name) VALUES (?, ?)").run(data.organization.id, data.organization.name);
      const setting = ins("INSERT INTO setting (key, value) VALUES (?, ?)");
      Object.entries({ ...data.settings, today: data.today })
        .forEach(([k, val]) => setting.run(k, JSON.stringify(val)));

      const certType = ins("INSERT INTO cert_type (id, name, grace_days, renew_years) VALUES (?, ?, ?, ?)");
      data.certTypes.forEach((c) => certType.run(c.id, c.name, c.graceDays, c.renewYears));

      const role = ins("INSERT INTO role (id, name) VALUES (?, ?)");
      const roleCert = ins("INSERT INTO role_cert (role_id, cert_type_id, only_if) VALUES (?, ?, ?)");
      data.roles.forEach((r) => {
        role.run(r.id, r.name);
        r.certs.forEach((c) => roleCert.run(r.id, c.certTypeId, v(c.onlyIf)));
      });

      const emp = ins(`INSERT INTO employee (id, name, date_of_birth, hire_date, max_hours_preference)
        VALUES (?, ?, ?, ?, ?)`);
      const qual = ins("INSERT INTO qualification (employee_id, role_id, hourly_rate) VALUES (?, ?, ?)");
      const cert = ins("INSERT INTO certificate (employee_id, cert_type_id, issued_on, expires_on) VALUES (?, ?, ?, ?)");
      const avail = ins(`INSERT INTO availability (employee_id, weekday, start_time, end_time, effective_from)
        VALUES (?, ?, ?, ?, ?)`);
      data.employees.forEach((e) => {
        emp.run(e.id, e.name, e.dateOfBirth, e.hireDate, v(e.maxHoursPreference));
        e.qualifications.forEach((q) => qual.run(e.id, q.roleId, q.hourlyRate));
        e.certs.forEach((c) => cert.run(e.id, c.certTypeId, c.issuedOn, c.expiresOn));
        e.availability.forEach((a) => avail.run(e.id, a.weekday, a.startTime, a.endTime, a.effectiveFrom));
      });

      const off = ins(`INSERT INTO time_off_request (id, employee_id, start_date, end_date, reason, status)
        VALUES (?, ?, ?, ?, ?, ?)`);
      data.timeOff.forEach((t) => off.run(t.id, t.employeeId, t.startDate, t.endDate, v(t.reason), t.status));

      const period = ins(`INSERT INTO schedule_period (id, start_date, end_date, status, budget, published_on)
        VALUES (?, ?, ?, ?, ?, ?)`);
      const shift = ins(`INSERT INTO shift (id, period_id, role_id, employee_id, date, start_time, end_time,
        status, override_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const duty = ins("INSERT INTO shift_duty (shift_id, duty) VALUES (?, ?)");
      data.periods.forEach((p) => {
        period.run(p.id, p.startDate, p.endDate, p.status, p.budget, v(p.publishedOn));
        p.shifts.forEach((s) => {
          shift.run(s.id, p.id, s.roleId, v(s.employeeId), s.date, s.startTime, s.endTime,
            s.status, v(s.overrideReason));
          s.duties.forEach((d) => duty.run(s.id, d));
        });
      });
      data.swaps.forEach((sw) => this.addSwap(sw));
      data.notices.forEach((n) => this.addNotice(n));
      data.audit.forEach((a) => this.addAudit(a));
      this.#seedAccounts();
    });
  }

  // the manager, then one account per employee, all with the demo password
  #seedAccounts() {
    const add = this.db.prepare(`INSERT INTO user_account (id, username, password_hash, name, role, employee_id)
      VALUES (?, ?, ?, ?, ?, ?)`);
    const { MANAGER, DEMO_PASSWORD, username } = seed;
    this.transaction(() => {
      add.run(MANAGER.id, username(MANAGER.name), hashPassword(DEMO_PASSWORD), MANAGER.name, "manager", null);
      this.#all("SELECT id, name FROM employee ORDER BY rowid").forEach((e) =>
        add.run(e.id, username(e.name), hashPassword(DEMO_PASSWORD), e.name, "employee", e.id));
    });
  }
}
module.exports = SqliteRepository;
