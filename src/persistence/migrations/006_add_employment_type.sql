-- 006: full time or part time. part timers have a weekly hour cap, the partTimeMaxHours
-- setting that R12 checks

ALTER TABLE employee ADD COLUMN employment_type TEXT NOT NULL DEFAULT 'fullTime'
  CHECK (employment_type IN ('fullTime', 'partTime'));

-- a database that already has its demo data needs the setting too. a new one gets it from the seed
INSERT INTO setting (key, value)
  SELECT 'partTimeMaxHours', '32' WHERE EXISTS (SELECT 1 FROM organization);
