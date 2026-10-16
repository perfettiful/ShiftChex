// manager: the week grid and the rule check panel (UC-06, UC-07, UC-08)
import { app, roleName } from "../state.js";
import { el } from "../dom.js";
import { money, dayLabel, time } from "../format.js";
import { act } from "../api.js";

// group shifts into rows by role + time, then by day
function blocksFrom(shifts) {
  const map = new Map();
  shifts.forEach((s) => {
    const key = `${s.roleId}|${s.startTime}|${s.endTime}`;
    if (!map.has(key)) map.set(key, { roleId: s.roleId, startTime: s.startTime,
                                      endTime: s.endTime, byDate: new Map() });
    const b = map.get(key);
    if (!b.byDate.has(s.date)) b.byDate.set(s.date, []);
    b.byDate.get(s.date).push(s);
  });
  return [...map.values()];
}

export function scheduleView() {
  const { S } = app;
  const days = [...new Set(S.shifts.map((s) => s.date))].sort();
  const blocks = blocksFrom(S.shifts);
  // worst problem on each shift, so the cell gets coloured
  const bad = new Map();
  S.result.violations.forEach((v) => {
    if (!v.shiftId) return;
    const cur = bad.get(v.shiftId);
    if (!cur || (v.severity === "blocking" && cur.severity !== "blocking")) bad.set(v.shiftId, v);
  });
  const draft = S.period.status === "draft";
  const over = S.projectedCost > S.period.budget;

  const head = el("div", { class: "subbar" },
    el("h1", {}, `Week of ${dayLabel(S.period.startDate)}`),
    el("span", { class: "tag " + S.period.status }, S.period.status),
    el("span", { class: "muted" }, `${S.organization.name} · today is ${S.today}`),
    el("div", { class: "meter" },
      el("div", { class: "row" },
        el("span", {}, "Projected labour"),
        el("span", {}, `budget ${money(S.period.budget)}`)),
      el("div", { class: "row" }, el("b", {}, money(S.projectedCost)), el("span", {}, "")),
      el("div", { class: "track" },
        el("span", { class: over ? "over" : "",
          style: `width:${Math.min(100, (S.projectedCost / S.period.budget) * 100)}%` }))),
    el("div", { class: "actions" },
      draft
        ? el("button", { onclick: publish, disabled: S.result.blocking.length > 0 || null },
            S.result.blocking.length ? `Publish (${S.result.blocking.length} blocking)` : "Publish")
        : el("button", { class: "ghost", onclick: () => act("/api/unpublish", {}, "Back to draft.") },
            "Unpublish")));

  const table = el("table", {},
    el("thead", {}, el("tr", {},
      el("th", { class: "block" }, "Shift block"),
      days.map((d) => el("th", {}, dayLabel(d))))),
    el("tbody", {}, blocks.map((b) => el("tr", {},
      el("td", { class: "block" },
        el("b", {}, roleName(b.roleId)),
        el("small", {}, `${time(b.startTime)} - ${time(b.endTime)}`),
        el("small", { class: "muted" }, `needs ${Math.max(...[...b.byDate.values()].map((l) => l.length))}`)),
      days.map((d) => el("td", { class: "cell" + (b.byDate.has(d) ? "" : " off") },
        (b.byDate.get(d) || []).map((s) => slotSelect(s, bad.get(s.id))),
        (b.byDate.get(d) || [])[0]?.duties.map((x) => el("small", { class: "duty" }, S.duties[x]))))))));

  const panel = el("aside", { class: "panel" },
    el("h2", {}, "Rule check",
      el("span", { class: "count " + (S.result.blocking.length ? "bad" : "ok") },
        S.result.violations.length ? `${S.result.blocking.length} blocking, ${S.result.warnings.length} warning`
                                   : "all clear")),
    el("div", { class: "body" },
      S.result.violations.length
        // red (blocking) first, then yellow (warnings)
        ? [...S.result.blocking, ...S.result.warnings].map((v) => el("div", { class: "v " + v.severity },
            el("div", { class: "rid" }, `${v.ruleId} · ${v.severity === "blocking" ? "blocks publishing" : "warning"}`),
            el("p", {}, v.message)))
        : el("p", { class: "muted" }, "Nothing to report. This schedule can be published.")));

  return [head, el("div", { class: "layout" }, el("div", { class: "grid" }, table), panel)];
}

// one dropdown per slot, only lists people trained for that role
function slotSelect(shift, violation) {
  const eligible = app.S.employees.filter((e) => e.qualifications.some((q) => q.roleId === shift.roleId));
  const cls = "slot" + (violation ? (violation.severity === "blocking" ? " bad" : " warn")
                                  : (shift.employeeId ? "" : " empty"));
  const sel = el("select", {
    onchange: (ev) => act("/api/assign", { shiftId: shift.id, employeeId: ev.target.value || null }, null),
  }, el("option", { value: "" }, "(nobody)"),
     eligible.map((e) => el("option", { value: e.id, selected: e.id === shift.employeeId || null },
       e.name + (e.isMinor ? " (17)" : ""))));
  return el("div", { class: cls, title: violation ? violation.message : "" }, sel);
}

const publish = () => act("/api/publish", {}, "Published. Everyone on the schedule has a notice.");
