// the wording for notices (what an employee sees) and audit entries (what the
// manager sees in the activity log). one place, so the demo data and the app match
const { hhmm, dayName, monthDay, dateRange } = require("./format");

// "Thu, 10/8 Server shift"
const shiftLabel = (shift, roleName) => `${dayName(shift.date)} ${roleName} shift`;
// "Sun, 10/11 Cook / prep 8am to 4pm"
const shiftWithTimes = (shift, roleName) =>
  `${dayName(shift.date)} ${roleName} ${hhmm(shift.startTime)} to ${hhmm(shift.endTime)}`;
const week = (period) => `the week of ${monthDay(period.startDate)}`;

const notice = {
  published: (period) => `The schedule for ${week(period)} is out.`,
  unpublished: (period) =>
    `The schedule for ${week(period)} went back to draft. You'll get another notice when it's out again.`,
  swapCancelled: (label) => `Your swap for the ${label} was cancelled because that week went back to draft.`,
  swapApprovedClaimer: (posterName, label) => `You got ${posterName}'s ${label}. The manager approved the swap.`,
  swapApprovedPoster: (claimerName, label) => `${claimerName} is taking your ${label}. The manager approved the swap.`,
  swapDeniedClaimer: (posterName, label) => `The manager turned down your claim on ${posterName}'s ${label}.`,
  swapDeniedPoster: (label) => `Your ${label} stays with you. The manager turned down the swap.`,
  timeOff: (t) => `Your time off for ${dateRange(t.startDate, t.endDate)} was ` +
    `${t.status === "approved" ? "approved" : "turned down"}.`,
};

const audit = {
  published: (period) => `Published ${week(period)}.`,
  unpublished: (period, cancelled) => `Took ${week(period)} back to draft` +
    (cancelled ? `, which cancelled ${cancelled} open swap request${cancelled === 1 ? "" : "s"}.` : "."),
  override: (employeeName, shift, roleName, reason) =>
    `Overrode R1 for ${employeeName} on ${shiftWithTimes(shift, roleName)}. Reason: ${reason}`,
  swap: (approved, claimerName, posterName, label) =>
    `${approved ? "Approved" : "Denied"} ${claimerName} taking ${posterName}'s ${label}.`,
  swapWithdrawn: (posterName, label) => `${posterName} took their ${label} off the swap board.`,
  timeOff: (t, employeeName) => `${t.status === "approved" ? "Approved" : "Denied"} time off for ` +
    `${employeeName}, ${dateRange(t.startDate, t.endDate)}.`,
};

module.exports = { notice, audit, shiftLabel, shiftWithTimes };
