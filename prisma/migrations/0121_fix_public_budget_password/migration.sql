-- 0121: Mike 10-7 corrected the spelling of the public budget tool password.
-- Data only, no schema change. Only touches the row if nobody has changed it yet.
UPDATE "AppSetting"
SET "value" = 'Lightingbudget01', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'conceptual_budget_password' AND "value" = 'Lighitngbudget01';
