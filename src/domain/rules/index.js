const Rule = require("./Rule");
const CompositeRule = require("./CompositeRule");
const { Violation } = require("../index");

const assignedShifts = (ctx) => ctx.shifts.filter((s) => s.isAssigned());
const emp = (ctx, id) => ctx.employeeById.get(id);
const roleName = (ctx, id) => (ctx.roleById.get(id) || { name: id }).name;
const hhmm = (t) => {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, "0")}${ampm}` : `${hr}${ampm}`;
};
const dayName = (d) => new Date(d + "T12:00:00")
  .toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });

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
          `${e.name} is outside declared availability on ${dayName(s.date)}. Overridden: ${s.overrideReason}`, s.id));
      } else {
        out.push(Violation.blocking(this.id,
          `${e.name} has not said they can work ${hhmm(s.startTime)} to ${hhmm(s.endTime)} on ${dayName(s.date)}.`, s.id));
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
          `${e.name} has approved time off on ${dayName(s.date)}. This one cannot be overridden.`, s.id));
      }
    }
    return out;
  }
}

// R3
class RestRule extends Rule {
  constructor() { super("R3", "Minimum rest"); }
  check(ctx) {
    const out = [], byEmployee = new Map();
    for (const s of assignedShifts(ctx)) {
      if (!byEmployee.has(s.employeeId)) byEmployee.set(s.employeeId, []);
      byEmployee.get(s.employeeId).push(s);
    }
    const minRest = ctx.settings.minRestHours;
    for (const [employeeId, list] of byEmployee) {
      list.sort((a, b) => a.startsAt - b.startsAt);
      for (let i = 1; i < list.length; i++) {
        const gap = (list[i].startsAt - list[i - 1].endsAt) / 3600000;
        if (gap >= minRest) continue;
        const e = emp(ctx, employeeId);
        out.push(Violation.blocking(this.id,
          `${e.name} finishes at ${hhmm(list[i - 1].endTime)} on ${dayName(list[i - 1].date)} and starts at ` +
          `${hhmm(list[i].startTime)} on ${dayName(list[i].date)}. That is ${gap.toFixed(1)} hours rest, ` +
          `and this business requires ${minRest}.`, list[i].id));
      }
    }
    return out;
  }
}

// R4
class MinorHoursRule extends Rule {
  constructor() { super("R4", "Under 18 restrictions"); }
  check(ctx) {
    const out = [];
    const { minorMaxDailyHours, minorCurfew } = ctx.settings;
    for (const s of assignedShifts(ctx)) {
      const e = emp(ctx, s.employeeId);
      if (!e || !e.isMinorOn(s.date)) continue;
      if (s.hours > minorMaxDailyHours) {
        out.push(Violation.blocking(this.id,
          `${e.name} is under 18 and this shift is ${s.hours} hours. The daily cap is ${minorMaxDailyHours}.`, s.id));
      }
      if (s.endTime > minorCurfew) {
        out.push(Violation.blocking(this.id,
          `${e.name} is under 18 and cannot work past ${hhmm(minorCurfew)}. This shift ends at ${hhmm(s.endTime)}.`, s.id));
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
      const q = e.qualificationFor(s.roleId);
      if (!q) {
        out.push(Violation.blocking(this.id,
          `${e.name} is not trained for ${roleName(ctx, s.roleId)}.`, s.id));
      } else if (q.certExpiresOn && q.certExpiresOn < s.date) {
        // use the shift date, not today
        out.push(Violation.blocking(this.id,
          `${e.name}'s ${roleName(ctx, s.roleId)} certification expires ${q.certExpiresOn}, ` +
          `which is before this shift on ${dayName(s.date)}.`, s.id));
      }
    }
    return out;
  }
}

// R6
class CoverageRule extends Rule {
  constructor() { super("R6", "Coverage"); }
  appliesTo(scope) { return scope === "period"; }
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
        `${e.name} is scheduled ${total.toFixed(1)} hours this week. The threshold is ${ctx.settings.overtimeThreshold}.`));
    }
    return out;
  }
}

// R8
class BudgetRule extends Rule {
  constructor() { super("R8", "Labour budget"); }
  appliesTo(scope) { return scope === "period"; }
  check(ctx) {
    const cost = assignedShifts(ctx).reduce((sum, s) => {
      const e = emp(ctx, s.employeeId);
      return sum + (e ? e.rateFor(s.roleId) * s.hours : 0);
    }, 0);
    if (cost <= ctx.period.budget) return [];
    return [Violation.warning(this.id,
      `Projected labour is $${cost.toFixed(0)} against a budget of $${ctx.period.budget}.`)];
  }
}

// R9
class NoticeRule extends Rule {
  constructor() { super("R9", "Advance notice"); }
  appliesTo(scope) { return scope === "period"; }
  check(ctx) {
    const days = Math.round((new Date(ctx.period.startDate) - new Date(ctx.today)) / 86400000);
    if (days >= ctx.settings.noticeDays) return [];
    return [Violation.warning(this.id,
      `This period starts in ${days} days. The target is ${ctx.settings.noticeDays} days of notice.`)];
  }
}

module.exports = { Rule, CompositeRule, AvailabilityRule, TimeOffRule, RestRule,
                   MinorHoursRule, QualificationRule, CoverageRule, OvertimeRule,
                   BudgetRule, NoticeRule };
