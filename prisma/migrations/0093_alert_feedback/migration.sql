-- Alert feedback: two buttons on every notification, one row per click,
-- plus the per-person "stop sending me this kind" switch.

CREATE TABLE "AlertFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertId" TEXT,
    "alertType" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AlertFeedback_alertType_verdict_idx" ON "AlertFeedback"("alertType", "verdict");
CREATE INDEX "AlertFeedback_userId_alertType_idx" ON "AlertFeedback"("userId", "alertType");

ALTER TABLE "AlertFeedback" ADD CONSTRAINT "AlertFeedback_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AlertMute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "mutedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertMute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlertMute_userId_alertType_key" ON "AlertMute"("userId", "alertType");

ALTER TABLE "AlertMute" ADD CONSTRAINT "AlertMute_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
