// manager: UC-11 coverage and labor report. read only
import { app, roleName } from "../state.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { money, dayLabel, shortDate, time, weekRange, plural, addDays } from "../format.js";
import { pageHead, section } from "../layout.js";
import { weekPicker } from "./weeks.js";

// [pill tone, pill text, how the date reads]
const CERT = {
  expired: ["fail", "Expired", ""], missing: ["fail", "Missing", "since "],
  expiring: ["warn", "Runs out", ""], due: ["warn", "New hire", "due "],
};
const HOURS = { over: ["fail", "Over"], near: ["warn", "Close"], ok: ["pass", "OK"] };

export function reportView() {
  const { S, R } = app;
  if (!R || R.error) return [el("p", { class: "muted loading" }, R?.error || "Loading…")];

  const open = R.days.reduce((t, d) => t + d.open.length, 0);
  const openDays = R.days.filter((d) => d.open.length).length;
  const pct = R.labor.budget ? Math.round((R.labor.cost / R.labor.budget) * 100) : 0;
  const over = R.hours.filter((h) => h.status === "over").length;
  const near = R.hours.filter((h) => h.status === "near").length;
  const urgent = R.certs.filter((c) => c.kind === "expired" || c.kind === "missing").length;
  const year = (d) => (d.slice(0, 4) !== R.today.slice(0, 4) ? `, ${d.slice(0, 4)}` : "");

  return [
    pageHead({
      title: "Coverage and labor", tag: R.period.status,
      meta: `${weekRange(R.period.startDate, R.period.endDate)} · ${S.organization.name}`,
      actions: [el("button", { class: "quiet", onclick: () => window.print() }, icon("printer"), "Print")],
      toolbar: [weekPicker()],
    }),

    el("div", { class: "stats" },
      stat("calendar", "Open shifts", open, open ? "bad" : "good", open ? `on ${plural(openDays, "day")}` : "every shift is covered"),
      stat("dollar", "Projected labor", money(R.labor.cost), pct > 100 ? "bad" : "", `${pct}% of the ${money(R.labor.budget)} budget`),
      stat("clock", "Over overtime", over, over ? "bad" : near ? "warn" : "good",
        `${near} more at ${R.nearOvertime}+ of ${R.overtimeThreshold} hours`),
      stat("shield", "Cert problems", urgent, urgent ? "bad" : "good",
        `${R.certs.length - urgent} more due in the next ${R.certWindowDays} days`)),

    el("div", { class: "grid-2" },
      section("Open shifts by day", null, table(
        ["Day", "Shifts", "Open", "Hours", "Labor"],
        R.days.map((d) => [
          el("span", {}, dayLabel(d.date), !d.shifts ? el("div", { class: "muted small" }, "closed")
            : d.open.length ? el("div", { class: "muted small" },
              d.open.map((o) => `${roleName(o.roleId)} ${time(o.startTime)}`).join(", ")) : null),
          num(d.shifts), num(d.open.length, d.open.length ? "bad" : ""),
          num(d.hours), num(money(d.cost))]),
        ["Week", num(R.days.reduce((t, d) => t + d.shifts, 0)), num(open),
         num(R.days.reduce((t, d) => t + d.hours, 0)), num(money(R.labor.cost))])),

      section("Labor by role", `budget ${money(R.labor.budget)}`, table(
        ["Role", "Hours", "Cost", "Share"],
        R.labor.byRole.map((r) => {
          const share = R.labor.cost ? (r.cost / R.labor.cost) * 100 : 0;
          return [r.name, num(r.hours), num(money(r.cost)),
            el("div", { class: "bar-cell" }, el("div", { class: "track" }, el("span", { style: `width:${share}%` })),
              el("span", { class: "muted small num" }, `${Math.round(share)}%`))];
        }),
        ["Total", num(R.labor.byRole.reduce((t, r) => t + r.hours, 0)), num(money(R.labor.cost)), ""])),

      section("Hours this week", `overtime after ${R.overtimeThreshold}`, table(
        ["Person", "Shifts", "Hours", ""],
        R.hours.map((h) => [
          el("span", {}, h.name, h.overPreference
            ? el("div", { class: "muted small" }, `asked for ${h.prefers} at most`) : null),
          num(h.shifts), num(h.hours),
          el("span", { class: "pill " + HOURS[h.status][0] }, HOURS[h.status][1])]))),

      section("Certifications", `today to ${shortDate(addDays(R.today, R.certWindowDays))}`, R.certs.length
        ? table(["Person", "Certification", "", "Date"], R.certs.map((c) => [
            c.name,
            el("span", {}, c.certName, c.onlyIf ? el("div", { class: "muted small" }, `needed if the shift ${S.duties[c.onlyIf]}`) : null),
            el("span", { class: "pill " + CERT[c.kind][0] }, CERT[c.kind][1]),
            c.date ? CERT[c.kind][2] + shortDate(c.date) + year(c.date) : ""]))
        : el("div", { class: "card empty" }, icon("ok"), "Nothing running out."))),

    section("Overrides", "why a rule was set aside", R.overrides.length
      ? el("div", { class: "list" }, R.overrides.map((o) => el("div", { class: "card lead-icon" }, icon("pencil"),
          el("div", {},
            el("h3", {}, `${o.employeeName} · ${roleName(o.roleId)} · ${dayLabel(o.date)} ${time(o.startTime)} - ${time(o.endTime)}`),
            el("p", { class: "muted" }, o.reason)))))
      : el("div", { class: "card empty" }, icon("ok"), "No overrides this week.")),

    section("Activity log", "newest first", R.activity.length
      ? el("div", { class: "table-wrap" }, el("ul", { class: "log" }, R.activity.map((a) =>
          el("li", {}, el("time", { datetime: a.at }, shortDate(a.at)), el("span", {}, a.what)))))
      : el("div", { class: "card empty" }, icon("history"), "Nothing yet.")),
  ];
}

const stat = (glyph, label, value, tone, sub) => el("div", { class: "stat" },
  el("div", { class: "label" }, icon(glyph, { size: 14 }), label),
  el("div", { class: `value num ${tone}` }, String(value)),
  el("div", { class: "sub" }, sub));

// numbers line up on the right. tone "bad" makes it red
const num = (v, tone = "") => ({ num: v, tone });
const cell = (v, tag) => (v && v.num !== undefined
  ? el(tag, { class: `num ${v.tone || ""}`.trim() }, String(v.num))
  : el(tag, {}, v));

function table(head, rows, foot) {
  const numeric = rows[0] ? rows[0].map((v) => v && v.num !== undefined) : [];
  return el("div", { class: "table-wrap" }, el("table", { class: "data" },
    el("thead", {}, el("tr", {}, head.map((h, i) => el("th", { class: numeric[i] ? "num" : null }, h)))),
    el("tbody", {}, rows.map((r) => el("tr", {}, r.map((v) => cell(v, "td"))))),
    foot ? el("tfoot", {}, el("tr", {}, foot.map((v) => cell(v, "td")))) : null));
}
