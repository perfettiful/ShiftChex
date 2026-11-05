// manager: everyone's roles, pay, availability and certs, as of the week being looked at
import { app, roleName } from "../state.js";
import { el, toast } from "../dom.js";
import { icon } from "../icons.js";
import { availabilityText, shortDate } from "../format.js";
import { act } from "../api.js";
import { pageHead } from "../layout.js";
import { weekPicker } from "./weeks.js";

export function peopleView() {
  const { S } = app;
  return [
    pageHead({ title: "People",
      meta: `${S.employees.length} on staff · certs as of the week of ${shortDate(S.period.startDate)}`,
      toolbar: [weekPicker()] }),
    addForm(),
    el("div", { class: "cards-grid" }, S.employees.map((e) =>
      el("div", { class: "card" },
        el("h3", {}, e.name, e.isMinor ? el("span", { class: "pill warn" }, "under 18") : null),
        el("div", { class: "facts" },
          el("span", {}, e.qualifications.map((q) => `${roleName(q.roleId)} $${q.hourlyRate}`).join(" · ")),
          el("span", {}, `Hired ${shortDate(e.hireDate)}, ${e.hireDate.slice(0, 4)}` +
            (e.maxHoursPreference ? ` · wants ${e.maxHoursPreference} hours a week at most` : "")),
          el("span", {}, icon("clock", { size: 13 }), ` Available ${availabilityText(e.availability)}`)),
        certChips(e, S.period.endDate)))),
  ];
}

// the form to add a new employee. the controller handles validation and adding them to the repo
function addForm() {
  const { S } = app;
  const name = el("input", { type: "text", maxlength: "60", placeholder: "First and last name" });
  const dob = el("input", { type: "date", max: S.today });
  const hired = el("input", { type: "date", value: S.today });
  const role = el("select", {}, S.roles.map((r) => el("option", { value: r.id }, r.name)));
  const rate = el("input", { type: "number", min: "0.25", step: "0.25", placeholder: "16.00" });
  const maxHours = el("input", { type: "number", min: "1", max: "80", step: "1", placeholder: "Optional" });

  const submit = async () => {
    const r = await act("/api/employees", {
      name: name.value, dateOfBirth: dob.value, hireDate: hired.value, roleId: role.value,
      hourlyRate: rate.value, maxHoursPreference: maxHours.value,
    }, null, { keep: true });
    if (r.data.ok) toast(`Added ${r.data.employee.name}. They sign in as ${r.data.username}.`);
  };

  return el("details", { class: "card form" },
    el("summary", {}, " Add employee"),
    el("div", { class: "form-row" },
      el("label", { class: "field grow" }, "Name", name),
      el("label", { class: "field" }, "Date of birth", dob),
      el("label", { class: "field" }, "Hire date", hired)),
    el("div", { class: "form-row" },
      el("label", { class: "field" }, "Role", role),
      el("label", { class: "field" }, "Hourly rate ($)", rate),
      el("label", { class: "field" }, "Max hours a week", maxHours)),
    el("p", { class: "muted small" }, "Employee sets availability on sign in. PW matches demo password. " +
      "Adding Certs TBD."),
    el("button", { onclick: submit }, "Add employee"));
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
