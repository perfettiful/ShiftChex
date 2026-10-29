// employee: the swap board (UC-05). shifts you can't take still show up with the reason
import { app, roleName } from "../state.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { dayLabel, time, hours, plural } from "../format.js";
import { act } from "../api.js";
import { pageHead } from "../layout.js";

export function boardView() {
  const board = app.S.board;
  const claimable = board.filter((b) => !b.mine && !b.result.blocking.length).length;
  return [
    pageHead({ title: "Swap board", meta: board.length
      ? `${plural(board.length, "shift")} up for grabs, ${claimable} you can take`
      : "Nothing posted right now" }),
    el("div", { class: "list" }, board.length ? board.map(card)
      : el("div", { class: "card empty" }, icon("swap"), "Nothing posted. You can post one of your own shifts from My schedule.")),
    board.length ? el("p", { class: "hint" },
      "Shifts you can't take still show up, with the rule that's stopping you.") : null,
  ];
}

function card(b) {
  const blocked = !b.mine && b.result.blocking.length > 0;
  const warned = !b.mine && !blocked && b.result.warnings.length > 0;
  return el("div", { class: "card" + (blocked ? " blocked" : "") },
    el("div", { class: "row" },
      el("div", { class: "grow" },
        el("h3", {}, `${dayLabel(b.date)} · ${roleName(b.roleId)}`),
        el("div", { class: "muted small" },
          `${time(b.startTime)} - ${time(b.endTime)} · ${hours(b.hours)} · posted by ${b.mine ? "you" : b.postedByName}`)),
      el("div", { class: "actions" }, b.mine
        ? [el("span", { class: "pill warn" }, "Yours, waiting for someone"),
           el("button", { class: "link", onclick: () => withdraw(b.swapId) }, icon("undo", { size: 14 }), "Take it back")]
        : el("button", { onclick: () => claim(b.swapId), disabled: blocked || null },
            icon(blocked ? "blocked" : "check"), blocked ? "Can't claim" : "Claim shift"))),
    b.mine ? null
      : blocked ? el("p", { class: "note" }, icon("blocked", { size: 14 }), el("span", {}, b.result.blocking[0].message))
      : warned ? el("p", { class: "hint" }, b.result.warnings[0].message)
      : el("p", { class: "hint" }, "You're available and qualified. The manager approves it after you claim."));
}

const claim = (swapId) => act("/api/claim", { swapId },
  "Claimed. It's with the manager now, and the shift stays with whoever posted it until they decide.");
const withdraw = (swapId) => act("/api/withdraw-swap", { swapId }, "Taken off the swap board. It's still yours.");
