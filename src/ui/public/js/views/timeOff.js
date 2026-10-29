// employee: UC-02 request time off, plus the status of what they've asked for
import { app } from "../state.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { dateRange } from "../format.js";
import { act } from "../api.js";
import { pageHead, section } from "../layout.js";

const PILL = { pending: ["warn", "clock", "Waiting"], approved: ["pass", "check", "Approved"], denied: ["fail", "x", "Turned down"] };

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
    pageHead({ title: "Time off", meta: "Once it's approved you can't be scheduled on those days." }),
    el("div", { class: "card form" },
      el("div", { class: "form-row" },
        el("label", { class: "field" }, "From", from),
        el("label", { class: "field" }, "To", to),
        el("label", { class: "field grow" }, "Reason", reason)),
      el("button", { onclick: submit }, icon("plus"), "Request time off")),
    section("My requests", mine.length || null, el("div", { class: "list" }, mine.length ? mine.map((t) => {
      const [tone, glyph, word] = PILL[t.status];
      return el("div", { class: "card" }, el("div", { class: "row" },
        el("div", { class: "grow lead-icon" }, icon("sun"),
          el("div", {}, el("h3", {}, dateRange(t.startDate, t.endDate)),
            el("div", { class: "muted small" }, t.reason || "No reason given"))),
        el("div", { class: "actions" },
          el("span", { class: "pill " + tone }, icon(glyph, { size: 12 }), word),
          t.status === "pending"
            ? el("button", { class: "link", onclick: () => act("/api/cancel-time-off", { requestId: t.id }, "Request cancelled.") },
                icon("x", { size: 14 }), "Cancel") : null)));
    }) : el("div", { class: "card empty" }, icon("sun"), "You haven't asked for any time off."))),
  ];
}
