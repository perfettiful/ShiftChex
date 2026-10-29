// manager: the week grid and the rule check panel (UC-06, UC-07, UC-08, UC-12)
import { app, roleName, empName } from "../state.js";
import { el, ask } from "../dom.js";
import { icon } from "../icons.js";
import { money, dayLabel, shortDate, time, weekOf, plural, addDays } from "../format.js";
import { act } from "../api.js";
import { pageHead } from "../layout.js";
import { weekPicker } from "./weeks.js";

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
  // all seven days, including any the place is closed
  const days = Array.from({ length: 7 }, (_, i) => addDays(S.period.startDate, i));
  const open = new Set(S.shifts.map((s) => s.date));
  const blocks = blocksFrom(S.shifts);
  // everything wrong with each shift, worst first, so the cell gets coloured
  const problems = new Map();
  [...S.result.blocking, ...S.result.warnings].forEach((v) => {
    if (!v.shiftId) return;
    if (!problems.has(v.shiftId)) problems.set(v.shiftId, []);
    problems.get(v.shiftId).push(v);
  });
  const draft = S.period.status === "draft";
  const blocking = S.result.blocking.length;
  const pct = S.period.budget ? (S.projectedCost / S.period.budget) * 100 : 0;
  const openSwaps = S.shifts.filter((s) => s.swap).length;

  const head = pageHead({
    title: weekOf(S.period.startDate),
    tag: S.period.status,
    meta: draft ? `${S.organization.name} · today is ${shortDate(S.today)}`
                : `${S.organization.name} · published ${shortDate(S.period.publishedOn)}`,
    actions: [draft
      ? el("button", { onclick: publish, disabled: blocking > 0 || null },
          icon("send"), blocking ? `Publish (${blocking} blocking)` : "Publish")
      : el("button", { class: "ghost", onclick: unpublish }, icon("undo"), "Unpublish")],
    toolbar: [weekPicker(),
      el("div", { class: "meter" },
        el("div", { class: "row" }, el("span", {}, "Projected labor"), el("span", {}, `budget ${money(S.period.budget)}`)),
        el("div", { class: "row" }, el("b", { class: "num" }, money(S.projectedCost)),
          el("span", { class: "num" }, `${Math.round(pct)}%`)),
        el("div", { class: "track" }, el("span", { class: pct > 100 ? "over" : "", style: `width:${Math.min(100, pct)}%` })))],
  });

  const callout = draft ? null : el("p", { class: "callout" }, icon("info"),
    el("span", {}, "This week is out, so the grid is read only. Unpublish it to make changes" +
      (openSwaps ? `, which cancels the ${plural(openSwaps, "open swap")} on it.` : ".")));

  const table = el("table", { class: "roster" },
    el("thead", {}, el("tr", {},
      el("th", { class: "block" }, "Shift"),
      days.map((d) => el("th", { class: d === S.today ? "today" : null },
        dayLabel(d), d === S.today ? el("small", {}, "today") : !open.has(d) ? el("small", {}, "closed") : null)))),
    el("tbody", {}, blocks.map((b) => el("tr", {},
      el("td", { class: "block" },
        el("b", {}, roleName(b.roleId)),
        el("small", {}, `${time(b.startTime)} - ${time(b.endTime)}` + needs(b))),
      days.map((d) => el("td", { class: "cell" + (b.byDate.has(d) ? "" : " off") },
        (b.byDate.get(d) || []).map((s) => slot(s, problems.get(s.id) || [], draft)),
        (b.byDate.get(d) || [])[0]?.duties.map((x) => el("small", { class: "duty" }, S.duties[x]))))))));

  const panel = el("aside", { class: "panel" },
    el("h2", {}, el("span", {}, icon("shield"), "Rule check"),
      el("span", { class: "count " + (blocking ? "bad" : "ok") },
        S.result.violations.length ? `${blocking} blocking, ${plural(S.result.warnings.length, "warning")}` : "all clear")),
    el("div", { class: "body" },
      S.result.violations.length
        ? [...S.result.blocking, ...S.result.warnings].map((v) => el("div", { class: "v " + v.severity },
            el("div", { class: "rid" }, icon(v.severity === "blocking" ? "blocked" : "alert", { size: 14 }),
              `${v.ruleId} · ${v.severity === "blocking" ? "blocks publishing" : "warning"}`),
            el("p", {}, v.message)))
        : el("p", { class: "muted" }, "Nothing to report. This schedule can be published.")));

  return [head, callout, el("div", { class: "split" }, el("div", { class: "grid-wrap" }, table), panel)];
}

// " · 2 people" when a block takes more than one person a day
const needs = (b) => {
  const n = Math.max(...[...b.byDate.values()].map((l) => l.length));
  return n > 1 ? ` · ${n} people` : "";
};

// one dropdown per slot, only lists people trained for that role.
// under it: an override button when R1 is what's blocking, and swap status on a live week
function slot(shift, problems, draft) {
  const worst = problems[0];
  const eligible = app.S.employees.filter((e) => e.qualifications.some((q) => q.roleId === shift.roleId));
  const cls = "slot" + (worst ? (worst.severity === "blocking" ? " bad" : " warn") : (shift.employeeId ? "" : " empty"));
  const select = el("select", {
    "aria-label": `${roleName(shift.roleId)} ${dayLabel(shift.date)} ${time(shift.startTime)}`,
    disabled: !draft || null,
    onchange: (ev) => act("/api/assign", { shiftId: shift.id, employeeId: ev.target.value || null }, null),
  }, el("option", { value: "" }, "(nobody)"),
     eligible.map((e) => el("option", { value: e.id, selected: e.id === shift.employeeId || null },
       e.name + (e.isMinor ? " (17)" : ""))));

  const r1 = problems.find((v) => v.ruleId === "R1" && v.severity === "blocking");
  const notes = [];
  if (draft && r1) {
    notes.push(el("button", { class: "link", onclick: () => override(shift, r1) }, icon("pencil", { size: 12 }), "Override"));
  }
  if (shift.overrideReason) {
    notes.push(el("span", { class: "pill warn", title: `Override: ${shift.overrideReason}` },
      icon("pencil", { size: 11 }), "Overridden"));
  }
  if (shift.swap) {
    notes.push(el("span", { class: "pill info" }, icon("swap", { size: 11 }),
      shift.swap.status === "posted" ? "Up for swap" : `Claimed by ${shift.swap.claimedByName}`));
  }
  return el("div", { class: cls, title: problems.map((v) => v.message).join("\n") },
    select, notes.length ? el("div", { class: "slot-note" }, notes) : null);
}

// UC-12. ask for a reason, then assign the same person again with it
async function override(shift, violation) {
  const who = empName(shift.employeeId);
  const reason = await ask({
    title: `Override R1 for ${who}?`,
    glyph: "pencil",
    body: [
      el("p", { class: "quote" }, violation.message),
      "Only do this if they agreed to work it. R1 turns into a warning and your reason goes in the activity log. " +
      "Anything else wrong with the shift still blocks.",
    ],
    input: { label: "Reason", placeholder: `e.g. ${who.split(" ")[0]} offered to cover this one`,
             required: "Give a reason for the override." },
    confirm: "Override",
  });
  if (!reason) return;
  act("/api/assign", { shiftId: shift.id, employeeId: shift.employeeId, overrideReason: reason },
    `Overridden. R1 is a warning for ${who} now.`);
}

function publish() {
  act("/api/publish", { periodId: app.S.period.id }, "Published. Everyone on the schedule has a notice.");
}

async function unpublish() {
  const { S } = app;
  const open = S.shifts.filter((s) => s.swap).length;
  const ok = await ask({
    title: `Take the week of ${shortDate(S.period.startDate)} back to draft?`,
    glyph: "undo",
    body: [
      "Everyone on it gets a notice that it's changing, and it disappears from their schedule until you publish again.",
      open ? `The ${plural(open, "open swap request")} on it get cancelled, and the people in them are told.` : null,
    ],
    confirm: "Unpublish", tone: "danger",
  });
  if (ok) act("/api/unpublish", { periodId: S.period.id }, "Back to draft.");
}
