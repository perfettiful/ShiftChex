// how dates and times read in rule messages, notices and the audit log.
// dates are "YYYY-MM-DD" strings and times are "HH:MM", same as the database

const at = (d) => new Date(d + "T12:00:00");

// "2026-10-05" + 3 -> "2026-10-08". done in UTC so the time zone can't shift the day
const addDays = (date, n) => {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// "17:30" -> "5:30pm"
const hhmm = (t) => {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hr}:${String(m).padStart(2, "0")}${ampm}` : `${hr}${ampm}`;
};

// "Mon, 10/12"
const dayName = (d) => at(d).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
// "10/12/2026"
const fullDate = (d) => at(d).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
// "10/12"
const monthDay = (d) => at(d).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });

// "10/13" or "10/13 to 10/14"
const dateRange = (from, to) => (from === to ? monthDay(from) : `${monthDay(from)} to ${monthDay(to)}`);

module.exports = { addDays, hhmm, dayName, fullDate, monthDay, dateRange };
