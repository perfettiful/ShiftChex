export const money = (n) => "$" + Math.round(n).toLocaleString();

const at = (d) => new Date(d + "T12:00:00");

// "2026-10-05" + 3 -> "2026-10-08". done in UTC so the time zone can't shift the day
export const addDays = (date, n) => {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// "Mon, 10/12"
export const dayLabel = (d) => at(d).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
// "Oct 12"
export const shortDate = (d) => at(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
// "Mon, Oct 12"
export const longDate = (d) => at(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
// "Oct 13" or "Oct 13 to Oct 14"
export const dateRange = (from, to) => (from === to ? shortDate(from) : `${shortDate(from)} to ${shortDate(to)}`);
export const weekOf = (start) => `Week of ${shortDate(start)}`;
// "Oct 12 - 18", or "Dec 28 - Jan 3" across a month
export const weekRange = (start, end) => start.slice(5, 7) === end.slice(5, 7)
  ? `${shortDate(start)} - ${Number(end.slice(8))}` : `${shortDate(start)} - ${shortDate(end)}`;

// "17:30" -> "5:30pm"
export const time = (t) => {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am", hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, "0")}${ap}` : `${hr}${ap}`;
};
export const hours = (n) => `${n % 1 ? n.toFixed(1) : n} ${n === 1 ? "hour" : "hours"}`;
export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// display order mon..sun, values are js weekdays (0 = sun) like the server uses
export const WEEK = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];

// "every day 6am - 11:59pm", or day by day when they differ
export function availabilityText(a) {
  if (!a.slots.length) return "never";
  const label = (x) => `${time(x.startTime)} - ${time(x.endTime)}`;
  const byDay = new Map(a.slots.map((x) => [x.weekday, label(x)]));
  const labels = [...new Set(byDay.values())];
  if (byDay.size === 7 && labels.length === 1) return `every day ${labels[0]}`;
  return WEEK.filter(([d]) => byDay.has(d)).map(([d, name]) => `${name} ${byDay.get(d)}`).join(", ");
}
