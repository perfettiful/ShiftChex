// employee: UC-02 request time off, plus the status of what they've asked for
import { app } from "../state.js";
import { el } from "../dom.js";
import { dayLabel } from "../format.js";
import { act } from "../api.js";

const PILL = { pending: "warn", approved: "pass", denied: "fail" };

export function timeOffView() {
  const { S } = app;
  const from = el("input", { type: "date", min: S.today, value: S.today });
  const to = el("input", { type: "date", min: S.today, value: S.today });
  const reason = el("input", { type: "text", placeholder: "Optional", maxlength: "120" });
  from.addEventListener("change", () => { if (to.value < from.value) to.value = from.value; });

  const submit = () => act("/api/time-off", { startDate: from.value, endDate: to.value, reason: reason.value },
    "Sent. It shows up in the manager's approvals.", { keep: true });

  const mine = [...S.timeOff].sort((a, b) => b.startDate.localeCompare(a.startDate));
  return [
    el("div", { class: "subbar" }, el("h1", {}, "Time off")),
    el("div", { class: "cards" }, el("div", { class: "card form" },
      el("div", { class: "row" },
        el("label", { class: "field" }, "From", from),
        el("label", { class: "field" }, "To", to),
        el("label", { class: "field grow" }, "Reason", reason),
        el("button", { onclick: submit }, "Request time off")),
      el("p", { class: "muted" }, "Once it's approved you can't be scheduled on those days."))),
    el("div", { class: "section-title" }, "My requests"),
    el("div", { class: "cards" }, mine.length ? mine.map((t) =>
      el("div", { class: "card" }, el("div", { class: "row" },
        el("div", { class: "grow" },
          el("h3", {}, t.startDate === t.endDate ? dayLabel(t.startDate)
                                                 : `${dayLabel(t.startDate)} to ${dayLabel(t.endDate)}`),
          el("div", { class: "muted" }, t.reason || "No reason given")),
        el("span", { class: "pill " + PILL[t.status] }, t.status))))
      : el("p", { class: "muted" }, "You haven't asked for any time off.")),
  ];
}
