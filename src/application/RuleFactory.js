const R = require("../domain/rules");

// Factory: builds the rule tree + thresholds so the engine doesn't have to
class RuleFactory {
  static rulesFor(_organization) {
    const blocking = new R.CompositeRule("blocking", "Rules that stop publishing", [
      new R.AvailabilityRule(),
      new R.TimeOffRule(),
      new R.RestRule(),
      new R.MinorHoursRule(),
      new R.QualificationRule(),
      new R.CertificationRule(),
      new R.CoverageRule(),
      new R.OnSiteCertRule(),
    ]);
    const warnings = new R.CompositeRule("warnings", "Rules that only warn", [
      new R.OvertimeRule(),
      new R.BudgetRule(),
      new R.NoticeRule(),
    ]);
    return new R.CompositeRule("all", "All rules", [blocking, warnings]);
  }
}
module.exports = RuleFactory;
