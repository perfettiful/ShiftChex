// employee: the swap board (UC-05). shifts you can't take still show up with the reason
import { app, roleName } from "../state.js";
import { el } from "../dom.js";
import { dayLabel, time } from "../format.js";
import { act } from "../api.js";

export function boardView() {
  const board = app.S.board || [];
  return [
    el("div", { class: "section-title" }, `Swap board, ${board.length} posted`),
    el("div", { class: "cards" }, board.length ? board.map(card)
      : el("p", { class: "muted" }, "Nothing posted. Post one of your own shifts from My schedule.")),
    el("p", { class: "muted pad" },
      "Shifts you can't take still show up here with the reason, so you can see which rule is stopping you."),
  ];
}

function card(b) {
  const blocked = !b.mine && b.result && b.result.blocking.length > 0;
  return el("div", { class: "card" + (blocked ? " blocked" : "") },
    el("div", { class: "row" },
      el("div", { class: "grow" },
        el("h3", {}, `${roleName(b.roleId)} · ${dayLabel(b.date)}`),
        el("div", { class: "muted" }, `${time(b.startTime)} - ${time(b.endTime)} · ${b.hours} hours`)),
      b.mine
        ? el("span", { class: "pill warn" }, "Yours, waiting for someone")
        : el("button", { onclick: () => claim(b.swapId), disabled: blocked || null },
            blocked ? "Cannot claim" : "Claim shift")),
    b.mine ? null
      : blocked ? el("p", { class: "note" }, b.result.blocking[0].message)
      : b.result.warnings.length ? el("p", { class: "muted" }, b.result.warnings[0].message)
      : el("p", { class: "muted" }, "You're available and qualified. A manager approves it after you claim."));
}

const claim = (swapId) => act("/api/claim", { swapId },
  "Claimed. It's with the manager now. The shift stays with whoever posted it until they decide.");
