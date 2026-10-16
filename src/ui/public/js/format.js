export const money = (n) => "$" + n.toLocaleString();

export const dayLabel = (d) => new Date(d + "T12:00:00")
  .toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });

// "17:30" -> "5:30pm"
export const time = (t) => {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am", hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, "0")}${ap}` : `${hr}${ap}`;
};

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
