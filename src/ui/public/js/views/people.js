// manager: everyone's roles, pay, availability and certs
import { app, roleName } from "../state.js";
import { el } from "../dom.js";
import { availabilityText } from "../format.js";

export function peopleView() {
  return [el("div", { class: "section-title" }, "People"),
    el("div", { class: "cards" }, app.S.employees.map((e) =>
      el("div", { class: "card" },
        el("h3", {}, e.name + (e.isMinor ? "  ·  under 18" : "")),
        el("div", { class: "muted" }, `Hired ${e.hireDate}  ·  ` + e.qualifications.map((q) =>
          `${roleName(q.roleId)} at $${q.hourlyRate}`).join("  ·  ")),
        el("div", { class: "muted" }, `Available ${availabilityText(e.availability)}`),
        certChips(e))))];
}

// green = good, amber = new hire window or running out this week, red = expired or missing.
// also used on the employee's my schedule page
export function certChips(e) {
  const { S } = app;
  return el("div", { class: "chips" }, e.certs.map((c) => {
    const extra = c.onlyIf ? ` (if ${S.duties[c.onlyIf]})` : "";
    let cls, text;
    if (c.expiredOn) { cls = "fail"; text = `expired ${c.expiredOn}`; }
    else if (c.missing && c.ok) { cls = "warn"; text = `new hire, due ${c.graceEnds}`; }
    else if (c.missing) { cls = c.onlyIf ? "none" : "fail"; text = "missing"; }
    else if (c.expiresOn <= S.period.endDate) { cls = "warn"; text = `expires ${c.expiresOn}`; }
    else { cls = "pass"; text = `good to ${c.expiresOn}`; }
    return el("span", { class: "chip " + cls }, el("b", {}, c.name + extra), text);
  }));
}
