import { reload } from "./state.js";
import { toast } from "./dom.js";

// the session cookie goes along with every call on its own, the server checks what you can do
const headers = { "Content-Type": "application/json" };
const query = (periodId) => (periodId ? `?periodId=${encodeURIComponent(periodId)}` : "");

export const getDemoAccounts = async () => (await fetch("/api/demo-accounts")).json();
// null when nobody is signed in (or the session is gone)
export async function getMe() {
  return (await (await fetch("/api/me")).json()).user;
}
export async function getState(periodId) {
  const res = await fetch("/api/state" + query(periodId));
  return res.ok ? res.json() : null;
}
// UC-11, manager only
export async function getReport(periodId) {
  const res = await fetch("/api/report" + query(periodId));
  return res.json();
}
export const login = (username, password) => post("/api/login", { username, password });
export const logout = () => post("/api/logout");

export async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body || {}) });
  return { ok: res.ok, data: await res.json() };
}

// post, show the message (or the error), then redraw. a null message only speaks up on
// errors, and keep: true leaves the screen alone on an error so a half filled form survives
export async function act(path, body, okMessage, { keep = false } = {}) {
  const r = await post(path, body);
  if (r.data.error || okMessage) toast(r.data.error || okMessage, !!r.data.error);
  if (!(keep && r.data.error)) await reload();
  return r;
}
