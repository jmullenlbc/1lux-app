-- 0133: one row per sign in to the public budget tool (Mike 10-17: "record it
-- for data"). The work email typed on the password screen, its domain and the
-- device. Additive only.
CREATE TABLE "ConceptualSignIn" (
    "id"          TEXT NOT NULL,
    "email"       TEXT NOT NULL,
    "emailDomain" TEXT NOT NULL,
    "deviceKind"  TEXT NOT NULL DEFAULT 'desktop',
    "signedInAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConceptualSignIn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConceptualSignIn_emailDomain_idx" ON "ConceptualSignIn"("emailDomain");
CREATE INDEX "ConceptualSignIn_email_idx" ON "ConceptualSignIn"("email");
CREATE INDEX "ConceptualSignIn_signedInAt_idx" ON "ConceptualSignIn"("signedInAt");
