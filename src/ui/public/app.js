// ShiftChex client. just UI, all the rule checks happen on the server

let S = null;              // last state from the server
let users = [];            // who can sign in, also from the server
let who = remembered();    // signed in user id
let tab = null;

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== false) n.setAttribute(k, v);
  }
  kids.flat().forEach((c) => n.append(c?.nodeType ? c : document.createTextNode(c ?? "")));
  return n;
};
const money = (n) => "$" + n.toLocaleString();
const dayLabel = (d) => new Date(d + "T12:00:00")
  .toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
const time = (t) => {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am", hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, "0")}${ap}` : `${hr}${ap}`;
};
const roleName = (id) => (S.roles.find((r) => r.id === id) || {}).name || id;
const empName = (id) => (S.employees.find((e) => e.id === id) || {}).name || "";
// display order mon..sun, values are js weekdays (0 = sun) like the server uses
const WEEK = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];
const isManager = () => S.user.role === "manager";

// picking a name is the whole sign in (no passwords in the prototype). keep it across reloads
function remembered() {
  try { return localStorage.getItem("shiftchex.user"); } catch { return null; }
}
function remember() {
  try { localStorage.setItem("shiftchex.user", who); } catch { /* private window, fine */ }
}

function toast(msg, bad) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (bad ? " bad" : "");
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 5200);
}

// every call says who's signed in, the server works out what they're allowed to do
async function post(path, body) {
  const res = await fetch(path, {
    method: "POST", headers: { "Content-Type": "application/json", "X-User-Id": who },
    body: JSON.stringify(body || {}),
  });
  return { ok: res.ok, data: await res.json() };
}

async function load() {
  if (!users.length) users = await (await fetch("/api/users")).json();
  if (!users.some((u) => u.id === who)) who = users[0].id;
  S = await (await fetch("/api/state", { headers: { "X-User-Id": who } })).json();
  if (!tabs().some(([id]) => id === tab)) tab = tabs()[0][0];
  render();
}

function tabs() {
  const waiting = isManager()
    ? S.pendingSwaps.length + S.timeOff.filter((t) => t.status === "pending").length : 0;
  return isManager()
    ? [["schedule", "Schedule"], ["approvals", waiting ? `Approvals (${waiting})` : "Approvals"], ["people", "People"]]
    : [["me", "My schedule"], ["availability", "Availability"], ["timeoff", "Time off"], ["board", "Swap board"]];
}

// chrome
function renderChrome() {
  const sel = $("#whoami");
  if (sel.dataset.built !== "yes") {
    users.forEach((u) => sel.append(el("option", { value: u.id },
      `${u.name} (${u.role === "manager" ? "Manager" : "Employee"})`)));
    sel.dataset.built = "yes";
    sel.addEventListener("change", () => {
      who = sel.value;
      remember();
      tab = null;
      load();
    });
    $("#reset").addEventListener("click", async () => {
      await post("/api/reset");
      toast("Demo data restored.");
      load();
    });
  }
  sel.value = who;

  const nav = $("#nav");
  nav.textContent = "";
  tabs().forEach(([id, label]) => nav.append(el("button", {
    class: tab === id ? "on" : "", onclick: () => { tab = id; render(); },
  }, label)));
}

// manager: schedule
function blocksFrom(shifts) {
  const map = new Map();
  shifts.forEach((s) => {
    const key = `${s.roleId}|${s.startTime}|${s.endTime}`;
    if (!map.has(key)) map.set(key, { roleId: s.roleId, startTime: s.startTime,
                                      endTime: s.endTime, byDate: new Map() });
    const b = map.get(key);
    if (!b.byDate.has(s.date)) b.byDate.set(s.date, []);
    b.byDate.get(s.date).push(s);
  });
  return [...map.values()];
}

function scheduleView() {
  const days = [...new Set(S.shifts.map((s) => s.date))].sort();
  const blocks = blocksFrom(S.shifts);
  const bad = new Map();
  S.result.violations.forEach((v) => {
    if (!v.shiftId) return;
    const cur = bad.get(v.shiftId);
    if (!cur || (v.severity === "blocking" && cur.severity !== "blocking")) bad.set(v.shiftId, v);
  });
  const draft = S.period.status === "draft";
  const over = S.projectedCost > S.period.budget;

  const head = el("div", { class: "subbar" },
    el("h1", {}, `Week of ${dayLabel(S.period.startDate)}`),
    el("span", { class: "tag " + S.period.status }, S.period.status),
    el("span", { class: "muted" }, `${S.organization.name} · today is ${S.today}`),
    el("div", { class: "meter" },
      el("div", { class: "row" },
        el("span", {}, "Projected labour"),
        el("span", {}, `budget ${money(S.period.budget)}`)),
      el("div", { class: "row" }, el("b", {}, money(S.projectedCost)), el("span", {}, "")),
      el("div", { class: "track" },
        el("span", { class: over ? "over" : "",
          style: `width:${Math.min(100, (S.projectedCost / S.period.budget) * 100)}%` }))),
    el("div", { class: "actions" },
      draft
        ? el("button", { onclick: publish, disabled: S.result.blocking.length > 0 || null },
            S.result.blocking.length ? `Publish (${S.result.blocking.length} blocking)` : "Publish")
        : el("button", { class: "ghost", onclick: async () => {
            await post("/api/unpublish"); toast("Back to draft."); load();
          } }, "Unpublish")));

  const table = el("table", {},
    el("thead", {}, el("tr", {},
      el("th", { class: "block" }, "Shift block"),
      days.map((d) => el("th", {}, dayLabel(d))))),
    el("tbody", {}, blocks.map((b) => el("tr", {},
      el("td", { class: "block" },
        el("b", {}, roleName(b.roleId)),
        el("small", {}, `${time(b.startTime)} - ${time(b.endTime)}`),
        el("small", { class: "muted" }, `needs ${Math.max(...[...b.byDate.values()].map((l) => l.length))}`)),
      days.map((d) => el("td", { class: "cell" + (b.byDate.has(d) ? "" : " off") },
        (b.byDate.get(d) || []).map((s) => slotSelect(s, bad.get(s.id))),
        (b.byDate.get(d) || [])[0]?.duties.map((x) => el("small", { class: "duty" }, S.duties[x]))))))));

  const panel = el("aside", { class: "panel" },
    el("h2", {}, "Rule check",
      el("span", { class: "count " + (S.result.blocking.length ? "bad" : "ok") },
        S.result.violations.length ? `${S.result.blocking.length} blocking, ${S.result.warnings.length} warning`
                                   : "all clear")),
    el("div", { class: "body" },
      S.result.violations.length
        ? S.result.violations.map((v) => el("div", { class: "v " + v.severity },
            el("div", { class: "rid" }, `${v.ruleId} · ${v.severity === "blocking" ? "blocks publishing" : "warning"}`),
            el("p", {}, v.message)))
        : el("p", { class: "muted" }, "Nothing to report. This schedule can be published.")));

  return [head, el("div", { class: "layout" }, el("div", { class: "grid" }, table), panel)];
}

function slotSelect(shift, violation) {
  const eligible = S.employees.filter((e) => e.qualifications.some((q) => q.roleId === shift.roleId));
  const cls = "slot" + (violation ? (violation.severity === "blocking" ? " bad" : " warn")
                                  : (shift.employeeId ? "" : " empty"));
  const sel = el("select", {
    onchange: async (ev) => {
      const val = ev.target.value || null;
      const r = await post("/api/assign", { shiftId: shift.id, employeeId: val });
      if (r.data.error) toast(r.data.error, true);
      load();
    },
  }, el("option", { value: "" }, "(nobody)"),
     eligible.map((e) => el("option", { value: e.id, selected: e.id === shift.employeeId || null },
       e.name + (e.isMinor ? " (17)" : ""))));
  return el("div", { class: cls, title: violation ? violation.message : "" }, sel);
}

async function publish() {
  const r = await post("/api/publish");
  toast(r.data.error || "Published. Everyone on the schedule has a notice.", !!r.data.error);
  load();
}

// manager: approvals
function approvalsView() {
  const swaps = S.pendingSwaps || [];
  const timeOff = S.timeOff.filter((t) => t.status === "pending");
  const kids = [el("div", { class: "section-title" }, `Swap requests (${swaps.length})`)];

  kids.push(el("div", { class: "cards" }, swaps.length ? swaps.map((p) => {
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
        : el("p", { class: "muted" }, "Rules re-run at approval, because the schedule may have moved since the claim."));
  }) : el("p", { class: "muted" }, "Nothing waiting.")));

  kids.push(el("div", { class: "section-title" }, `Time off (${timeOff.length})`));
  kids.push(el("div", { class: "cards" }, timeOff.length ? timeOff.map((t) =>
    el("div", { class: "card" }, el("div", { class: "row" },
      el("div", { class: "grow" },
        el("h3", {}, t.employeeName),
        el("div", { class: "muted" }, `${t.startDate} to ${t.endDate} · ${t.reason || "no reason given"}`)),
      el("button", { onclick: () => decideTimeOff(t.id, "approve") }, "Approve"),
      el("button", { class: "quiet", onclick: () => decideTimeOff(t.id, "deny") }, "Deny"))))
    : el("p", { class: "muted" }, "Nothing waiting.")));
  return kids;
}

async function decideSwap(swapId, decision) {
  const r = await post("/api/decide-swap", { swapId, decision });
  toast(r.data.error || (decision === "approve" ? "Approved. The shift has been reassigned." : "Denied."),
        !!r.data.error);
  load();
}
async function decideTimeOff(requestId, decision) {
  const r = await post("/api/decide-timeoff", { requestId, decision });
  toast(r.data.error || `Time off ${decision === "approve" ? "approved" : "denied"}.`, !!r.data.error);
  load();
}

// manager: people
function certChips(e) {
  return el("div", { class: "chips" }, e.certs.map((c) => {
    const extra = c.onlyIf ? ` (if ${S.duties[c.onlyIf]})` : "";
    let cls, text;
    if (c.expiredOn) { cls = "fail"; text = `expired ${c.expiredOn}`; }
    else if (c.missing && c.ok) { cls = "warn"; text = `new hire, due ${c.graceEnds}`; }
    else if (c.missing) { cls = c.onlyIf ? "none" : "fail"; text = "missing"; }
    else if (c.expiresOn <= S.period.endDate) { cls = "warn"; text = `expires ${c.expiresOn}`; }
    else { cls = "pass"; text = `good to ${c.expiresOn}`; }
    return el("span", { class: "chip " + cls }, el("b", {}, c.name + extra), text);
  }));
}

function peopleView() {
  return [el("div", { class: "section-title" }, "People"),
    el("div", { class: "cards" }, S.employees.map((e) =>
      el("div", { class: "card" },
        el("h3", {}, e.name + (e.isMinor ? "  ·  under 18" : "")),
        el("div", { class: "muted" }, `Hired ${e.hireDate}  ·  ` + e.qualifications.map((q) =>
          `${roleName(q.roleId)} at $${q.hourlyRate}`).join("  ·  ")),
        el("div", { class: "muted" }, `Available ${availabilityText(e.availability)}`),
        certChips(e))))];
}

// employee views
function myScheduleView() {
  const mine = S.shifts.filter((s) => s.employeeId === S.employeeId).sort((a, b) =>
    (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const total = mine.reduce((t, s) => t + s.hours, 0);
  const published = S.period.status === "published";
  const swapFor = (id) => (S.mySwaps || []).find((s) => s.shiftId === id && s.status !== "denied");

  return [
    el("div", { class: "subbar" },
      el("h1", {}, empName(S.employeeId)),
      el("span", { class: "tag " + S.period.status }, S.period.status),
      el("span", { class: "muted" }, `Week of ${dayLabel(S.period.startDate)} · ${total} hours`)),
    S.notices.length ? el("div", { class: "section-title" }, "Notices") : null,
    S.notices.length ? el("div", { class: "cards" }, [...S.notices].reverse().map((n) =>
      el("div", { class: "card notice" }, n.text))) : null,
    el("div", { class: "section-title" }, "My shifts"),
    el("div", { class: "cards" }, mine.length ? mine.map((s) => {
      const sw = swapFor(s.id);
      return el("div", { class: "card" }, el("div", { class: "row" },
        el("div", { class: "grow" },
          el("h3", {}, `${roleName(s.roleId)} · ${dayLabel(s.date)}`),
          el("div", { class: "muted" }, `${time(s.startTime)} - ${time(s.endTime)} · ${s.hours} hours`)),
        sw
          ? el("span", { class: "pill warn" },
              sw.status === "posted" ? "Posted for swap" : `Claim ${sw.status}`)
          : el("button", { class: "ghost", disabled: !published || null,
              onclick: () => postSwap(s.id) },
              published ? "Post for swap" : "Not published yet")));
    }) : el("p", { class: "muted" }, "No shifts this week.")),
    el("div", { class: "section-title" }, "My certifications"),
    el("div", { class: "cards" }, el("div", { class: "card" },
      certChips(S.employees.find((e) => e.id === S.employeeId)))),
  ];
}

// "every day 6am - 11:59pm", or day by day when they differ
function availabilityText(a) {
  if (!a.slots.length) return "never";
  const label = (x) => `${time(x.startTime)} - ${time(x.endTime)}`;
  const byDay = new Map(a.slots.map((x) => [x.weekday, label(x)]));
  const labels = [...new Set(byDay.values())];
  if (byDay.size === 7 && labels.length === 1) return `every day ${labels[0]}`;
  return WEEK.filter(([d]) => byDay.has(d)).map(([d, name]) => `${name} ${byDay.get(d)}`).join(", ");
}

// UC-01
function availabilityView() {
  const now = S.employees.find((e) => e.id === S.employeeId).availability;
  const latest = S.myAvailability;
  const byDay = new Map(latest.slots.map((a) => [a.weekday, a]));
  const rows = WEEK.map(([weekday, name]) => {
    const cur = byDay.get(weekday);
    const on = el("input", { type: "checkbox", checked: !!cur || null });
    const from = el("input", { type: "time", value: cur ? cur.startTime : "09:00" });
    const to = el("input", { type: "time", value: cur ? cur.endTime : "17:00" });
    const sync = () => { from.disabled = to.disabled = !on.checked; };
    on.addEventListener("change", sync);
    sync();
    return { weekday, on, from, to, row: el("tr", {},
      el("td", {}, el("label", { class: "check" }, on, name)),
      el("td", {}, from), el("td", {}, to)) };
  });
  const starting = el("input", { type: "date", min: S.today,
    value: latest.effectiveFrom > S.today ? latest.effectiveFrom : S.today });

  const save = async () => {
    const slots = rows.filter((r) => r.on.checked)
      .map((r) => ({ weekday: r.weekday, startTime: r.from.value, endTime: r.to.value }));
    const r = await post("/api/availability", { effectiveFrom: starting.value, slots });
    toast(r.data.error || "Saved. The schedule is checked against this from now on.", !!r.data.error);
    if (!r.data.error) load();
  };

  return [
    el("div", { class: "subbar" },
      el("h1", {}, "My availability"),
      el("span", { class: "muted" }, `Week of ${dayLabel(S.period.startDate)}: ${availabilityText(now)}`)),
    el("div", { class: "cards" }, el("div", { class: "card form" },
      el("p", { class: "muted" }, "Tick the days you can work and the hours you can do. " +
        "Days left unticked count as not available. The manager can't schedule you outside this."),
      el("table", { class: "avail" },
        el("thead", {}, el("tr", {}, el("th", {}, "Day"), el("th", {}, "From"), el("th", {}, "To"))),
        el("tbody", {}, rows.map((r) => r.row))),
      el("div", { class: "row" },
        el("label", { class: "field" }, "Starting", starting),
        el("button", { onclick: save }, "Save availability")),
      latest.effectiveFrom > S.today
        ? el("p", { class: "muted" }, `What you last sent starts ${latest.effectiveFrom}.`) : null)),
  ];
}

// UC-02
function timeOffView() {
  const from = el("input", { type: "date", min: S.today, value: S.today });
  const to = el("input", { type: "date", min: S.today, value: S.today });
  const reason = el("input", { type: "text", placeholder: "Optional", maxlength: "120" });
  from.addEventListener("change", () => { if (to.value < from.value) to.value = from.value; });

  const submit = async () => {
    const r = await post("/api/time-off", { startDate: from.value, endDate: to.value, reason: reason.value });
    toast(r.data.error || "Sent. It shows up in the manager's approvals.", !!r.data.error);
    if (!r.data.error) load();
  };

  const PILL = { pending: "warn", approved: "pass", denied: "fail" };
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

function boardView() {
  const board = S.board || [];
  return [
    el("div", { class: "section-title" }, `Swap board, ${board.length} posted`),
    el("div", { class: "cards" }, board.length ? board.map((b) => {
      const blocked = !b.mine && b.result && b.result.blocking.length > 0;
      return el("div", { class: "card" + (blocked ? " blocked" : "") },
        el("div", { class: "row" },
          el("div", { class: "grow" },
            el("h3", {}, `${roleName(b.roleId)} · ${dayLabel(b.date)}`),
            el("div", { class: "muted" },
              `${time(b.startTime)} - ${time(b.endTime)} · ${b.hours} hours`)),
          b.mine
            ? el("span", { class: "pill warn" }, "Yours, waiting for someone")
            : el("button", { onclick: () => claim(b.swapId), disabled: blocked || null },
                blocked ? "Cannot claim" : "Claim shift")),
        b.mine ? null
          : blocked ? el("p", { class: "note" }, b.result.blocking[0].message)
          : b.result.warnings.length ? el("p", { class: "muted" }, b.result.warnings[0].message)
          : el("p", { class: "muted" }, "You are available and qualified. A manager approves it after you claim."));
    }) : el("p", { class: "muted" }, "Nothing posted. Post one of your own shifts from My schedule.")),
    el("p", { class: "muted pad" },
      "Shifts you cannot take are shown with the reason rather than hidden, so the rule is visible."),
  ];
}

async function postSwap(shiftId) {
  const r = await post("/api/post-swap", { shiftId, employeeId: S.employeeId });
  toast(r.data.error || "Posted. Anyone qualified can claim it.", !!r.data.error);
  load();
}
async function claim(swapId) {
  const r = await post("/api/claim", { swapId, employeeId: S.employeeId });
  toast(r.data.error || "Claimed. It is with a manager now, and the shift stays with whoever posted it until they decide.",
        !!r.data.error);
  load();
}

// render
function render() {
  renderChrome();
  const v = $("#view");
  v.textContent = "";
  const views = { schedule: scheduleView, approvals: approvalsView, people: peopleView,
                  me: myScheduleView, availability: availabilityView, timeoff: timeOffView,
                  board: boardView };
  (views[tab] || scheduleView)().filter(Boolean).forEach((n) => v.append(n));
}

load();
