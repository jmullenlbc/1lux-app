export const metadata = {
  title: 'Project Portal',
  description: 'Contractor and client project portal',
};

export default function PortalLayout({ children }) {
  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Minimal header */}
      <header className="bg-navy-950 px-6 py-3 flex items-center gap-3 shrink-0 z-10">
        <span className="text-orange-500 font-bold text-base tracking-tight">Project Portal</span>
        <span className="text-slate-500 text-sm">/ Project Portal</span>
      </header>
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
