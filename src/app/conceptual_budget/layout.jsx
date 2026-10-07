import PublicBugButton from '@/components/public/PublicBugButton';
import PasswordGate from '@/components/public/PasswordGate';
import { hasPublicBudgetAccess } from '@/lib/publicAccess';

export const dynamic = 'force-dynamic';

// Public conceptual-budget intake. No login, no Navbar, same pattern as the
// /share routes. Anything rendered under here is visible to the internet, so
// nothing on these pages may read session data or internal-only fields.
//
// Since 10-7 the tool sits behind one shared password (Mike: "password
// protected for now"). Admins set it on Admin > Users and settings; an empty
// password opens the tool again. Signed-in staff skip the gate.
//
// PublicBugButton is the beta-client "Report a bug" button. It is mounted here
// rather than inside IntakeClient so it floats over every step of the form; it
// sends only what the visitor types plus the page URL and browser.
export default async function IntakeLayout({ children }) {
  const allowed = await hasPublicBudgetAccess();
  return (
    <>
      {allowed ? children : <PasswordGate />}
      <PublicBugButton />
    </>
  );
}
