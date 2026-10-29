-- 005: withdrawn and cancelled swaps stay on record. sqlite can't change a CHECK, so the
-- table is rebuilt, and the unused note, shift.required and employee.status columns go

CREATE TABLE swap_request_new (
  id         TEXT PRIMARY KEY,
  shift_id   TEXT NOT NULL REFERENCES shift(id) ON DELETE CASCADE,
  posted_by  TEXT NOT NULL REFERENCES employee(id),
  claimed_by TEXT REFERENCES employee(id),
  status     TEXT NOT NULL DEFAULT 'posted'
             CHECK (status IN ('posted', 'claimed', 'approved', 'denied', 'withdrawn', 'cancelled')),
  posted_on  TEXT NOT NULL,
  decided_on TEXT
);
INSERT INTO swap_request_new (id, shift_id, posted_by, claimed_by, status, posted_on, decided_on)
  SELECT id, shift_id, posted_by, claimed_by, status, posted_on, decided_on FROM swap_request;
DROP TABLE swap_request;
ALTER TABLE swap_request_new RENAME TO swap_request;
CREATE INDEX idx_swap_status ON swap_request (status);

ALTER TABLE shift DROP COLUMN required;
ALTER TABLE employee DROP COLUMN status;
