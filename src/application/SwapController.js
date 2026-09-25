const { SwapRequest } = require("../domain");

// split off from ScheduleController in elab 2 (High Cohesion)
class SwapController {
  constructor(repo, engine, events) {
    this.repo = repo; this.engine = engine; this.events = events;
  }

  board(forEmployeeId) {
    const period = this.repo.currentPeriod();
    const employee = this.repo.employeesById().get(forEmployeeId);
    return this.repo.swaps()
      .filter((sw) => sw.status === "posted")
      .map((sw) => {
        const shift = period.shifts.find((s) => s.id === sw.shiftId);
        if (!shift || !employee) return null;
        const mine = sw.postedBy === forEmployeeId;
        const result = mine ? null
          : this.engine.validateAssignment(shift, forEmployeeId, period, this.repo);
        return { swap: sw, shift, mine, result };
      })
      .filter(Boolean);
  }

  post(shiftId, employeeId) {
    const period = this.repo.currentPeriod();
    const shift = period.shifts.find((s) => s.id === shiftId);
    if (!shift) return { error: "No such shift." };
    if (shift.employeeId !== employeeId) return { error: "That is not your shift." };
    if (period.isDraft()) return { error: "This schedule has not been published yet." };
    if (this.repo.swaps().some((s) => s.shiftId === shiftId && s.status !== "denied")) {
      return { error: "That shift is already posted." };
    }
    const swap = new SwapRequest({
      id: this.repo.nextId("swap"), shiftId, postedBy: employeeId,
      status: "posted", postedOn: this.repo.today(),
    });
    this.repo.swaps().push(swap);
    shift.status = "openForSwap";
    return { ok: true, swap };
  }

  // UC-05. check rules against the person taking the shift before creating anything
  claim(swapId, employeeId) {
    const period = this.repo.currentPeriod();
    const swap = this.repo.swaps().find((s) => s.id === swapId);
    if (!swap) return { error: "No such swap." };
    if (swap.status !== "posted") return { error: "Somebody else already claimed that one." };
    if (swap.postedBy === employeeId) return { error: "You posted that shift." };
    const shift = period.shifts.find((s) => s.id === swap.shiftId);

    const result = this.engine.validateAssignment(shift, employeeId, period, this.repo);
    if (result.blocking.length) {
      return { error: result.blocking[0].message, refused: true, result };
    }
    swap.claimedBy = employeeId;
    swap.status = "claimed";
    swap.note = result.warnings.length ? result.warnings[0].message : null;
    shift.status = "claimed";
    return { ok: true, result };
  }

  pending() {
    const period = this.repo.currentPeriod();
    const byId = this.repo.employeesById();
    return this.repo.swaps().filter((s) => s.status === "claimed").map((sw) => {
      const shift = period.shifts.find((s) => s.id === sw.shiftId);
      // recheck here, schedule might have changed since the claim
      const result = this.engine.validateAssignment(shift, sw.claimedBy, period, this.repo);
      return {
        swap: sw, shift, result,
        postedByName: byId.get(sw.postedBy)?.name,
        claimedByName: byId.get(sw.claimedBy)?.name,
      };
    });
  }

  decide(swapId, decision) {
    const period = this.repo.currentPeriod();
    const swap = this.repo.swaps().find((s) => s.id === swapId);
    if (!swap || swap.status !== "claimed") return { error: "Nothing to decide." };
    const shift = period.shifts.find((s) => s.id === swap.shiftId);

    if (decision === "approve") {
      const result = this.engine.validateAssignment(shift, swap.claimedBy, period, this.repo);
      if (result.blocking.length) {
        return { error: `Cannot approve. ${result.blocking[0].message}`, result };
      }
      shift.assign(swap.claimedBy);
      shift.status = "published";
      swap.status = "approved";
    } else {
      shift.status = "published";
      swap.status = "denied";
    }
    swap.decidedOn = this.repo.today();
    this.events.emit("swap.decided", { swap });
    return { ok: true };
  }
}
module.exports = SwapController;
