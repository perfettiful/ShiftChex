// employee: the swap board (UC-05). split into what you can claim, what you can't (with
// every rule that's stopping you) and what you posted, each one a group that folds up
import { app, roleName } from "../state.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { dayLabel, time, hours, plural } from "../format.js";
import { act } from "../api.js";
import { pageHead } from "../layout.js";

// short names for the summary line on the "can't claim" group
const RULES = {
  R1: "availability", R2: "time off", R3: "rest", R4: "under 18", R5: "not trained", R6: "coverage",
  R7: "overtime", R8: "budget", R9: "notice", R10: "certs", R11: "on-site certs", R12: "part-time cap",
};

// which groups are open. kept here so a claim or reload doesn't fold everything back up
const OPEN = { claimable: true, blocked: false, mine: true };

export function boardView() {
  const board = app.S.board;
  const mine = board.filter((b) => b.mine);
  const blocked = board.filter((b) => !b.mine && b.result.blocking.length);
  const claimable = board.filter((b) => !b.mine && !b.result.blocking.length);
  const head = pageHead({ title: "Swap board", meta: board.length
    ? `${plural(board.length, "shift")} up for grabs, ${claimable.length} you can take`
    : "Nothing posted right now" });

  if (!board.length) {
    return [head, el("div", { class: "card empty" }, icon("swap"),
      "Nothing posted. You can post one of your own shifts from My schedule.")];
  }

  // the rules stopping you most often, so the closed group still says something useful
  const reasons = [...new Set(blocked.flatMap((b) => b.result.blocking.map((v) => RULES[v.ruleId] || v.ruleId)))];

  return [
    head,
    el("div", { class: "accordion" },
      group("claimable", "You can claim", "ok", "pass", claimable,
        claimable.length ? "You're available and qualified for these. The manager approves it after you claim."
          : "Nothing you can take right now.",
        claimable.map(claimCard)),
      blocked.length ? group("blocked", "You can't claim", "blocked", "fail", blocked,
        `Stopped by ${reasons.slice(0, 3).join(", ")}${reasons.length > 3 ? " and more" : ""}`,
        blocked.map(blockedCard)) : null,
      mine.length ? group("mine", "Posted by you", "swap", "warn", mine,
        "Waiting for someone to claim. You can take them back until then.",
        mine.map(mineCard)) : null),
  ];
}

// one fold. key is where its open state lives in OPEN
function group(key, title, glyph, tone, items, sub, cards) {
  const d = el("details", { class: `acc ${tone}`, open: OPEN[key] || null },
    el("summary", {},
      el("span", { class: "acc-icon" }, icon(glyph, { size: 18 })),
      el("span", { class: "acc-title" }, el("b", {}, title), el("span", { class: "muted small" }, sub)),
      el("span", { class: `acc-count ${tone}` }, String(items.length)),
      el("span", { class: "acc-chevron" }, icon("chevronRight", { size: 18 }))),
    el("div", { class: "acc-body list" }, cards));
  d.addEventListener("toggle", () => { OPEN[key] = d.open; });
  return d;
}

const when = (b) => `${time(b.startTime)} - ${time(b.endTime)} · ${hours(b.hours)}`;

function shiftHead(b, ...actions) {
  return el("div", { class: "row" },
    el("div", { class: "grow" },
      el("h3", {}, `${dayLabel(b.date)} · ${roleName(b.roleId)}`),
      el("div", { class: "muted small" }, `${when(b)} · posted by ${b.mine ? "you" : b.postedByName}`)),
    actions.length ? el("div", { class: "actions" }, actions) : null);
}

function claimCard(b) {
  const warning = b.result.warnings[0];
  return el("div", { class: "card" },
    shiftHead(b, el("button", { onclick: () => claim(b.swapId) }, icon("check"), "Claim shift")),
    warning ? el("p", { class: "hint" }, icon("alert", { size: 13 }), " ", warning.message) : null);
}

function blockedCard(b) {
  return el("div", { class: "card blocked" },
    shiftHead(b),
    el("ul", { class: "reasons" }, b.result.blocking.map((v) =>
      el("li", {}, el("span", { class: "rid" }, v.ruleId), el("span", {}, v.message)))));
}

function mineCard(b) {
  return el("div", { class: "card" },
    shiftHead(b, el("button", { class: "link", onclick: () => withdraw(b.swapId) },
      icon("undo", { size: 14 }), "Take it back")));
}

const claim = (swapId) => act("/api/claim", { swapId },
  "Claimed. It's with the manager now, and the shift stays with whoever posted it until they decide.");
const withdraw = (swapId) => act("/api/withdraw-swap", { swapId }, "Taken off the swap board. It's still yours.");
