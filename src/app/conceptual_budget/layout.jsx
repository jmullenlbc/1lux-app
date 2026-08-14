// Public conceptual-budget intake. No auth check, no Navbar — same pattern as
// the /share routes. Anything rendered under here is visible to the internet,
// so nothing on these pages may read session data or internal-only fields.
export default function IntakeLayout({ children }) {
  return children;
}
