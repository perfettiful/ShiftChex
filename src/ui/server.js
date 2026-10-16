// ShiftChex prototype server (plain node, no deps)
// run: npm start -> http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const { buildApp } = require("../application/wiring");

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

// ui layer. only calls controllers, never the repository
function createServer(app = buildApp()) {
  const { schedule, swaps, availability, session } = app;

  // [who can call it, handler]. handlers get the body and the signed in user.
  // employee actions always use the signed in employee, not an id from the body
  const routes = {
    "GET /api/users":           ["open", () => session.users()],
    "GET /api/state":           ["any", (_b, u) => session.stateFor(u)],
    "POST /api/assign":         ["manager", (b) => schedule.assign(b.shiftId, b.employeeId ?? null, b.overrideReason ?? null)],
    "POST /api/publish":        ["manager", () => schedule.publish()],
    "POST /api/unpublish":      ["manager", () => schedule.unpublish()],
    "POST /api/decide-timeoff": ["manager", (b) => schedule.decideTimeOff(b.requestId, b.decision)],
    "POST /api/decide-swap":    ["manager", (b) => swaps.decide(b.swapId, b.decision)],
    "POST /api/availability":   ["employee", (b, u) => availability.declare(u.employeeId, b)],
    "POST /api/time-off":       ["employee", (b, u) => availability.requestTimeOff(u.employeeId, b)],
    "POST /api/post-swap":      ["employee", (b, u) => swaps.post(b.shiftId, u.employeeId)],
    "POST /api/claim":          ["employee", (b, u) => swaps.claim(b.swapId, u.employeeId)],
    "POST /api/reset":          ["any", () => session.resetDemo()],
  };

  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = (code, obj) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };

    const route = routes[`${req.method} ${url.pathname}`];
    if (route) {
      let body = "";
      req.on("data", (c) => (body += c));
      return req.on("end", () => {
        let parsed = {};
        try { parsed = body ? JSON.parse(body) : {}; }
        catch { return send(400, { error: "Bad JSON" }); }
        const [need, handler] = route;
        const auth = need === "open" ? {} : session.authorize(req.headers["x-user-id"], need);
        if (auth.error) return send(auth.status, { error: auth.error });
        try {
          const out = handler(parsed, auth.user);
          send(out && out.error ? 400 : 200, out ?? {});
        } catch (err) {
          console.error(err);
          send(500, { error: "Something went wrong on the server." });
        }
      });
    }

    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    const full = path.join(__dirname, "public", path.normalize(file).replace(/^(\.\.[/\\])+/, ""));
    fs.readFile(full, (err, data) => {
      if (err) { res.writeHead(404); return res.end("Not found"); }
      // no-cache so a browser never keeps running old js after someone pulls new code
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "text/plain", "Cache-Control": "no-cache" });
      res.end(data);
    });
  });
}

if (require.main === module) {
  const app = buildApp();
  const PORT = process.env.PORT || 3000;
  createServer(app).listen(PORT, () => {
    const { organization, weekOf } = app.session.about();
    console.log(`ShiftChex running at http://localhost:${PORT}`);
    console.log(`${organization}, week of ${weekOf}`);
    const rel = path.relative(process.cwd(), app.file);
    console.log(`Database: ${rel.startsWith("..") ? app.file : rel}`);
  });
}

module.exports = { createServer };
