export const metadata = {
  title: 'ILC Studios Project Portal',
  description: 'Contractor and client project portal',
};

export default function PortalLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Minimal header */}
      <header className="bg-[#0a1929] px-6 py-4 flex items-center gap-3">
        <span className="text-[#f97316] font-bold text-lg tracking-tight">ILC Studios</span>
        <span className="text-slate-500 text-sm">/ Project Portal</span>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
