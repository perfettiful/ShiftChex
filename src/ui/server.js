// ShiftChex prototype server (plain node, no deps)
// run: npm start -> http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const { buildApp } = require("../application/wiring");

const PUBLIC = path.join(__dirname, "public");
// "/" is the landing page. each of the app's screens has its own path, and they all
// load app.html, which picks the screen from the path (PATHS in public/js/main.js)
const APP_PATHS = new Set(["/login", "/schedule", "/approvals", "/report", "/people",
  "/my-schedule", "/availability", "/time-off", "/swap-board"]);
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
const COOKIE = "shiftchex_session";
// no request this app takes comes anywhere near this
const MAX_BODY = 64 * 1024;

const httpError = (status, message) => Object.assign(new Error(message), { status });

const tokenFrom = (req) => (req.headers.cookie || "").split(";")
  .map((c) => c.trim().split("=")).find(([k]) => k === COOKIE)?.[1] || null;

// a null token clears the cookie. Secure when the request came in over https,
// which behind App Platform shows up as x-forwarded-proto
function cookieFor(req, token, maxAge) {
  const secure = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https";
  return `${COOKIE}=${token || ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? maxAge : 0}` +
    (secure ? "; Secure" : "");
}

// keeps reading past the limit without storing it, so the 413 still gets sent
const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", (c) => { size += c.length; if (size <= MAX_BODY) chunks.push(c); });
  req.on("end", () => (size > MAX_BODY ? reject(httpError(413, "That request is too big."))
    : resolve(Buffer.concat(chunks).toString("utf8"))));
  req.on("error", reject);
});

// the JSON body on a POST, the query string on a GET
async function inputFor(req, url) {
  if (req.method === "GET") return Object.fromEntries(url.searchParams);
  const body = await readBody(req);
  let parsed;
  try { parsed = body ? JSON.parse(body) : {}; }
  catch { throw httpError(400, "Bad JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw httpError(400, "Send a JSON object.");
  return parsed;
}

// ui layer. only calls controllers, never the repository
function createServer(app = buildApp()) {
  const { schedule, swaps, availability, report, session } = app;

  // [who can call it, handler]. handlers get the input, the signed in user and their token.
  // employee actions always use the signed in employee, not an id from the body
  const routes = {
    "GET /api/demo-accounts":     ["open", () => session.demoAccounts()],
    "POST /api/login":            ["open", (b) => session.login(b.username, b.password)],
    "POST /api/logout":           ["open", (_b, _u, token) => session.logout(token)],
    // who the cookie belongs to, or user: null
    "GET /api/me":                ["open", (_b, _u, token) => ({ user: session.userForToken(token) })],
    "GET /api/state":             ["any", (q, u) => session.stateFor(u, q.periodId)],
    // manager
    "POST /api/reset":            ["manager", () => session.resetDemo()],
    "GET /api/report":            ["manager", (q) => report.coverage(q.periodId)],
    "POST /api/assign":           ["manager", (b) => schedule.assign(b.shiftId, b.employeeId ?? null, b.overrideReason ?? null)],
    "POST /api/publish":          ["manager", (b) => schedule.publish(b.periodId)],
    "POST /api/unpublish":        ["manager", (b) => schedule.unpublish(b.periodId)],
    "POST /api/decide-timeoff":   ["manager", (b) => schedule.decideTimeOff(b.requestId, b.decision)],
    "POST /api/decide-swap":      ["manager", (b) => swaps.decide(b.swapId, b.decision)],
    // employee
    "POST /api/availability":     ["employee", (b, u) => availability.declare(u.employeeId, b)],
    "POST /api/time-off":         ["employee", (b, u) => availability.requestTimeOff(u.employeeId, b)],
    "POST /api/cancel-time-off":  ["employee", (b, u) => availability.cancelTimeOff(u.employeeId, b.requestId)],
    "POST /api/post-swap":        ["employee", (b, u) => swaps.post(b.shiftId, u.employeeId)],
    "POST /api/withdraw-swap":    ["employee", (b, u) => swaps.withdraw(b.swapId, u.employeeId)],
    "POST /api/claim":            ["employee", (b, u) => swaps.claim(b.swapId, u.employeeId)],
    "POST /api/dismiss-notice":   ["employee", (b, u) => session.dismissNotice(u.employeeId, b.noticeId)],
  };

  async function api(req, res, url, [need, handler], send) {
    // check who it is before reading anything they sent
    const token = tokenFrom(req);
    const auth = need === "open" ? {} : session.authorizeToken(token, need);
    if (auth.error) {
      req.resume();
      return send(auth.status, { error: auth.error });
    }
    const out = handler(await inputFor(req, url), auth.user, token) ?? {};
    if (Array.isArray(out)) return send(200, out);
    // login and logout hand back a token (or null), which becomes the cookie
    const headers = "token" in out ? { "Set-Cookie": cookieFor(req, out.token, out.maxAge) } : {};
    const { token: _t, maxAge: _m, status, ...body } = out;
    send(out.error ? status || 400 : 200, body, headers);
  }

  function file(req, res, url) {
    const page = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
    const name = page === "/" ? "index.html" : APP_PATHS.has(page) ? "app.html" : page;
    const full = path.join(PUBLIC, name);
    const send = (status, file, data) => {
      // no-cache so a browser never keeps running old js after someone pulls new code
      res.writeHead(status, { "Content-Type": MIME[path.extname(file)] || "text/plain", "Cache-Control": "no-cache" });
      res.end(req.method === "HEAD" ? undefined : data);
    };
    const notFound = () => fs.readFile(path.join(PUBLIC, "404.html"), (err, data) =>
      (err ? send(404, "", "Not found") : send(404, "404.html", data)));
    // URL already resolved any ../ in the path, this is just a second lock on the door
    if ((req.method !== "GET" && req.method !== "HEAD") || !full.startsWith(PUBLIC + path.sep)) return notFound();
    fs.readFile(full, (err, data) => (err ? notFound() : send(200, full, data)));
  }

  return http.createServer(async (req, res) => {
    const send = (code, obj, headers = {}) => {
      if (res.headersSent) return;
      res.writeHead(code, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify(obj));
    };
    try {
      let url;
      try { url = new URL(req.url, "http://localhost"); }
      catch { throw httpError(400, "Bad request."); }
      const route = routes[`${req.method} ${url.pathname}`];
      if (route) return await api(req, res, url, route, send);
      if (url.pathname.startsWith("/api/")) throw httpError(404, "No such API route.");
      file(req, res, url);
    } catch (err) {
      if (err.status) return send(err.status, { error: err.message });
      console.error(err);
      send(500, { error: "Something went wrong on the server." });
    }
  });
}

if (require.main === module) {
  const app = buildApp();
  const PORT = process.env.PORT || 3000;
  const server = createServer(app).listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    const { organization, weekOf } = app.session.about();
    console.log(`ShiftChex running at ${url}`);
    console.log(`${organization}, week of ${weekOf}`);
    const rel = path.relative(process.cwd(), app.file);
    console.log(`Database: ${rel.startsWith("..") ? app.file : rel}`);
    // npm start passes --open so the app pops up in the default browser
    if (process.argv.includes("--open")) {
      const opener = { darwin: "open", win32: 'start ""' }[process.platform] || "xdg-open";
      require("child_process").exec(`${opener} ${url}`);
    }
  });
  // Ctrl+C, and the SIGTERM docker and App Platform send when they stop the app.
  // node won't exit on SIGTERM by itself when it's the only process in a container
  const stop = () => {
    server.close(() => { app.repo.close(); process.exit(0); });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

module.exports = { createServer };
