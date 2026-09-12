-- 0074 — remember which prebuilt cards somebody took off a dashboard.
--
-- Mike, 2026-09-11: "Make it stick."
--
-- Prebuilt cards (Things Needing a Look, the pricing-calibration set) are added
-- to every dashboard automatically when it loads, by appendMissingPrebuilt() in
-- src/app/api/dashboards/route.js. That is how a new card reaches everybody
-- without anyone rebuilding a dashboard. The catch was that removing one never
-- lasted: nothing recorded that it had been removed, so the next load put it
-- straight back.
--
-- One row here means "this dashboard does not want this card". widgetKey is the
-- card's identity ("verification", "calibration:rateDrift" ...), not its title,
-- because a card can be retitled.
--
-- Purely additive. One new table, one unique index and two foreign keys. No
-- existing table, column, default or type is touched. The table starts empty,
-- so on the first load after this ships every dashboard looks exactly as it
-- did before.
--
-- Dashboard FK is ON DELETE CASCADE: "Reset to default" deletes a personal copy,
-- and its hidden list should go with it — that reset is the way to get every
-- card back at once. The User FK is ON DELETE SET NULL, as in 0073: losing the
-- name of who hid a card is fine, losing the decision is not.

CREATE TABLE "DashboardHiddenWidget" (
  "id"          TEXT NOT NULL,
  "dashboardId" TEXT NOT NULL,
  "widgetKey"   TEXT NOT NULL,
  "hiddenById"  TEXT,
  "hiddenAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DashboardHiddenWidget_pkey" PRIMARY KEY ("id")
);

-- One row per card per dashboard. Also serves every "what is hidden on this
-- dashboard" lookup, which always leads with dashboardId.
CREATE UNIQUE INDEX "DashboardHiddenWidget_dashboardId_widgetKey_key" ON "DashboardHiddenWidget"("dashboardId", "widgetKey");

ALTER TABLE "DashboardHiddenWidget" ADD CONSTRAINT "DashboardHiddenWidget_dashboardId_fkey"
  FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DashboardHiddenWidget" ADD CONSTRAINT "DashboardHiddenWidget_hiddenById_fkey"
  FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
