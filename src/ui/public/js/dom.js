import { icon } from "./icons.js";

export const $ = (sel) => document.querySelector(sel);

// el("div", { class: "card", onclick: fn }, "text", otherNode)
export const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== false && v !== undefined) n.setAttribute(k, v);
  }
  kids.flat(2).forEach((c) => n.append(c?.nodeType ? c : document.createTextNode(c ?? "")));
  return n;
};

export function toast(msg, bad) {
  const t = $("#toast");
  t.textContent = "";
  t.append(icon(bad ? "alert" : "check"), el("span", {}, msg));
  t.className = "toast" + (bad ? " bad" : "");
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 5200);
}

// a modal instead of confirm() and prompt(). resolves to the text typed (when there's
// an input), true, or null on cancel
export function ask({ title, body = [], input = null, confirm = "OK", tone = "", glyph = null }) {
  return new Promise((resolve) => {
    const field = input && el("textarea", { rows: 3, maxlength: "200", placeholder: input.placeholder || null });
    const error = el("p", { class: "field-error", hidden: true });
    const dialog = el("dialog", { class: "modal" });
    const done = (value) => { dialog.close(); dialog.remove(); resolve(value); };
    const ok = el("button", { type: "submit", class: tone }, glyph ? icon(glyph) : null, confirm);
    const form = el("form", {},
      el("h2", {}, glyph ? icon(glyph, { size: 20 }) : null, title),
      body.filter(Boolean).map((b) => (typeof b === "string" ? el("p", {}, b) : b)),
      field ? el("label", { class: "field" }, input.label, field) : null,
      error,
      el("div", { class: "modal-actions" },
        el("button", { type: "button", class: "quiet", onclick: () => done(null) }, "Cancel"), ok));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!field) return done(true);
      const value = field.value.trim();
      if (value) return done(value);
      error.textContent = input.required || "This can't be blank.";
      error.hidden = false;
      field.focus();
    });
    dialog.addEventListener("cancel", (e) => { e.preventDefault(); done(null); });
    dialog.append(form);
    document.body.append(dialog);
    dialog.showModal();
    (field || ok).focus();
  });
}
