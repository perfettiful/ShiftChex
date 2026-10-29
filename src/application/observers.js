const { notice, audit, shiftLabel } = require("../domain/messages");

// Observer: everything that happens after the fact. the controllers only emit,
// and adding something new on publish (or any other event) means adding a handler here
function subscribe(events, repo) {
  const today = () => repo.today();
  const name = (id) => repo.employeeName(id) || id;
  const roleName = (id) => repo.roleName(id) || id;
  const label = (shift) => shiftLabel(shift, roleName(shift.roleId));
  const tell = (employeeId, text) =>
    repo.addNotice({ id: repo.nextId("notice"), employeeId, text, createdOn: today() });
  const log = (what) => repo.addAudit({ at: today(), what });
  const peopleOn = (period) => new Set(period.shifts.filter((s) => s.isAssigned()).map((s) => s.employeeId));

  events.on("schedule.published", ({ period }) => {
    peopleOn(period).forEach((id) => tell(id, notice.published(period)));
    log(audit.published(period));
  });

  events.on("schedule.unpublished", ({ period, cancelled }) => {
    peopleOn(period).forEach((id) => tell(id, notice.unpublished(period)));
    const shifts = new Map(period.shifts.map((s) => [s.id, s]));
    cancelled.forEach((sw) => {
      const text = notice.swapCancelled(label(shifts.get(sw.shiftId)));
      [sw.postedBy, sw.claimedBy].filter(Boolean).forEach((id) => tell(id, text));
    });
    log(audit.unpublished(period, cancelled.length));
  });

  events.on("swap.decided", ({ swap, shift }) => {
    const approved = swap.status === "approved";
    const what = label(shift);
    tell(swap.claimedBy, approved ? notice.swapApprovedClaimer(name(swap.postedBy), what)
                                  : notice.swapDeniedClaimer(name(swap.postedBy), what));
    tell(swap.postedBy, approved ? notice.swapApprovedPoster(name(swap.claimedBy), what)
                                 : notice.swapDeniedPoster(what));
    log(audit.swap(approved, name(swap.claimedBy), name(swap.postedBy), what));
  });

  events.on("swap.withdrawn", ({ swap, shift }) => {
    log(audit.swapWithdrawn(name(swap.postedBy), label(shift)));
  });

  events.on("timeoff.decided", ({ request }) => {
    tell(request.employeeId, notice.timeOff(request));
    log(audit.timeOff(request, name(request.employeeId)));
  });

  // UC-12. the business wants to know why a rule was set aside
  events.on("shift.overridden", ({ shift, employee, reason }) => {
    log(audit.override(employee.name, shift, roleName(shift.roleId), reason));
  });
}

module.exports = { subscribe };
