const { Employee, Role, Qualification, CertType, Certificate, Availability,
        TimeOffRequest, Shift, SchedulePeriod, SwapRequest } = require("../domain");
const { open, migrate } = require("./db");
const seed = require("./seed");

// child tables first so foreign keys don't complain
const TABLES = ["notice", "audit_entry", "swap_request", "shift_duty", "shift", "schedule_period",
  "time_off_request", "availability", "certificate", "qualification", "employee", "role_cert",
  "role", "cert_type", "setting", "organization", "id_counter"];

const groupBy = (rows, key) => rows.reduce((m, r) => {
  if (!m.has(r[key])) m.set(r[key], []);
  m.get(r[key]).push(r);
  return m;
}, new Map());

// sqlite won't take undefined
const v = (x) => (x === undefined ? null : x);

// Adapter: turns sqlite rows into domain objects and back. everything is
// loaded once and kept in memory, and every change gets written straight through
class SqliteRepository {
  constructor(file) {
    this.db = open(file);
    migrate(this.db);
    if (this.db.prepare("SELECT COUNT(*) AS n FROM organization").get().n === 0) this.#seed();
    this.#load();
  }

  // wipe the data (not the schema) and put the demo week back
  reset() {
    this.transaction(() => {
      TABLES.forEach((t) => this.db.exec(`DELETE FROM ${t}`));
      this.#seed();
    });
    this.#load();
  }

  today() { return this._today; }
  employees() { return this._employees; }
  roles() { return this._roles; }
  certTypes() { return this._certTypes; }
  currentPeriod() { return this._period; }
  timeOff() { return this._timeOff; }
  swaps() { return this._swaps; }
  notices() { return this._notices; }
  audit() { return this._audit; }

  employeesById() { return new Map(this._employees.map((e) => [e.id, e])); }
  rolesById() { return new Map(this._roles.map((r) => [r.id, r])); }
  certTypesById() { return new Map(this._certTypes.map((c) => [c.id, c])); }

  nextId(kind) {
    const { n } = this.db.prepare(`INSERT INTO id_counter (kind, next) VALUES (?, 2)
      ON CONFLICT (kind) DO UPDATE SET next = next + 1 RETURNING next - 1 AS n`).get(kind);
    return `${kind}-${n}`;
  }

  // writes

  saveShift(s) {
    this.db.prepare("UPDATE shift SET employee_id = ?, status = ?, override_reason = ? WHERE id = ?")
      .run(v(s.employeeId), s.status, v(s.overrideReason), s.id);
  }

  savePeriod(p) {
    this.transaction(() => {
      this.db.prepare("UPDATE schedule_period SET status = ?, published_on = ?, budget = ? WHERE id = ?")
        .run(p.status, v(p.publishedOn), p.budget, p.id);
      p.shifts.forEach((s) => this.saveShift(s));
    });
  }

  saveTimeOff(t) {
    this.db.prepare("UPDATE time_off_request SET status = ? WHERE id = ?").run(t.status, t.id);
  }

  addSwap(sw) {
    this.db.prepare(`INSERT INTO swap_request (id, shift_id, posted_by, claimed_by, status, posted_on, decided_on, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sw.id, sw.shiftId, sw.postedBy, v(sw.claimedBy), sw.status, sw.postedOn, v(sw.decidedOn), v(sw.note));
    this._swaps.push(sw);
  }

  saveSwap(sw) {
    this.db.prepare("UPDATE swap_request SET claimed_by = ?, status = ?, decided_on = ?, note = ? WHERE id = ?")
      .run(v(sw.claimedBy), sw.status, v(sw.decidedOn), v(sw.note), sw.id);
  }

  addNotice(n) {
    this.db.prepare("INSERT INTO notice (id, employee_id, text) VALUES (?, ?, ?)").run(n.id, n.employeeId, n.text);
    this._notices.push(n);
  }

  addAudit(a) {
    this.db.prepare("INSERT INTO audit_entry (at, what) VALUES (?, ?)").run(a.at, a.what);
    this._audit.push(a);
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

  // rows -> domain objects
  #load() {
    const all = (sql) => this.db.prepare(sql).all();
    const settings = Object.fromEntries(all("SELECT key, value FROM setting")
      .map((r) => [r.key, JSON.parse(r.value)]));
    const { today, ...ruleSettings } = settings;
    this._today = today;
    this.settings = ruleSettings;
    this.organization = { ...all("SELECT id, name FROM organization")[0] };

    this._certTypes = all("SELECT * FROM cert_type ORDER BY rowid").map((r) =>
      new CertType({ id: r.id, name: r.name, graceDays: r.grace_days, renewYears: r.renew_years }));

    const roleCerts = groupBy(all("SELECT * FROM role_cert ORDER BY rowid"), "role_id");
    this._roles = all("SELECT * FROM role ORDER BY rowid").map((r) => new Role({
      id: r.id, name: r.name,
      certs: (roleCerts.get(r.id) || []).map((c) => ({ certTypeId: c.cert_type_id, onlyIf: c.only_if })),
    }));

    const quals = groupBy(all("SELECT * FROM qualification ORDER BY rowid"), "employee_id");
    const certs = groupBy(all("SELECT * FROM certificate ORDER BY id"), "employee_id");
    const avail = groupBy(all("SELECT * FROM availability ORDER BY id"), "employee_id");
    this._timeOff = all("SELECT * FROM time_off_request ORDER BY rowid").map((r) => new TimeOffRequest({
      id: r.id, employeeId: r.employee_id, startDate: r.start_date, endDate: r.end_date,
      reason: r.reason, status: r.status,
    }));
    const timeOff = groupBy(this._timeOff, "employeeId");

    this._employees = all("SELECT * FROM employee ORDER BY rowid").map((r) => {
      const e = new Employee({ id: r.id, name: r.name, dateOfBirth: r.date_of_birth,
        hireDate: r.hire_date, status: r.status, maxHoursPreference: r.max_hours_preference });
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

    const p = all("SELECT * FROM schedule_period ORDER BY start_date DESC LIMIT 1")[0];
    this._period = new SchedulePeriod({ id: p.id, startDate: p.start_date, endDate: p.end_date,
      status: p.status, budget: p.budget, publishedOn: p.published_on });
    const duties = groupBy(all("SELECT * FROM shift_duty ORDER BY rowid"), "shift_id");
    this.db.prepare("SELECT * FROM shift WHERE period_id = ? ORDER BY rowid").all(p.id).forEach((r) =>
      this._period.addShift(new Shift({
        id: r.id, periodId: r.period_id, roleId: r.role_id, date: r.date, startTime: r.start_time,
        endTime: r.end_time, required: r.required, employeeId: r.employee_id, status: r.status,
        overrideReason: r.override_reason, duties: (duties.get(r.id) || []).map((d) => d.duty),
      })));

    this._swaps = all("SELECT * FROM swap_request ORDER BY rowid").map((r) => new SwapRequest({
      id: r.id, shiftId: r.shift_id, postedBy: r.posted_by, claimedBy: r.claimed_by, status: r.status,
      postedOn: r.posted_on, decidedOn: r.decided_on, note: r.note,
    }));
    this._notices = all("SELECT * FROM notice ORDER BY rowid").map((r) =>
      ({ id: r.id, employeeId: r.employee_id, text: r.text }));
    this._audit = all("SELECT at, what FROM audit_entry ORDER BY id").map((r) => ({ at: r.at, what: r.what }));
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

      const emp = ins(`INSERT INTO employee (id, name, date_of_birth, hire_date, status, max_hours_preference)
        VALUES (?, ?, ?, ?, ?, ?)`);
      const qual = ins("INSERT INTO qualification (employee_id, role_id, hourly_rate) VALUES (?, ?, ?)");
      const cert = ins("INSERT INTO certificate (employee_id, cert_type_id, issued_on, expires_on) VALUES (?, ?, ?, ?)");
      const avail = ins(`INSERT INTO availability (employee_id, weekday, start_time, end_time, effective_from)
        VALUES (?, ?, ?, ?, ?)`);
      data.employees.forEach((e) => {
        emp.run(e.id, e.name, e.dateOfBirth, e.hireDate, e.status, v(e.maxHoursPreference));
        e.qualifications.forEach((q) => qual.run(e.id, q.roleId, q.hourlyRate));
        e.certs.forEach((c) => cert.run(e.id, c.certTypeId, c.issuedOn, c.expiresOn));
        e.availability.forEach((a) => avail.run(e.id, a.weekday, a.startTime, a.endTime, a.effectiveFrom));
      });

      const off = ins(`INSERT INTO time_off_request (id, employee_id, start_date, end_date, reason, status)
        VALUES (?, ?, ?, ?, ?, ?)`);
      data.timeOff.forEach((t) => off.run(t.id, t.employeeId, t.startDate, t.endDate, v(t.reason), t.status));

      const p = data.period;
      ins(`INSERT INTO schedule_period (id, start_date, end_date, status, budget, published_on)
        VALUES (?, ?, ?, ?, ?, ?)`).run(p.id, p.startDate, p.endDate, p.status, p.budget, v(p.publishedOn));
      const shift = ins(`INSERT INTO shift (id, period_id, role_id, employee_id, date, start_time, end_time,
        required, status, override_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const duty = ins("INSERT INTO shift_duty (shift_id, duty) VALUES (?, ?)");
      p.shifts.forEach((s) => {
        shift.run(s.id, p.id, s.roleId, v(s.employeeId), s.date, s.startTime, s.endTime,
          s.required, s.status, v(s.overrideReason));
        s.duties.forEach((d) => duty.run(s.id, d));
      });
    });
  }
}
module.exports = SqliteRepository;
