// sign in. the dropdown is a demo shortcut that fills in a real username and password
import { el, toast } from "../dom.js";
import { icon } from "../icons.js";
import { login } from "../api.js";

export function loginView(accounts, onSignedIn) {
  const username = el("input", { type: "text", autocomplete: "username", required: true });
  const password = el("input", { type: "password", autocomplete: "current-password", required: true });

  const picker = el("select", {},
    el("option", { value: "" }, "Pick someone to sign in as"),
    el("optgroup", { label: "Manager" }, accounts.filter((a) => a.role === "manager").map(option)),
    el("optgroup", { label: "Employees" }, accounts.filter((a) => a.role !== "manager").map(option)));
  picker.addEventListener("change", () => {
    const a = accounts.find((x) => x.username === picker.value);
    username.value = a ? a.username : "";
    password.value = a ? a.password : "";
  });

  const form = el("form", { class: "card form" },
    el("div", { class: "title" }, el("h1", {}, "Sign in"),
      el("p", { class: "muted" }, "Pick a demo account and the username and password fill in.")),
    el("label", { class: "field" }, "Demo account", picker),
    el("label", { class: "field" }, "Username", username),
    el("label", { class: "field" }, "Password", password),
    el("button", { type: "submit" }, icon("logIn"), "Sign in"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await login(username.value, password.value);
    if (r.data.error) return toast(r.data.error, true);
    onSignedIn(r.data.user);
  });

  return [el("div", { class: "auth" }, form)];
}

const option = (a) => el("option", { value: a.username }, a.name);
