// domain classes, no imports from other folders

const addDays = (date, n) => {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

class Employee {
  constructor({ id, name, dateOfBirth, hireDate, status = "active", maxHoursPreference = null }) {
    Object.assign(this, { id, name, dateOfBirth, hireDate, status, maxHoursPreference });
    this.qualifications = [];
    this.availability = [];
    this.timeOff = [];
    this.certs = [];
  }
  ageOn(date) {
    const d = new Date(date), b = new Date(this.dateOfBirth);
    let age = d.getFullYear() - b.getFullYear();
    const m = d.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age -= 1;
    return age;
  }
  isMinorOn(date) { return this.ageOn(date) < 18; }

  // Information Expert: employee has the availability data
  isAvailableOn(date, startTime, endTime) {
    const weekday = new Date(date + "T12:00:00").getDay();
    return this.availability.some((a) =>
      a.weekday === weekday && a.effectiveFrom <= date &&
      a.startTime <= startTime && a.endTime >= endTime);
  }
  hasApprovedTimeOffOn(date) {
    return this.timeOff.some((t) => t.status === "approved" && t.startDate <= date && t.endDate >= date);
  }
  qualificationFor(roleId) {
    return this.qualifications.find((q) => q.roleId === roleId) || null;
  }
  // where this person stands on one cert as of a date.
  // new hires get the grace window, renewals don't
  certStatus(type, date) {
    const held = this.certs.filter((c) => c.certTypeId === type.id && c.issuedOn <= date);
    const current = held.find((c) => c.expiresOn >= date);
    if (current) return { ok: true, expiresOn: current.expiresOn };
    if (held.length) {
      const expiredOn = held.map((c) => c.expiresOn).sort().pop();
      return { ok: false, expiredOn };
    }
    if (type.graceDays) {
      const graceEnds = addDays(this.hireDate, type.graceDays);
      return { ok: date <= graceEnds, missing: true, graceEnds };
    }
    return { ok: false, missing: true };
  }
  rateFor(roleId) {
    const q = this.qualificationFor(roleId);
    return q ? q.hourlyRate : 0;
  }
}

class Role {
  constructor({ id, name, certs = [] }) {
    Object.assign(this, { id, name });
    // "alcohol" or { certTypeId: "alcohol", onlyIf: "carriesDrinks" }
    this.certs = certs.map((c) => (typeof c === "string" ? { certTypeId: c, onlyIf: null } : c));
  }
  // some certs only count if the shift has that duty
  certsFor(shift) {
    return this.certs.filter((c) => !c.onlyIf || shift.duties.includes(c.onlyIf));
  }
}

class Qualification {
  constructor({ roleId, hourlyRate }) { Object.assign(this, { roleId, hourlyRate }); }
}

// graceDays = how long a new hire has to get it. 0 means before their first shift
class CertType {
  constructor({ id, name, graceDays = 0, renewYears }) {
    Object.assign(this, { id, name, graceDays, renewYears });
  }
}

class Certificate {
  constructor({ certTypeId, issuedOn, expiresOn }) {
    Object.assign(this, { certTypeId, issuedOn, expiresOn });
  }
}

class Availability {
  constructor({ weekday, startTime, endTime, effectiveFrom }) {
    Object.assign(this, { weekday, startTime, endTime, effectiveFrom });
  }
}

class TimeOffRequest {
  constructor({ id, employeeId, startDate, endDate, reason, status = "pending" }) {
    Object.assign(this, { id, employeeId, startDate, endDate, reason, status });
  }
}

class Shift {
  constructor({ id, periodId, roleId, date, startTime, endTime, required = 1,
                employeeId = null, status = "draft", overrideReason = null, duties = [] }) {
    Object.assign(this, { id, periodId, roleId, date, startTime, endTime, required,
                          employeeId, status, overrideReason, duties });
  }
  get hours() {
    const [sh, sm] = this.startTime.split(":").map(Number);
    const [eh, em] = this.endTime.split(":").map(Number);
    return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
  }
  get startsAt() { return new Date(`${this.date}T${this.startTime}:00`); }
  get endsAt() { return new Date(`${this.date}T${this.endTime}:00`); }
  isAssigned() { return this.employeeId !== null; }
  assign(employeeId) { this.employeeId = employeeId; this.overrideReason = null; }
  unassign() { this.employeeId = null; this.overrideReason = null; }
}

class SchedulePeriod {
  constructor({ id, startDate, endDate, status = "draft", budget = 0, publishedOn = null }) {
    Object.assign(this, { id, startDate, endDate, status, budget, publishedOn });
    this.shifts = [];
  }
  // Creator: period holds its shifts
  addShift(shift) { this.shifts.push(shift); return shift; }
  shiftsOn(date) { return this.shifts.filter((s) => s.date === date); }
  isDraft() { return this.status === "draft"; }
}

class SwapRequest {
  constructor({ id, shiftId, postedBy, claimedBy = null, status = "posted",
                postedOn, decidedOn = null, note = null }) {
    Object.assign(this, { id, shiftId, postedBy, claimedBy, status, postedOn, decidedOn, note });
  }
}

// returned by rules. severity = block or warn
class Violation {
  constructor({ ruleId, severity, message, shiftId = null }) {
    Object.assign(this, { ruleId, severity, message, shiftId });
  }
  static blocking(ruleId, message, shiftId) {
    return new Violation({ ruleId, severity: "blocking", message, shiftId });
  }
  static warning(ruleId, message, shiftId) {
    return new Violation({ ruleId, severity: "warning", message, shiftId });
  }
  get blocks() { return this.severity === "blocking"; }
}

module.exports = { Employee, Role, Qualification, CertType, Certificate, Availability,
                   TimeOffRequest, Shift, SchedulePeriod, SwapRequest, Violation };
