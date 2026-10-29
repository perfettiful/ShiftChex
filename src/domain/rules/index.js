const Rule = require("./Rule");
const CompositeRule = require("./CompositeRule");
const { Violation, Shift, DUTIES } = require("../index");
const { hhmm, dayName, fullDate } = require("../format");

const assignedShifts = (ctx) => ctx.shifts.filter((s) => s.isAssigned());
const emp = (ctx, id) => ctx.employeeById.get(id);
const roleName = (ctx, id) => (ctx.roleById.get(id) || { name: id }).name;
const certName = (ctx, id) => ctx.certTypeById.get(id).name;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// R1
class AvailabilityRule extends Rule {
  constructor() { super("R1", "Declared availability"); }
  check(ctx) {
    const out = [];
    for (const s of assignedShifts(ctx)) {
      const e = emp(ctx, s.employeeId);
      if (!e || e.isAvailableOn(s.date, s.startTime, s.endTime)) continue;
      if (s.overrideReason) {
        out.push(Violation.warning(this.id,
          `${e.name} is outside declared availability on ${dayName(s.date)}. Overridden: ${s.overrideReason}`, s.id, e.id));
      } else {
        out.push(Violation.blocking(this.id,
          `${e.name} has not said they can work ${hhmm(s.startTime)} to ${hhmm(s.endTime)} on ${dayName(s.date)}.`, s.id, e.id));
      }
    }
    return out;
  }
}

// R2
class TimeOffRule extends Rule {
  constructor() { super("R2", "Approved time off"); }
  check(ctx) {
    const out = [];
    for (const s of assignedShifts(ctx)) {
      const e = emp(ctx, s.employeeId);
      if (e && e.hasApprovedTimeOffOn(s.date)) {
        out.push(Violation.blocking(this.id,
          `${e.name} has approved time off on ${dayName(s.date)}. This one cannot be overridden.`, s.id, e.id));
      }
    }
    return out;
  }
}

// R3. ctx.nearby has the published shifts either side of the week, so sunday night
// into monday still counts
class RestRule extends Rule {
  constructor() { super("R3", "Minimum rest"); }
  check(ctx) {
    const out = [], byEmployee = new Map();
    const inWeek = new Set(ctx.shifts.map((s) => s.id));
    const nearby = (ctx.nearby || []).filter((s) => s.isAssigned() && !inWeek.has(s.id));
    for (const s of [...assignedShifts(ctx), ...nearby]) {
      if (!byEmployee.has(s.employeeId)) byEmployee.set(s.employeeId, []);
      byEmployee.get(s.employeeId).push(s);
    }
    const minRest = ctx.settings.minRestHours;
    for (const [employeeId, list] of byEmployee) {
      list.sort((a, b) => a.startsAt - b.startsAt);
      const e = emp(ctx, employeeId);
      // compare to whatever ends latest, so a shift inside a long one still gets caught
      let prev = list[0];
      for (const s of list.slice(1)) {
        const gap = (s.startsAt - prev.endsAt) / 3600000;
        // only report it on a shift from this week
        const shiftId = inWeek.has(s.id) ? s.id : inWeek.has(prev.id) ? prev.id : null;
        if (shiftId && gap < 0) {
          // overlap means double booked, not short on rest
          out.push(Violation.blocking(this.id,
            `${e.name} is double booked on ${dayName(s.date)}: ${hhmm(prev.startTime)} to ${hhmm(prev.endTime)} ` +
            `and ${hhmm(s.startTime)} to ${hhmm(s.endTime)}.`, shiftId, employeeId));
        } else if (shiftId && gap < minRest) {
          out.push(Violation.blocking(this.id,
            `${e.name} finishes at ${hhmm(prev.endTime)} on ${dayName(prev.date)} and starts at ` +
            `${hhmm(s.startTime)} on ${dayName(s.date)}. That is ${gap.toFixed(1)} hours rest, ` +
            `and this business requires ${minRest}.`, shiftId, employeeId));
        }
        if (s.endsAt > prev.endsAt) prev = s;
      }
    }
    return out;
  }
}

// R4
// the hour cap is for the whole day, so two short shifts can still go over it
class MinorHoursRule extends Rule {
  constructor() { super("R4", "Under 18 restrictions"); }
  check(ctx) {
    const out = [], hoursOn = new Map();
    const { minorMaxDailyHours, minorCurfew } = ctx.settings;
    for (const s of [...assignedShifts(ctx)].sort(Shift.byStart)) {
      const e = emp(ctx, s.employeeId);
      if (!e || !e.isMinorOn(s.date)) continue;
      const key = `${e.id} ${s.date}`;
      const before = hoursOn.get(key) || 0;
      hoursOn.set(key, before + s.hours);
      // only flag the shift that tips the day over
      if (before <= minorMaxDailyHours && before + s.hours > minorMaxDailyHours) {
        out.push(Violation.blocking(this.id, before
          ? `${e.name} is under 18 and would work ${before + s.hours} hours on ${dayName(s.date)}. The daily cap is ${minorMaxDailyHours}.`
          : `${e.name} is under 18 and this shift is ${s.hours} hours. The daily cap is ${minorMaxDailyHours}.`, s.id, e.id));
      }
      if (s.endTime > minorCurfew) {
        out.push(Violation.blocking(this.id,
          `${e.name} is under 18 and cannot work past ${hhmm(minorCurfew)}. This shift ends at ${hhmm(s.endTime)}.`, s.id, e.id));
      }
    }
    return out;
  }
}

// R5
class QualificationRule extends Rule {
  constructor() { super("R5", "Role qualification"); }
  check(ctx) {
    const out = [];
    for (const s of assignedShifts(ctx)) {
      const e = emp(ctx, s.employeeId);
      if (!e) continue;
      if (!e.qualificationFor(s.roleId)) {
        out.push(Violation.blocking(this.id,
          `${e.name} is not trained for ${roleName(ctx, s.roleId)}.`, s.id, e.id));
      }
    }
    return out;
  }
}

// R6
class CoverageRule extends Rule {
  constructor() { super("R6", "Coverage"); }
  check(ctx) {
    return ctx.shifts.filter((s) => !s.isAssigned()).map((s) =>
      Violation.blocking(this.id,
        `${dayName(s.date)} ${roleName(ctx, s.roleId)} ${hhmm(s.startTime)} to ${hhmm(s.endTime)} has nobody on it.`, s.id));
  }
}

// R7
class OvertimeRule extends Rule {
  constructor() { super("R7", "Overtime"); }
  check(ctx) {
    const out = [], hours = new Map();
    for (const s of assignedShifts(ctx)) {
      hours.set(s.employeeId, (hours.get(s.employeeId) || 0) + s.hours);
    }
    for (const [employeeId, total] of hours) {
      if (total <= ctx.settings.overtimeThreshold) continue;
      const e = emp(ctx, employeeId);
      out.push(Violation.warning(this.id,
        `${e.name} is scheduled ${total.toFixed(1)} hours this week. The threshold is ${ctx.settings.overtimeThreshold}.`,
        null, employeeId));
    }
    return out;
  }
}

// R8
class BudgetRule extends Rule {
  constructor() { super("R8", "Labour budget"); }
  check(ctx) {
    const cost = ctx.period.laborCost(ctx.employeeById, ctx.shifts);
    if (cost <= ctx.period.budget) return [];
    return [Violation.warning(this.id,
      `Projected labour is $${cost.toFixed(0)} against a budget of $${ctx.period.budget}.`)];
  }
}

// R9
// a draft is measured from today. once it's out, from the day it was published
class NoticeRule extends Rule {
  constructor() { super("R9", "Advance notice"); }
  check(ctx) {
    const from = ctx.period.publishedOn || ctx.today;
    const days = Math.round((new Date(ctx.period.startDate) - new Date(from)) / 86400000);
    if (days >= ctx.settings.noticeDays) return [];
    return [Violation.warning(this.id, ctx.period.publishedOn
      ? `This week went out ${plural(days, "day")} ahead. The target is ${ctx.settings.noticeDays} days of notice.`
      : `This period starts in ${plural(days, "day")}. The target is ${ctx.settings.noticeDays} days of notice.`)];
  }
}

// R10
// checked against the shift date, not today
class CertificationRule extends Rule {
  constructor() { super("R10", "Required certifications"); }
  check(ctx) {
    const out = [], grace = new Map();
    for (const s of assignedShifts(ctx)) {
      const e = emp(ctx, s.employeeId);
      const role = ctx.roleById.get(s.roleId);
      if (!e || !role) continue;
      const problems = [];
      for (const need of role.certsFor(s)) {
        const type = ctx.certTypeById.get(need.certTypeId);
        const st = e.certStatus(type, s.date);
        const why = need.onlyIf ? ` (this shift ${DUTIES[need.onlyIf]})` : "";
        if (st.ok && st.missing) {
          // new hire still inside the window, just a heads up
          if (!grace.has(e.id)) grace.set(e.id, new Map());
          grace.get(e.id).set(type.id, st.graceEnds);
        } else if (st.expiredOn) {
          problems.push(`${type.name} expired ${fullDate(st.expiredOn)}${why}, renewals don't get a grace period`);
        } else if (st.graceEnds) {
          problems.push(`no ${type.name}${why}, the ${type.graceDays} day new hire window closed ${fullDate(st.graceEnds)}`);
        } else if (!st.ok) {
          problems.push(`no ${type.name}${why}, needed before working`);
        }
      }
      if (problems.length) {
        out.push(Violation.blocking(this.id,
          `${e.name} can't work ${roleName(ctx, s.roleId)} on ${dayName(s.date)}: ${problems.join("; ")}.`, s.id, e.id));
      }
    }
    for (const [employeeId, certs] of grace) {
      const list = [...certs].map(([id, due]) => `${certName(ctx, id)} by ${fullDate(due)}`);
      out.push(Violation.warning(this.id,
        `${emp(ctx, employeeId).name} is a new hire and still needs ${list.join(", ")}.`, null, employeeId));
    }
    return out;
  }
}

// R11
// every minute the place is open needs someone with each site cert on the floor
class OnSiteCertRule extends Rule {
  constructor() { super("R11", "On-site certifications"); }
  check(ctx) {
    const out = [];
    const byDate = new Map();
    for (const s of assignedShifts(ctx)) {
      if (!byDate.has(s.date)) byDate.set(s.date, []);
      byDate.get(s.date).push(s);
    }
    for (const [date, shifts] of [...byDate].sort()) {
      const times = [...new Set(shifts.flatMap((s) => [s.startTime, s.endTime]))].sort();
      for (const certTypeId of ctx.settings.siteCerts) {
        const type = ctx.certTypeById.get(certTypeId);
        let gapStart = null;
        for (let i = 0; i < times.length; i++) {
          const from = times[i], to = times[i + 1];
          const here = to ? shifts.filter((s) => s.startTime <= from && s.endTime >= to) : [];
          // has to actually hold it. a new hire inside their window doesn't count
          const covered = !here.length || here.some((s) => {
            const e = emp(ctx, s.employeeId);
            const st = e && e.certStatus(type, date);
            return st && st.ok && !st.missing;
          });
          if (!covered && gapStart === null) gapStart = from;
          if (covered && gapStart !== null) {
            out.push(Violation.blocking(this.id,
              `${dayName(date)} ${hhmm(gapStart)} to ${hhmm(from)}: nobody on site has a ${type.name}.`));
            gapStart = null;
          }
        }
      }
    }
    return out;
  }
}

module.exports = { Rule, CompositeRule, AvailabilityRule, TimeOffRule, RestRule,
                   MinorHoursRule, QualificationRule, CoverageRule, OvertimeRule,
                   BudgetRule, NoticeRule, CertificationRule, OnSiteCertRule };
