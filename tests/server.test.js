const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const wiring = require("../src/application/wiring");
const { createServer } = require("../src/ui/server");
const { buildApp } = require("./helpers");

// the http side: bad requests, files, cookies. none of these should take the server down
async function listen(app) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
const close = (server) => { server.closeAllConnections(); server.close(); };
const login = (base, username, headers = {}) => fetch(base + "/api/login", {
  method: "POST", headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify({ username, password: "shiftchex" }),
});
const cookieOf = (res) => res.headers.get("set-cookie").split(";")[0];

// a raw request, for things fetch won't send
const raw = (base, text) => new Promise((resolve, reject) => {
  const { port } = new URL(base);
  const socket = net.connect(port, "127.0.0.1", () => socket.write(text));
  let out = "";
  socket.on("data", (d) => (out += d));
  socket.on("end", () => resolve(out));
  socket.on("error", reject);
});

describe("server tests", () => {
  let server, base;
  before(async () => ({ server, base } = await listen(buildApp())));
  after(() => close(server));

  test("a request it can't make sense of gets a 400 and the server keeps going", async () => {
    const reply = await raw(base, "GET http://[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n");
    assert.match(reply, /^HTTP\/1\.1 400/);
    assert.equal((await fetch(base + "/api/me")).status, 200);
  });

  test("a body over the limit gets a 413", async () => {
    const res = await login(base, "x".repeat(70 * 1024));
    assert.equal(res.status, 413);
    assert.equal((await fetch(base + "/api/me")).status, 200);
  });

  test("signed out calls are turned away before the body is read", async () => {
    const res = await fetch(base + "/api/publish", { method: "POST", body: "x".repeat(70 * 1024) });
    assert.equal(res.status, 401);
  });

  test("serves the app's files and nothing outside them", async () => {
    assert.equal((await fetch(base + "/")).status, 200);
    assert.equal((await fetch(base + "/app.css")).headers.get("content-type"), "text/css");
    for (const p of ["/../server.js", "/%2e%2e/server.js", "/..%2fserver.js", "/js/../../server.js"]) {
      assert.equal((await fetch(base + p)).status, 404, p);
    }
    assert.match(await raw(base, "GET /../../package.json HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"), /^HTTP\/1\.1 404/);
  });

  test("the cookie is HttpOnly, and Secure when the request came in over https", async () => {
    const plain = (await login(base, "dana.park")).headers.get("set-cookie");
    assert.match(plain, /HttpOnly/);
    assert.doesNotMatch(plain, /Secure/);
    assert.match(plain, /Max-Age=604800/);
    const proxied = (await login(base, "dana.park", { "X-Forwarded-Proto": "https" })).headers.get("set-cookie");
    assert.match(proxied, /; Secure/);
  });

  test("Reset demo keeps you signed in", async () => {
    const cookie = cookieOf(await login(base, "r.chen"));
    const res = await fetch(base + "/api/reset", { method: "POST", headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    const me = await (await fetch(base + "/api/me", { headers: { Cookie: cookie } })).json();
    assert.equal(me.user.id, "manager");
  });

  test("a session older than a week doesn't count", () => {
    const app = buildApp();
    const old = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
    app.repo.addSession("old-token", "e1", old);
    assert.equal(app.session.userForToken("old-token"), null);
    // and signing in clears it out
    app.session.login("dana.park", "shiftchex");
    assert.equal(app.repo.db.prepare("SELECT COUNT(*) AS n FROM login_session WHERE token = 'old-token'").get().n, 0);
  });
});

describe("a locked database", () => {
  test("waits for the lock instead of crashing", async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftchex-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const app = wiring.buildApp({ db: path.join(dir, "test.db") });
    const { server, base } = await listen(app);
    t.after(() => { close(server); app.repo.close(); });

    // another program (a db viewer, sqlite3) holds the file for a moment
    const holder = spawn(process.execPath, ["-e", `
      const db = new (require("node:sqlite").DatabaseSync)(${JSON.stringify(path.join(dir, "test.db"))});
      db.exec("BEGIN EXCLUSIVE");
      console.log("locked");
      setTimeout(() => db.exec("COMMIT"), 300);`]);
    await new Promise((resolve) => holder.stdout.once("data", resolve));
    const res = await fetch(base + "/api/demo-accounts");
    assert.equal(res.status, 200);
    await new Promise((resolve) => holder.once("exit", resolve));
  });
});
