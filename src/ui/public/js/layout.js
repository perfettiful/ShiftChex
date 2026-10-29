// the pieces every screen is built from, so they all line up the same way
import { el } from "./dom.js";

// the top of a screen. first row: title, status tag and one line under it, with the
// buttons on the right. second row (optional): the week picker, the labor meter
export function pageHead({ title, tag = null, meta = null, actions = [], toolbar = [] }) {
  const buttons = actions.filter(Boolean);
  const tools = toolbar.filter(Boolean);
  return el("header", { class: "page-head" },
    el("div", { class: "page-title" },
      el("div", { class: "title" },
        el("h1", {}, el("span", {}, title), tag ? el("span", { class: "tag " + tag }, tag) : null),
        meta ? el("p", { class: "muted" }, meta) : null),
      buttons.length ? el("div", { class: "actions" }, buttons) : null),
    tools.length ? el("div", { class: "toolbar" }, tools) : null);
}

// a titled block of the page. aside is the small grey text next to the title
export function section(title, aside, ...body) {
  return el("section", { class: "section" },
    el("div", { class: "section-head" }, el("h2", {}, title),
      aside != null && aside !== "" ? el("span", { class: "muted" }, String(aside)) : null),
    body);
}
