// manager: swaps waiting on a decision (UC-09) and time off requests (UC-10)
import { app, roleName } from "../state.js";
import { el } from "../dom.js";
import { dayLabel, time } from "../format.js";
import { act } from "../api.js";

export function approvalsView() {
  const { S } = app;
  const swaps = S.pendingSwaps || [];
  const timeOff = S.timeOff.filter((t) => t.status === "pending");

  return [
    el("div", { class: "section-title" }, `Swap requests (${swaps.length})`),
    el("div", { class: "cards" }, swaps.length ? swaps.map(swapCard) : el("p", { class: "muted" }, "Nothing waiting.")),
    el("div", { class: "section-title" }, `Time off (${timeOff.length})`),
    el("div", { class: "cards" }, timeOff.length ? timeOff.map(timeOffCard) : el("p", { class: "muted" }, "Nothing waiting.")),
  ];
}

function swapCard(p) {
  const failed = p.result.blocking.length > 0;
  return el("div", { class: "card" + (failed ? " blocked" : "") },
    el("div", { class: "row" },
      el("div", { class: "grow" },
        el("h3", {}, `${p.postedByName} → ${p.claimedByName}`),
        el("div", { class: "muted" },
          `${roleName(p.roleId)} · ${dayLabel(p.date)} · ${time(p.startTime)} - ${time(p.endTime)}`)),
      el("span", { class: "pill " + (failed ? "fail" : p.result.warnings.length ? "warn" : "pass") },
        failed ? "Check failed" : p.result.warnings.length ? "Warning" : "Check passed"),
      el("button", { onclick: () => decideSwap(p.swapId, "approve"), disabled: failed || null }, "Approve"),
      el("button", { class: "quiet", onclick: () => decideSwap(p.swapId, "deny") }, "Deny")),
    failed
      ? el("p", { class: "note" }, p.result.blocking[0].message)
      : p.result.warnings.length ? el("p", { class: "muted" }, p.result.warnings[0].message)
      : el("p", { class: "muted" }, "Rules get checked again here since the schedule might have changed since the claim."));
}

function timeOffCard(t) {
  return el("div", { class: "card" }, el("div", { class: "row" },
    el("div", { class: "grow" },
      el("h3", {}, t.employeeName),
      el("div", { class: "muted" }, `${t.startDate} to ${t.endDate} · ${t.reason || "no reason given"}`)),
    el("button", { onclick: () => decideTimeOff(t.id, "approve") }, "Approve"),
    el("button", { class: "quiet", onclick: () => decideTimeOff(t.id, "deny") }, "Deny")));
}

const decideSwap = (swapId, decision) => act("/api/decide-swap", { swapId, decision },
  decision === "approve" ? "Approved. The shift has been reassigned." : "Denied.");

const decideTimeOff = (requestId, decision) => act("/api/decide-timeoff", { requestId, decision },
  `Time off ${decision === "approve" ? "approved" : "denied"}.`);
