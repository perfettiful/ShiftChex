// employee: UC-01 declare weekly availability
import { app, me } from "../state.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { shortDate, WEEK, availabilityText } from "../format.js";
import { act } from "../api.js";
import { pageHead } from "../layout.js";

export function availabilityView() {
  const { S } = app;
  const latest = S.myAvailability;
  const byDay = new Map(latest.slots.map((a) => [a.weekday, a]));

  // a checkbox and two time boxes per day. unticked greys out the times
  const rows = WEEK.map(([weekday, name]) => {
    const cur = byDay.get(weekday);
    const on = el("input", { type: "checkbox", checked: !!cur || null, "aria-label": `Available ${name}` });
    const from = el("input", { type: "time", value: cur ? cur.startTime : "09:00", "aria-label": `${name} from` });
    const to = el("input", { type: "time", value: cur ? cur.endTime : "17:00", "aria-label": `${name} to` });
    const sync = () => { from.disabled = to.disabled = !on.checked; };
    on.addEventListener("change", sync);
    sync();
    return { weekday, on, from, to, row: el("tr", {},
      el("td", {}, el("label", { class: "check" }, on, name)),
      el("td", {}, from), el("td", {}, to)) };
  });
  const starting = el("input", { type: "date", min: S.today,
    value: latest.effectiveFrom > S.today ? latest.effectiveFrom : S.today });

  const save = () => {
    const slots = rows.filter((r) => r.on.checked)
      .map((r) => ({ weekday: r.weekday, startTime: r.from.value, endTime: r.to.value }));
    act("/api/availability", { effectiveFrom: starting.value, slots },
      `Saved. Shifts from ${shortDate(starting.value)} on get checked against this.`, { keep: true });
  };

  return [
    pageHead({ title: "My availability", meta: `Right now: ${availabilityText(me().availability)}` }),
    el("div", { class: "card form" },
      el("p", { class: "muted" }, "Tick the days you can work and the hours you can do. " +
        "Days left unticked count as not available, and the manager can't schedule you outside this " +
        "unless you've agreed to it."),
      el("table", { class: "avail" },
        el("thead", {}, el("tr", {}, el("th", {}, "Day"), el("th", {}, "From"), el("th", {}, "To"))),
        el("tbody", {}, rows.map((r) => r.row))),
      el("div", { class: "form-row" },
        el("label", { class: "field" }, "Starting", starting),
        el("button", { onclick: save }, icon("save"), "Save availability")),
      latest.effectiveFrom > S.today
        ? el("p", { class: "hint" }, `What you last sent starts ${shortDate(latest.effectiveFrom)}.`) : null),
  ];
}
