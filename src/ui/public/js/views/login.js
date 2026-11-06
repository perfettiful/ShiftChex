// the landing page: a hero with the sign in card, then what the app does.
// the dropdown is a demo shortcut that fills in a real username and password
import { el, toast } from "../dom.js";
import { icon } from "../icons.js";
import { login } from "../api.js";
import { startHero } from "../hero3d.js";

const RULE_COUNT = 12;

const FEATURES = [
  ["shield", "Rule check on every change",
    "Availability, rest, under 18 hours, certifications and part-time caps are checked each time a cell changes. Publish stays locked while anything blocks."],
  ["swap", "A swap board that checks first",
    "Staff post shifts and claim each other's. Each claim is checked against the person taking it, then again when the manager approves."],
  ["pencil", "Overrides with a reason",
    "When someone agrees to work outside their hours, the manager can set that one rule aside. The reason goes in the activity log."],
  ["chart", "Coverage and labor report",
    "Open shifts by day, labor against budget, everyone's hours against their limit, and certs coming due."],
];

export function loginView(accounts, onSignedIn) {
  const username = el("input", { type: "text", autocomplete: "username", required: true });
  const password = el("input", { type: "password", autocomplete: "current-password", required: true });
  const staff = accounts.filter((a) => a.role !== "manager");
  const manager = accounts.find((a) => a.role === "manager");

  const picker = el("select", {},
    el("option", { value: "" }, "Pick someone to sign in as"),
    el("optgroup", { label: "Manager" }, manager ? option(manager) : null),
    el("optgroup", { label: "Employees" }, staff.map(option)));
  const fill = (a) => {
    username.value = a ? a.username : "";
    password.value = a ? a.password : "";
  };
  picker.addEventListener("change", () => fill(accounts.find((x) => x.username === picker.value)));

  const signIn = async () => {
    const r = await login(username.value, password.value);
    if (r.data.error) return toast(r.data.error, true);
    onSignedIn(r.data.user);
  };
  const form = el("form", { class: "card form" },
    el("div", { class: "title" }, el("h2", {}, "Sign in"),
      el("p", { class: "muted" }, "Pick a demo account and the username and password fill in.")),
    el("label", { class: "field" }, "Demo account", picker),
    el("label", { class: "field" }, "Username", username),
    el("label", { class: "field" }, "Password", password),
    el("button", { type: "submit" }, icon("logIn"), "Sign in"));
  form.addEventListener("submit", (e) => { e.preventDefault(); signIn(); });

  // one click straight into the manager's view
  const tryManager = () => {
    if (!manager) return;
    picker.value = manager.username;
    fill(manager);
    signIn();
  };

  const stage = el("div", { class: "hero-canvas", "aria-hidden": "true" });
  const features = el("section", { class: "features container", id: "features" },
    el("div", { class: "features-head" },
      el("h2", {}, "What it checks for you"),
      el("p", { class: "muted" }, "Everything runs on the server, so a schedule can't get around a rule.")),
    el("div", { class: "features-grid" }, FEATURES.map(([glyph, title, text]) =>
      el("div", { class: "feature" }, el("span", { class: "feature-icon" }, icon(glyph, { size: 20 })),
        el("h3", {}, title), el("p", {}, text)))));

  const hero = el("section", { class: "hero" }, stage,
    el("div", { class: "hero-inner container" },
      el("div", { class: "hero-copy" },
        el("h1", {}, "Schedules that ", el("span", { class: "shine" }, "check themselves.")),
        el("p", { class: "lede" },
          `ShiftChex runs every shift against ${RULE_COUNT} labor, rest and certification rules before the week goes out, ` +
          "so nobody gets booked into a violation."),
        el("div", { class: "hero-ctas" },
          el("button", { class: "bright", onclick: tryManager }, icon("calendar"), "Try it as the manager"),
          el("button", { class: "on-dark", onclick: () => features.scrollIntoView({ behavior: "smooth" }) },
            "See what it checks")),
        el("dl", { class: "hero-stats" },
          stat(RULE_COUNT, "rules"), stat(staff.length, "staff"), stat("1", "manager"))),
      el("div", { class: "auth" }, form)));

  const footer = el("footer", { class: "site-foot" },
    el("div", { class: "container site-foot-inner" },
      el("div", { class: "brand" }, logo(), "ShiftChex"),
      el("p", { class: "muted small" }, "Demo data for a made-up restaurant, Northside Grill."),
      el("div", { class: "foot-links" },
        el("button", { class: "link", onclick: () => features.scrollIntoView({ behavior: "smooth" }) }, "What it checks"),
        el("button", { class: "link", onclick: () => focusSignIn(picker) }, "Sign in"))));

  startHero(stage);
  return [hero, features, footer];
}

// the header's links while nobody is signed in. main.js puts them in the bar
export function landingNav() {
  const go = (sel) => () => document.querySelector(sel)?.scrollIntoView({ behavior: "smooth" });
  return [
    el("button", { onclick: go("#features") }, icon("shield"), "What it checks"),
    el("button", { onclick: () => focusSignIn(document.querySelector(".hero .auth select")) }, icon("logIn"), "Sign in"),
  ];
}

function focusSignIn(picker) {
  if (!picker) return;
  picker.closest(".auth").scrollIntoView({ behavior: "smooth", block: "center" });
  picker.focus({ preventScroll: true });
}

// same mark as the header
function logo() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "22"); svg.setAttribute("height", "22");
  svg.setAttribute("viewBox", "0 0 32 32"); svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<rect width="32" height="32" rx="8" fill="#2f5fa8"/><path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
}

const option = (a) => el("option", { value: a.username }, a.name);
const stat = (n, label) => el("div", {}, el("dt", {}, String(n)), el("dd", {}, label));
