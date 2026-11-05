const { Employee, Qualification } = require("../domain");
const { isDate } = require("../domain/format");

// Handles the manager adding employee to staff.
class StaffController {
  constructor(repo, events) { this.repo = repo; this.events = events; }

  // one role to start with. certs fall under the new hire grace window
  // they declare their own availability once they sign in (UC-01)
  add({ name, dateOfBirth, hireDate, roleId, hourlyRate, maxHoursPreference } = {}) {
    name = typeof name === "string" ? name.trim() : "";
    if (!name) return { error: "Enter their name." };
    if (name.length > 60) return { error: "That name is too long." };
    if (!isDate(dateOfBirth)) return { error: "Pick their date of birth." };
    if (!isDate(hireDate)) return { error: "Pick their hire date." };
    if (dateOfBirth >= hireDate) return { error: "The date of birth has to be before the hire date." };
    if (!this.repo.rolesById().has(roleId)) return { error: "Pick a role." };
    hourlyRate = Number(hourlyRate);
    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) return { error: "The hourly rate has to be more than $0." };
    let maxHours = null;
    if (maxHoursPreference !== undefined && maxHoursPreference !== null && maxHoursPreference !== "") {
      maxHours = Number(maxHoursPreference);
      if (!Number.isFinite(maxHours) || maxHours < 1 || maxHours > 80) return { error: "Max hours has to be 1 to 80." };
    }

    // Creator: we have the data they start with
    const employee = new Employee({ id: this.repo.nextId("employee"), name, dateOfBirth, hireDate,
      maxHoursPreference: maxHours });
    employee.qualifications = [new Qualification({ roleId, hourlyRate })];
    const username = this.repo.transaction(() => {
      const u = this.repo.addEmployee(employee);
      this.events.emit("employee.added", { employee });
      return u;
    });
    return { ok: true, employee: { id: employee.id, name: employee.name }, username };
  }
}
module.exports = StaffController;
