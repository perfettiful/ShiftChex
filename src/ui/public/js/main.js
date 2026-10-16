// ShiftChex client. it's just the screens, all the rule checks happen on the server.
// this file loads the data, draws the nav and picks which view to show
import { app, setLoader, isManager } from "./state.js";
import { $, el, toast } from "./dom.js";
import { getUsers, getState, post, remembered, remember } from "./api.js";
import { scheduleView } from "./views/schedule.js";
import { approvalsView } from "./views/approvals.js";
import { peopleView } from "./views/people.js";
import { myScheduleView } from "./views/mySchedule.js";
import { availabilityView } from "./views/availability.js";
import { timeOffView } from "./views/timeOff.js";
import { boardView } from "./views/board.js";

const VIEWS = {
  schedule: scheduleView, approvals: approvalsView, people: peopleView,
  me: myScheduleView, availability: availabilityView, timeoff: timeOffView, board: boardView,
};

function tabs() {
  const { S } = app;
  if (!isManager()) {
    return [["me", "My schedule"], ["availability", "Availability"], ["timeoff", "Time off"], ["board", "Swap board"]];
  }
  const waiting = S.pendingSwaps.length + S.timeOff.filter((t) => t.status === "pending").length;
  return [["schedule", "Schedule"], ["approvals", waiting ? `Approvals (${waiting})` : "Approvals"], ["people", "People"]];
}

async function load() {
  if (!app.users.length) app.users = await getUsers();
  if (!app.users.some((u) => u.id === app.who)) app.who = app.users[0].id;
  app.S = await getState();
  if (!tabs().some(([id]) => id === app.tab)) app.tab = tabs()[0][0];
  render();
}

// the sign in picker and reset button only get wired up once
function setupHeader() {
  const sel = $("#whoami");
  app.users.forEach((u) => sel.append(el("option", { value: u.id },
    `${u.name} (${u.role === "manager" ? "Manager" : "Employee"})`)));
  sel.addEventListener("change", () => {
    app.who = sel.value;
    remember();
    app.tab = null;
    load();
  });
  // after a reset, go back to the manager's schedule
  $("#reset").addEventListener("click", async () => {
    const r = await post("/api/reset");
    if (r.data.error) return toast(r.data.error, true);
    const { shifts, empty } = r.data.check;
    app.who = app.users.find((u) => u.role === "manager").id;
    remember();
    app.tab = "schedule";
    await load();
    toast(`Demo data reset. Back to the draft week, ${shifts} shifts with ${empty} empty.`);
  });
}

function render() {
  $("#whoami").value = app.who;
  const nav = $("#nav");
  nav.textContent = "";
  tabs().forEach(([id, label]) => nav.append(el("button", {
    class: app.tab === id ? "on" : "", onclick: () => { app.tab = id; render(); },
  }, label)));

  const view = $("#view");
  view.textContent = "";
  VIEWS[app.tab]().filter(Boolean).forEach((n) => view.append(n));
}

setLoader(load);
app.who = remembered();
await load();
setupHeader();
render();
