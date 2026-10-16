// employee: notices, their shifts this week and their certs (UC-03, UC-04)
import { app, roleName, empName, me } from "../state.js";
import { el } from "../dom.js";
import { dayLabel, time } from "../format.js";
import { act } from "../api.js";
import { certChips } from "./people.js";

export function myScheduleView() {
  const { S } = app;
  const mine = S.shifts.filter((s) => s.employeeId === S.employeeId).sort((a, b) =>
    (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const total = mine.reduce((t, s) => t + s.hours, 0);
  const published = S.period.status === "published";
  const swapFor = (id) => (S.mySwaps || []).find((s) => s.shiftId === id && s.status !== "denied");

  return [
    el("div", { class: "subbar" },
      el("h1", {}, empName(S.employeeId)),
      el("span", { class: "tag " + S.period.status }, S.period.status),
      el("span", { class: "muted" }, `Week of ${dayLabel(S.period.startDate)} · ${total} hours`)),
    S.notices.length ? el("div", { class: "section-title" }, "Notices") : null,
    S.notices.length ? el("div", { class: "cards" }, [...S.notices].reverse().map((n) =>
      el("div", { class: "card notice" }, n.text))) : null,
    el("div", { class: "section-title" }, "My shifts"),
    el("div", { class: "cards" }, mine.length ? mine.map((s) => {
      const sw = swapFor(s.id);
      return el("div", { class: "card" }, el("div", { class: "row" },
        el("div", { class: "grow" },
          el("h3", {}, `${roleName(s.roleId)} · ${dayLabel(s.date)}`),
          el("div", { class: "muted" }, `${time(s.startTime)} - ${time(s.endTime)} · ${s.hours} hours`)),
        sw
          ? el("span", { class: "pill warn" },
              sw.status === "posted" ? "Posted for swap" : `Claim ${sw.status}`)
          : el("button", { class: "ghost", disabled: !published || null,
              onclick: () => act("/api/post-swap", { shiftId: s.id }, "Posted. Anyone qualified can claim it.") },
              published ? "Post for swap" : "Not published yet")));
    }) : el("p", { class: "muted" }, "No shifts this week.")),
    el("div", { class: "section-title" }, "My certifications"),
    el("div", { class: "cards" }, el("div", { class: "card" }, certChips(me()))),
  ];
}
