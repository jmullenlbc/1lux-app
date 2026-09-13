import PublicBugButton from '@/components/public/PublicBugButton';

// Public conceptual-budget intake. No auth check, no Navbar — same pattern as
// the /share routes. Anything rendered under here is visible to the internet,
// so nothing on these pages may read session data or internal-only fields.
//
// PublicBugButton is the beta-client "Report a bug" button. It is mounted here
// rather than inside IntakeClient so it floats over every step of the form; it
// sends only what the visitor types plus the page URL and browser.
export default function IntakeLayout({ children }) {
  return (
    <>
      {children}
      <PublicBugButton />
    </>
  );
}
