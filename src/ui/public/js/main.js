// ShiftChex client. it's just the screens, all the rule checks happen on the server.
// this file loads the data, draws the nav and picks which view to show
import { app, setLoader, isManager } from "./state.js";
import { $, el, toast } from "./dom.js";
import { icon } from "./icons.js";
import { getDemoAccounts, getMe, getState, getReport, post, logout } from "./api.js";
import { scheduleView } from "./views/schedule.js";
import { approvalsView } from "./views/approvals.js";
import { reportView } from "./views/report.js";
import { peopleView } from "./views/people.js";
import { myScheduleView } from "./views/mySchedule.js";
import { availabilityView } from "./views/availability.js";
import { timeOffView } from "./views/timeOff.js";
import { boardView } from "./views/board.js";
import { loginView } from "./views/login.js";

// [view, page width]. the grid needs room, single column screens read better narrow
const VIEWS = {
  schedule: [scheduleView, "wide"], approvals: [approvalsView, "narrow"], report: [reportView, ""],
  people: [peopleView, ""], me: [myScheduleView, "narrow"], availability: [availabilityView, "narrow"],
  timeoff: [timeOffView, "narrow"], board: [boardView, "narrow"],
};

// each screen's address. the server sends app.html for these (APP_PATHS in server.js)
const PATHS = {
  schedule: "/schedule", approvals: "/approvals", report: "/report", people: "/people",
  me: "/my-schedule", availability: "/availability", timeoff: "/time-off", board: "/swap-board",
};
// the screens with a week picker keep the week in the address, like /report?week=2026-10-12
const WEEKLY = new Set(["schedule", "report", "people"]);

const tabAt = (pathname) => Object.keys(PATHS).find((t) => PATHS[t] === pathname.replace(/\/$/, "")) || null;

function urlFor(tab) {
  const week = WEEKLY.has(tab) && app.S?.period ? `?week=${app.S.period.startDate}` : "";
  return PATHS[tab] + week;
}

// read the screen and week out of the address bar
function fromLocation() {
  app.tab = tabAt(location.pathname);
  app.week = new URLSearchParams(location.search).get("week");
}

// [id, label, icon, how many things are waiting there]
function tabs() {
  const { S } = app;
  if (!isManager()) {
    const claimable = S.board.filter((b) => !b.mine && !b.result.blocking.length).length;
    return [["me", "My schedule", "calendar"], ["availability", "Availability", "clock"],
            ["timeoff", "Time off", "sun"], ["board", "Swap board", "swap", claimable]];
  }
  const waiting = S.pendingSwaps.length + S.timeOff.filter((t) => t.status === "pending").length;
  return [["schedule", "Schedule", "calendar"], ["approvals", "Approvals", "inbox", waiting],
          ["report", "Report", "chart"], ["people", "People", "users"]];
}

async function load() {
  const manager = app.user?.role === "manager";
  app.S = await getState(manager ? app.periodId : null);
  if (!app.S) return showLogin();  // session's gone, so sign in again
  if (manager) {
    // a ?week= picks the week by its start date
    const asked = app.week && app.S.periods.find((p) => p.startDate === app.week);
    app.week = null;
    if (asked && asked.id !== app.S.period.id) {
      app.periodId = asked.id;
      return load();
    }
    app.periodId = app.S.period.id;
  }
  if (!tabs().some(([id]) => id === app.tab)) app.tab = tabs()[0][0];
  app.R = app.tab === "report" ? await getReport(app.periodId) : null;
  render();
}

async function showLogin() {
  app.user = app.S = app.R = app.periodId = null;
  // come back to the screen they were after once they're signed in
  if (location.pathname !== "/login") {
    const next = tabAt(location.pathname) ? `?next=${encodeURIComponent(location.pathname + location.search)}` : "";
    history.replaceState(null, "", `/login${next}`);
  }
  $("#who").hidden = true;
  $("#nav").textContent = "";
  document.title = "Sign in · ShiftChex";
  const view = $("#view");
  view.className = "container";
  view.textContent = "";
  loginView(await getDemoAccounts(), signedIn).forEach((n) => view.append(n));
}

async function signedIn(user) {
  app.user = user;
  app.periodId = null;
  const asked = new URLSearchParams(location.search).get("next") || location.pathname + location.search;
  const next = new URL(asked, location.origin);
  app.tab = tabAt(next.pathname);
  app.week = next.searchParams.get("week");
  const signedin = $("#signedin");
  signedin.textContent = "";
  signedin.append(icon("user"), el("span", { class: "name" }, user.name),
    user.role === "manager" ? "Manager" : "Employee");
  $("#who").hidden = false;
  // wiping the demo data is the manager's call
  $("#reset").hidden = user.role !== "manager";
  await load();
}

// header buttons only get wired up once
function setupHeader() {
  // the label hides on a phone, the icon stays
  $("#reset").prepend(icon("reset"));
  $("#signout").prepend(icon("logOut"));
  $("#signout").addEventListener("click", async () => {
    await logout();
    history.pushState(null, "", "/login");
    showLogin();
  });
  // a reset keeps you signed in and puts the demo weeks back
  $("#reset").addEventListener("click", async () => {
    const r = await post("/api/reset");
    if (r.data.error) return toast(r.data.error, true);
    const { empty } = r.data.check;
    app.periodId = null;
    await load();
    toast(`Demo data reset. This week is published, next week is back in draft with ${empty} empty shifts.`);
  });
}

function render() {
  // keep the address bar on the screen and week being shown
  const url = urlFor(app.tab);
  if (location.pathname + location.search !== url) history.replaceState(null, "", url);

  const nav = $("#nav");
  nav.textContent = "";
  tabs().forEach(([id, label, glyph, count]) => nav.append(el("a", {
    href: urlFor(id), class: app.tab === id ? "on" : "", "aria-current": app.tab === id ? "page" : null,
    onclick: (e) => {
      // a plain click stays in the page. ctrl or cmd click still opens a new tab
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      history.pushState(null, "", urlFor(id));
      app.tab = id;
      load();
    },
  }, icon(glyph), label, count ? el("span", { class: "badge" }, count) : null)));

  const [view, width] = VIEWS[app.tab];
  const main = $("#view");
  main.className = `container ${width}`.trim();
  main.textContent = "";
  // views return a list of nodes, sometimes with lists inside it
  view().flat(2).filter(Boolean).forEach((n) => main.append(n));
  document.title = `${tabs().find(([id]) => id === app.tab)[1]} · ShiftChex`;
}

// back and forward buttons
window.addEventListener("popstate", () => {
  fromLocation();
  if (!app.user) return showLogin();
  if (location.pathname === "/login") app.tab = null;
  load();
});

setLoader(load);
setupHeader();
fromLocation();
const me = await getMe();
if (me) await signedIn(me);
else await showLogin();
