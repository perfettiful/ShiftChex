import { app, reload } from "./state.js";
import { toast } from "./dom.js";

// send who's signed in with every call, the server checks what they can do
const headers = () => ({ "Content-Type": "application/json", "X-User-Id": app.who });

export const getUsers = async () => (await fetch("/api/users")).json();
export const getState = async () => (await fetch("/api/state", { headers: headers() })).json();

export async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers: headers(), body: JSON.stringify(body || {}) });
  return { ok: res.ok, data: await res.json() };
}

// post, show the message (or the error), then redraw from the server.
// pass null as the message to only speak up on errors.
// keep: true leaves the screen alone on an error so a half filled form isn't wiped
export async function act(path, body, okMessage, { keep = false } = {}) {
  const r = await post(path, body);
  if (r.data.error || okMessage) toast(r.data.error || okMessage, !!r.data.error);
  if (!(keep && r.data.error)) await reload();
  return r;
}

// no passwords, you just pick a name. remember it so a refresh doesn't sign you out
export function remembered() {
  try { return localStorage.getItem("shiftchex.user"); } catch { return null; }
}
export function remember() {
  try { localStorage.setItem("shiftchex.user", app.who); } catch { /* private window, fine */ }
}
