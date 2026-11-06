// manager: everyone's roles, pay, availability and certs, as of the week being looked at
import { app, roleName } from "../state.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { availabilityText, shortDate, hours } from "../format.js";
import { pageHead } from "../layout.js";
import { weekPicker } from "./weeks.js";

export function peopleView() {
  const { S } = app;
  const scheduled = new Map();
  S.shifts.filter((s) => s.employeeId).forEach((s) => scheduled.set(s.employeeId, (scheduled.get(s.employeeId) || 0) + s.hours));
  return [
    pageHead({ title: "People",
      meta: `${S.employees.length} on staff · certs as of the week of ${shortDate(S.period.startDate)}`,
      toolbar: [weekPicker()] }),
    el("div", { class: "cards-grid" }, S.employees.map((e) =>
      el("div", { class: "card" },
        el("h3", {}, e.name, employmentPill(e), e.isMinor ? el("span", { class: "pill warn" }, "under 18") : null),
        el("div", { class: "facts" },
          el("span", {}, hoursLine(e, scheduled.get(e.id) || 0)),
          el("span", {}, e.qualifications.map((q) => `${roleName(q.roleId)} $${q.hourlyRate}`).join(" · ")),
          el("span", {}, `Hired ${shortDate(e.hireDate)}, ${e.hireDate.slice(0, 4)}` +
            (e.maxHoursPreference ? ` · wants ${e.maxHoursPreference} hours a week at most` : "")),
          el("span", {}, icon("clock", { size: 13 }), ` Available ${availabilityText(e.availability)}`)),
        certChips(e, S.period.endDate)))),
  ];
}

export const employmentPill = (e) => e.employmentType === "partTime"
  ? el("span", { class: "pill info" }, "Part time") : el("span", { class: "pill" }, "Full time");

// "24 of 32 hours this week" for part timers, so the manager can see how close they are
function hoursLine(e, h) {
  const cap = app.S.partTimeMaxHours;
  if (e.employmentType !== "partTime" || cap == null) return `${hours(h)} this week`;
  return el("span", { class: h > cap ? "over-cap" : null }, `${h} of ${cap} hours this week (part-time cap)`);
}

// green = good, amber = new hire window or running out by `soon`, red = expired or missing.
// also used on the employee's my schedule page
export function certChips(e, soon) {
  const { S } = app;
  return el("div", { class: "chips" }, e.certs.map((c) => {
    const extra = c.onlyIf ? ` (if ${S.duties[c.onlyIf]})` : "";
    let cls, text;
    if (c.expiredOn) { cls = "fail"; text = `expired ${shortDate(c.expiredOn)}`; }
    else if (c.missing && c.ok) { cls = "warn"; text = `new hire, due ${shortDate(c.graceEnds)}`; }
    else if (c.missing) { cls = c.onlyIf ? "none" : "fail"; text = "missing"; }
    else if (c.expiresOn <= soon) { cls = "warn"; text = `runs out ${shortDate(c.expiresOn)}`; }
    else { cls = "pass"; text = `good to ${shortDate(c.expiresOn)}, ${c.expiresOn.slice(0, 4)}`; }
    return el("span", { class: "chip " + cls }, el("b", {}, c.name + extra), text);
  }));
}
