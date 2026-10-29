const { SwapRequest, Shift } = require("../domain");

// UC-04, UC-05, UC-09, in their own controller (High Cohesion). each swap is checked
// against the week its shift is in
class SwapController {
  constructor(repo, engine, events) {
    this.repo = repo; this.engine = engine; this.events = events;
  }

  // posted shifts that haven't happened yet, each checked against this employee
  board(forEmployeeId) {
    if (!this.repo.employeesById().has(forEmployeeId)) return [];
    const today = this.repo.today();
    const weekOf = this.#weeksByShift();
    return this.repo.swaps()
      .filter((sw) => sw.status === "posted")
      .map((sw) => {
        const period = weekOf.get(sw.shiftId);
        const shift = period?.shifts.find((s) => s.id === sw.shiftId);
        if (!shift || period.isDraft() || shift.date < today) return null;
        const mine = sw.postedBy === forEmployeeId;
        const result = mine ? null
          : this.engine.validateAssignment(shift, forEmployeeId, period, this.repo);
        return { swap: sw, shift, period, mine, result };
      })
      .filter(Boolean)
      .sort((a, b) => Shift.byStart(a.shift, b.shift));
  }

  // UC-04
  post(shiftId, employeeId) {
    const period = this.repo.periodOfShift(shiftId);
    const shift = period?.shifts.find((s) => s.id === shiftId);
    if (!shift) return { error: "No such shift." };
    if (shift.employeeId !== employeeId) return { error: "That is not your shift." };
    if (period.isDraft()) return { error: "This schedule has not been published yet." };
    if (shift.date < this.repo.today()) return { error: "That shift already happened." };
    if (this.repo.swaps().some((s) => s.shiftId === shiftId && s.isOpen())) {
      return { error: "That shift is already posted." };
    }
    const swap = new SwapRequest({
      id: this.repo.nextId("swap"), shiftId, postedBy: employeeId,
      status: "posted", postedOn: this.repo.today(),
    });
    shift.status = "openForSwap";
    this.repo.transaction(() => { this.repo.addSwap(swap); this.repo.saveShift(shift); });
    return { ok: true, swap };
  }

  // the poster takes it back before anyone claims it
  withdraw(swapId, employeeId) {
    const swap = this.repo.swaps().find((s) => s.id === swapId);
    if (!swap) return { error: "No such swap." };
    if (swap.postedBy !== employeeId) return { error: "You didn't post that one." };
    if (swap.status !== "posted") return { error: "Someone already claimed it, so it's with the manager now." };
    const period = this.repo.periodOfShift(swap.shiftId);
    const shift = period.shifts.find((s) => s.id === swap.shiftId);
    shift.status = "published";
    swap.status = "withdrawn";
    swap.decidedOn = this.repo.today();
    this.repo.transaction(() => {
      this.repo.saveSwap(swap);
      this.repo.saveShift(shift);
      this.events.emit("swap.withdrawn", { swap, shift });
    });
    return { ok: true };
  }

  // UC-05. check rules against the person taking the shift before creating anything
  claim(swapId, employeeId) {
    const swap = this.repo.swaps().find((s) => s.id === swapId);
    if (!swap) return { error: "No such swap." };
    if (swap.status !== "posted") return { error: "Somebody else already claimed that one." };
    if (swap.postedBy === employeeId) return { error: "You posted that shift." };
    const period = this.repo.periodOfShift(swap.shiftId);
    const shift = period.shifts.find((s) => s.id === swap.shiftId);
    if (shift.date < this.repo.today()) return { error: "That shift already happened." };

    const result = this.engine.validateAssignment(shift, employeeId, period, this.repo);
    if (result.blocking.length) {
      return { error: result.blocking[0].message, refused: true, result };
    }
    swap.claimedBy = employeeId;
    swap.status = "claimed";
    shift.status = "claimed";
    this.repo.transaction(() => { this.repo.saveSwap(swap); this.repo.saveShift(shift); });
    return { ok: true, result };
  }

  // claims waiting on the manager, oldest shift first
  pending() {
    const byId = this.repo.employeesById();
    const weekOf = this.#weeksByShift();
    return this.repo.swaps().filter((s) => s.status === "claimed").map((sw) => {
      const period = weekOf.get(sw.shiftId);
      const shift = period.shifts.find((s) => s.id === sw.shiftId);
      // recheck here, schedule might have changed since the claim
      const result = this.engine.validateAssignment(shift, sw.claimedBy, period, this.repo);
      return {
        swap: sw, shift, period, result,
        postedByName: byId.get(sw.postedBy)?.name,
        claimedByName: byId.get(sw.claimedBy)?.name,
      };
    }).sort((a, b) => Shift.byStart(a.shift, b.shift));
  }

  // UC-09
  decide(swapId, decision) {
    if (decision !== "approve" && decision !== "deny") return { error: "Approve or deny?" };
    const swap = this.repo.swaps().find((s) => s.id === swapId);
    if (!swap || swap.status !== "claimed") return { error: "Nothing to decide." };
    const period = this.repo.periodOfShift(swap.shiftId);
    const shift = period.shifts.find((s) => s.id === swap.shiftId);

    if (decision === "approve") {
      if (shift.date < this.repo.today()) return { error: "That shift already happened. Deny it to clear it." };
      const result = this.engine.validateAssignment(shift, swap.claimedBy, period, this.repo);
      if (result.blocking.length) {
        return { error: `Cannot approve. ${result.blocking[0].message}`, result };
      }
      shift.assign(swap.claimedBy);
      swap.status = "approved";
    } else {
      swap.status = "denied";
    }
    shift.status = "published";
    swap.decidedOn = this.repo.today();
    // the notices and audit entry are saved with the decision, or not at all
    this.repo.transaction(() => {
      this.repo.saveShift(shift);
      this.repo.saveSwap(swap);
      this.events.emit("swap.decided", { swap, shift });
    });
    return { ok: true };
  }

  // shift id -> the week it's in, loaded once
  #weeksByShift() {
    const map = new Map();
    this.repo.periods().forEach((p) => p.shifts.forEach((s) => map.set(s.id, p)));
    return map;
  }
}
module.exports = SwapController;
