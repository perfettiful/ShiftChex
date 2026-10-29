// manager: swaps waiting on a decision (UC-09) and time off requests (UC-10)
import { app, roleName } from "../state.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { dayLabel, shortDate, dateRange, time, weekOf, plural } from "../format.js";
import { act } from "../api.js";
import { pageHead, section } from "../layout.js";

export function approvalsView() {
  const { S } = app;
  const swaps = S.pendingSwaps;
  const timeOff = S.timeOff.filter((t) => t.status === "pending")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const waiting = swaps.length + timeOff.length;

  return [
    pageHead({ title: "Approvals",
      meta: waiting ? `${plural(waiting, "request")} waiting on you` : "You're all caught up" }),
    section("Swap requests", swaps.length, el("div", { class: "list" }, swaps.length ? swaps.map(swapCard)
      : el("div", { class: "card empty" }, icon("inbox"), "No claims waiting. They show up here once someone claims a posted shift."))),
    section("Time off", timeOff.length, el("div", { class: "list" }, timeOff.length ? timeOff.map(timeOffCard)
      : el("div", { class: "card empty" }, icon("inbox"), "No time off requests waiting."))),
  ];
}

const decideButtons = (onApprove, onDeny, blocked) => el("div", { class: "actions" },
  el("button", { onclick: onApprove, disabled: blocked || null }, icon("check"), "Approve"),
  el("button", { class: "quiet", onclick: onDeny }, icon("x"), "Deny"));

function swapCard(p) {
  const failed = p.result.blocking.length > 0;
  const warned = !failed && p.result.warnings.length > 0;
  return el("div", { class: "card" + (failed ? " blocked" : "") },
    el("div", { class: "row" },
      el("div", { class: "grow" },
        el("h3", {}, `${p.postedByName} → ${p.claimedByName}`,
          el("span", { class: "pill " + (failed ? "fail" : warned ? "warn" : "pass") },
            icon(failed ? "blocked" : warned ? "alert" : "ok", { size: 12 }),
            failed ? "Check failed" : warned ? "Warning" : "Check passed")),
        el("div", { class: "muted small" },
          `${roleName(p.roleId)} · ${dayLabel(p.date)} · ${time(p.startTime)} - ${time(p.endTime)} · ` +
          `${weekOf(p.weekOf)} · posted ${shortDate(p.postedOn)}`)),
      decideButtons(() => decideSwap(p.swapId, "approve"), () => decideSwap(p.swapId, "deny"), failed)),
    failed ? el("p", { class: "note" }, icon("blocked", { size: 14 }), el("span", {}, p.result.blocking[0].message))
      : warned ? el("p", { class: "hint" }, p.result.warnings[0].message)
      : el("p", { class: "hint" }, "The rules ran again just now, since the schedule might have changed since the claim."));
}

function timeOffCard(t) {
  const live = t.conflicts.filter((s) => s.published);
  const one = t.conflicts.length === 1;
  return el("div", { class: "card" },
    el("div", { class: "row" },
      el("div", { class: "grow" },
        el("h3", {}, t.employeeName),
        el("div", { class: "muted small" }, `${dateRange(t.startDate, t.endDate)} · ${t.reason || "no reason given"}`)),
      decideButtons(() => decideTimeOff(t, "approve"), () => decideTimeOff(t, "deny"))),
    t.conflicts.length
      ? el("div", { class: "conflicts" }, icon("alert", { size: 14 }), el("span", {},
          `${t.employeeName.split(" ")[0]} is on ${t.conflicts.map((s) =>
            `${dayLabel(s.date)} ${roleName(s.roleId)} ${time(s.startTime)}`).join(", ")}. ` +
          `Approving means R2 blocks ${one ? "that shift" : "those shifts"}` +
          (live.length ? `, and ${one ? "it's" : "they're"} on a published week, so you'd need to unpublish ` +
            `to move ${one ? "it" : "them"}.` : ".")))
      : el("p", { class: "hint" }, `Not on any shifts ${t.startDate === t.endDate ? "that day" : "those days"}.`));
}

const decideSwap = (swapId, decision) => act("/api/decide-swap", { swapId, decision },
  decision === "approve" ? "Approved. The shift has moved and both of them have a notice." : "Denied. Both of them have a notice.");

const decideTimeOff = (t, decision) => act("/api/decide-timeoff", { requestId: t.id, decision },
  `Time off ${decision === "approve" ? "approved" : "denied"}. ${t.employeeName.split(" ")[0]} has a notice.`);
