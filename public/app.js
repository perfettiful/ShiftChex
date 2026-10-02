// ShiftChex client. just UI, all the rule checks happen on the server

let S = null;              // last state from the server
let who = "manager";       // "manager" or an employee id
let tab = "schedule";

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
const DUTIES = { carriesDrinks: "carries drinks", checksIds: "checks IDs" };

function toast(msg, bad) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (bad ? " bad" : "");
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 5200);
}

async function post(path, body) {
  const res = await fetch(path, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return { ok: res.ok, data: await res.json() };
}

async function load() {
  const role = who === "manager" ? "manager" : "employee";
  const q = `role=${role}&employeeId=${who === "manager" ? "" : who}`;
  S = await (await fetch("/api/state?" + q)).json();
  render();
}

// chrome
function renderChrome() {
  const sel = $("#whoami");
  if (sel.dataset.built !== "yes") {
    sel.append(el("option", { value: "manager" }, "R. Chen (Manager)"));
    S.employees.forEach((e) =>
      sel.append(el("option", { value: e.id }, `${e.name} (Employee)`)));
    sel.dataset.built = "yes";
    sel.addEventListener("change", () => {
      who = sel.value;
      tab = who === "manager" ? "schedule" : "me";
      load();
    });
    $("#reset").addEventListener("click", async () => {
      await post("/api/reset");
      toast("Demo data restored.");
      load();
    });
  }
  sel.value = who;

  const tabs = who === "manager"
    ? [["schedule", "Schedule"], ["approvals", "Approvals"], ["people", "People"]]
    : [["me", "My schedule"], ["board", "Swap board"]];
  const nav = $("#nav");
  nav.textContent = "";
  tabs.forEach(([id, label]) => nav.append(el("button", {
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
        (b.byDate.get(d) || [])[0]?.duties.map((x) => el("small", { class: "duty" }, DUTIES[x]))))))));

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
        el("div", { class: "muted" }, `${t.startDate} to ${t.endDate} · ${t.reason}`)),
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
    const extra = c.onlyIf ? ` (if ${DUTIES[c.onlyIf]})` : "";
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
                  me: myScheduleView, board: boardView };
  (views[tab] || scheduleView)().filter(Boolean).forEach((n) => v.append(n));
}

load();
