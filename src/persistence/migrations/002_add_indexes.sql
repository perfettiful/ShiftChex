-- 002: indexes for the lookups the rules and the swap board do a lot

CREATE INDEX idx_shift_period    ON shift (period_id);
CREATE INDEX idx_shift_employee  ON shift (employee_id);
CREATE INDEX idx_qual_role       ON qualification (role_id);
CREATE INDEX idx_cert_employee   ON certificate (employee_id);
CREATE INDEX idx_avail_employee  ON availability (employee_id);
CREATE INDEX idx_timeoff_emp     ON time_off_request (employee_id);
CREATE INDEX idx_swap_status     ON swap_request (status);
CREATE INDEX idx_notice_employee ON notice (employee_id);
