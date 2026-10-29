// the manager's week picker: back a week, pick any week, forward a week.
// on the schedule, the report and the people tab
import { app, reload } from "../state.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { weekRange } from "../format.js";

export function weekPicker() {
  const { S } = app;
  const i = S.periods.findIndex((p) => p.id === S.period.id);
  const go = (p) => { if (p) { app.periodId = p.id; reload(); } };
  const label = (p) => {
    const now = p.startDate <= S.today && S.today <= p.endDate ? " · this week" : "";
    return `${weekRange(p.startDate, p.endDate)} · ${p.status}${now}`;
  };
  const select = el("select", { "aria-label": "Week", onchange: (e) => go(S.periods.find((p) => p.id === e.target.value)) },
    S.periods.map((p) => el("option", { value: p.id, selected: p.id === S.period.id || null }, label(p))));
  return el("div", { class: "week-picker" },
    el("button", { class: "quiet", title: "Week before", "aria-label": "Week before",
      disabled: i <= 0 || null, onclick: () => go(S.periods[i - 1]) }, icon("chevronLeft")),
    select,
    el("button", { class: "quiet", title: "Week after", "aria-label": "Week after",
      disabled: i >= S.periods.length - 1 || null, onclick: () => go(S.periods[i + 1]) }, icon("chevronRight")));
}
