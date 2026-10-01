-- Voice Training (Mike 9-30): out-of-office replies and calendar mail are set
-- aside from every voice library. Additive only: one nullable column saying why
-- a saved email was set aside on its own.
--   OUT_OF_OFFICE | CALENDAR   set aside by the relearn sweep
--   KEPT                        the person put it back; never set aside again
ALTER TABLE "VoiceSample" ADD COLUMN "archiveReason" TEXT;
