-- 0084: somewhere to keep each person's notification choices.
--
-- The Profile screen's "Internal Notifications" switches have always saved to
-- User.notificationPrefs, but that column never existed, so every save failed
-- and everyone's choices were lost. Found 2026-09-14 in the admin and user
-- privileges review.
--
-- Purely additive: one new, empty, optional column. Nothing existing is touched.
-- PostgreSQL.

ALTER TABLE "User" ADD COLUMN "notificationPrefs" TEXT;
