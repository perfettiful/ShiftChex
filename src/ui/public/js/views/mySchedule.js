// employee: notices, their shifts on every published week, their swaps and certs (UC-03, UC-04)
import { app, roleName, me } from "../state.js";
import { el, ask } from "../dom.js";
import { icon } from "../icons.js";
import { dayLabel, shortDate, longDate, time, weekOf, hours, plural } from "../format.js";
import { act } from "../api.js";
import { pageHead, section } from "../layout.js";
import { certChips } from "./people.js";

const SWAP = { posted: ["warn", "Waiting for someone"], claimed: ["info", "Claimed, with the manager"],
               approved: ["pass", "Approved"], denied: ["fail", "Turned down"],
               withdrawn: ["", "Taken back"], cancelled: ["", "Cancelled, week went back to draft"] };

export function myScheduleView() {
  const { S } = app;
  // every published week that isn't over, then the next one that isn't out yet
  const upcoming = S.periods.filter((p) => p.endDate >= S.today);
  const weeks = [...upcoming.filter((p) => p.status === "published"),
                 upcoming.find((p) => p.status !== "published")].filter(Boolean);
  const total = S.myShifts.reduce((t, s) => t + s.hours, 0);

  return [
    pageHead({ title: me().name, meta: `Today is ${longDate(S.today)} · ${hours(total)} coming up` }),

    S.notices.length ? section("Notices", S.notices.length, el("div", { class: "list" }, S.notices.map((n) =>
      el("div", { class: "card notice" }, el("div", { class: "row" },
        el("div", { class: "grow lead-icon" }, icon("bell"),
          el("div", {}, el("div", {}, n.text),
            n.createdOn ? el("div", { class: "muted small" }, shortDate(n.createdOn)) : null)),
        el("button", { class: "link", onclick: () => act("/api/dismiss-notice", { noticeId: n.id }, null) },
          icon("x", { size: 14 }), "Dismiss")))))) : null,

    weeks.map((w) => weekSection(w, S.myShifts.filter((s) => s.periodId === w.id))),

    S.mySwaps.length ? section("My swaps", null, el("div", { class: "list" }, S.mySwaps.map(swapRow))) : null,

    section("My certifications", null, el("div", { class: "card" }, certChips(me(), weeks[0]?.endDate || S.today))),
  ];
}

function weekSection(week, shifts) {
  if (week.status !== "published") {
    return section(weekOf(week.startDate), "not out yet", el("div", { class: "card empty" }, icon("clock"),
      "The manager is still working on this one. You'll get a notice when it's published."));
  }
  return section(weekOf(week.startDate), `${plural(shifts.length, "shift")} · ${hours(shifts.reduce((t, s) => t + s.hours, 0))}`,
    el("div", { class: "list" }, shifts.length ? shifts.map(shiftCard)
      : el("div", { class: "card empty" }, icon("calendar"), "You're not on this week.")));
}

function shiftCard(s) {
  let action;
  if (s.swapStatus === "posted") {
    action = el("div", { class: "actions" }, el("span", { class: "pill warn" }, icon("swap", { size: 12 }), "On the swap board"),
      el("button", { class: "link", onclick: () => withdraw(s) }, icon("undo", { size: 14 }), "Take it back"));
  } else if (s.swapStatus === "claimed") {
    action = el("span", { class: "pill info" }, icon("swap", { size: 12 }), "Claimed, with the manager");
  } else {
    action = el("div", { class: "actions" },
      el("button", { class: "ghost sm", onclick: () => postForSwap(s) }, icon("swap", { size: 14 }), "Post for swap"));
  }
  return el("div", { class: "card" }, el("div", { class: "row" },
    el("div", { class: "grow" },
      el("h3", {}, `${dayLabel(s.date)} · ${roleName(s.roleId)}`),
      el("div", { class: "muted small" }, `${time(s.startTime)} - ${time(s.endTime)} · ${hours(s.hours)}`)),
    action));
}

function swapRow(sw) {
  const [tone, label] = SWAP[sw.status];
  const what = `${dayLabel(sw.date)} ${roleName(sw.roleId)} ${time(sw.startTime)}`;
  const text = sw.postedIt
    ? `You posted ${what}` + (sw.otherName ? `, ${sw.otherName} claimed it` : "")
    : `You claimed ${sw.otherName}'s ${what}`;
  return el("div", { class: "card" }, el("div", { class: "row" },
    el("div", { class: "grow lead-icon" }, icon("swap"),
      el("div", {}, el("div", {}, text),
        el("div", { class: "muted small" }, sw.decidedOn ? `Decided ${shortDate(sw.decidedOn)}` : `Posted ${shortDate(sw.postedOn)}`))),
    el("span", { class: "pill " + tone }, label)));
}

async function postForSwap(s) {
  const ok = await ask({
    title: "Post this shift for swap?",
    glyph: "swap",
    body: [`${dayLabel(s.date)} ${roleName(s.roleId)}, ${time(s.startTime)} - ${time(s.endTime)}.`,
      "It stays yours until someone qualified claims it and the manager approves. You can take it back before anyone claims it."],
    confirm: "Post it",
  });
  if (ok) act("/api/post-swap", { shiftId: s.id }, "Posted. Anyone qualified can claim it now.");
}

const withdraw = (s) => act("/api/withdraw-swap", { swapId: s.swapId }, "Taken off the swap board. It's still yours.");
