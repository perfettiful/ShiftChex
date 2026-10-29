-- 004: notices get the date they were sent

ALTER TABLE notice ADD COLUMN created_on TEXT;

-- the swap board and approvals look shifts up by date across weeks
CREATE INDEX idx_shift_date ON shift (date);
