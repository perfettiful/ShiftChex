// ShiftChex prototype server (plain node, no deps)
// run: node server.js -> http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const { buildApp } = require("./src/application/wiring");

const { repo, engine, schedule, swaps } = buildApp();

// view
const serialiseResult = (r) => r && ({
  violations: r.violations, blocking: r.blocking, warnings: r.warnings,
  ok: r.blocking.length === 0,
});

// every cert a person needs for any role they're trained in, plus any extra they hold
function certChecklist(e, date) {
  const rolesById = repo.rolesById();
  const needed = new Map();
  e.qualifications.forEach((q) => (rolesById.get(q.roleId)?.certs || []).forEach((c) => {
    if (!needed.has(c.certTypeId) || !c.onlyIf) needed.set(c.certTypeId, c.onlyIf);
  }));
  return repo.certTypes()
    .filter((t) => needed.has(t.id) || e.certs.some((c) => c.certTypeId === t.id))
    .map((t) => ({ certTypeId: t.id, name: t.name, onlyIf: needed.get(t.id) || null,
                   ...e.certStatus(t, date) }));
}

function buildState(role, employeeId) {
  const period = repo.currentPeriod();
  const result = schedule.validate();
  const byId = repo.employeesById();
  const state = {
    organization: repo.organization,
    today: repo.today(),
    settings: repo.settings,
    role, employeeId,
    roles: repo.roles(),
    employees: repo.employees().map((e) => ({
      id: e.id, name: e.name, isMinor: e.isMinorOn(period.startDate),
      hireDate: e.hireDate, qualifications: e.qualifications,
      certs: certChecklist(e, period.startDate),
    })),
    period: {
      id: period.id, startDate: period.startDate, endDate: period.endDate,
      status: period.status, budget: period.budget,
    },
    shifts: period.shifts.map((s) => ({
      id: s.id, roleId: s.roleId, date: s.date, startTime: s.startTime,
      endTime: s.endTime, employeeId: s.employeeId, status: s.status,
      hours: s.hours, overrideReason: s.overrideReason, duties: s.duties,
    })),
    result: serialiseResult(result),
    projectedCost: Math.round(schedule.projectedCost()),
    timeOff: repo.timeOff().map((t) => ({ ...t, employeeName: byId.get(t.employeeId)?.name })),
    notices: repo.notices(),
    audit: repo.audit(),
  };
  if (role === "manager") {
    state.pendingSwaps = swaps.pending().map((p) => ({
      swapId: p.swap.id, shiftId: p.shift.id, date: p.shift.date,
      roleId: p.shift.roleId, startTime: p.shift.startTime, endTime: p.shift.endTime,
      postedByName: p.postedByName, claimedByName: p.claimedByName,
      result: serialiseResult(p.result), note: p.swap.note,
    }));
  } else {
    state.board = swaps.board(employeeId).map((b) => ({
      swapId: b.swap.id, shiftId: b.shift.id, date: b.shift.date, roleId: b.shift.roleId,
      startTime: b.shift.startTime, endTime: b.shift.endTime, hours: b.shift.hours,
      mine: b.mine, result: serialiseResult(b.result),
    }));
    state.mySwaps = repo.swaps()
      .filter((s) => s.postedBy === employeeId || s.claimedBy === employeeId)
      .map((s) => ({ ...s }));
  }
  return state;
}

// routes
const routes = {
  "POST /api/assign": (b) => schedule.assign(b.shiftId, b.employeeId ?? null, b.overrideReason ?? null),
  "POST /api/publish": () => schedule.publish(),
  "POST /api/unpublish": () => schedule.unpublish(),
  "POST /api/decide-timeoff": (b) => schedule.decideTimeOff(b.requestId, b.decision),
  "POST /api/post-swap": (b) => swaps.post(b.shiftId, b.employeeId),
  "POST /api/claim": (b) => swaps.claim(b.swapId, b.employeeId),
  "POST /api/decide-swap": (b) => swaps.decide(b.swapId, b.decision),
  "POST /api/reset": () => { repo.reset(); return { ok: true }; },
};

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const send = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };

  if (req.method === "GET" && url.pathname === "/api/state") {
    return send(200, buildState(url.searchParams.get("role") || "manager",
                                url.searchParams.get("employeeId") || "e1"));
  }

  const key = `${req.method} ${url.pathname}`;
  if (routes[key]) {
    let body = "";
    req.on("data", (c) => (body += c));
    return req.on("end", () => {
      let parsed = {};
      try { parsed = body ? JSON.parse(body) : {}; }
      catch { return send(400, { error: "Bad JSON" }); }
      const out = routes[key](parsed);
      send(out && out.error ? 400 : 200, {
        ...out,
        result: out && out.result ? serialiseResult(out.result) : undefined,
      });
    });
  }

  const file = url.pathname === "/" ? "/index.html" : url.pathname;
  const full = path.join(__dirname, "public", path.normalize(file).replace(/^(\.\.[/\\])+/, ""));
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "text/plain" });
    res.end(data);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ShiftChex running at http://localhost:${PORT}`);
  console.log(`${repo.organization.name}, week of ${repo.currentPeriod().startDate}`);
});
