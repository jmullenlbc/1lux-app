'use client';

import Link from 'next/link';

// Without this file a crash anywhere on the project page shows Next's bare
// "Application error: a client-side exception has occurred" with nothing to
// go on (Maram, Marmalade, 9-18). Now the message and the digest are on screen
// so whoever hits it can tell us what it said.
export default function ProjectError({ error, reset }) {
  return (
    <div className="max-w-2xl mx-auto mt-16 p-6 bg-white border border-red-200 rounded-xl shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">This project page hit a problem</h1>
      <p className="mt-2 text-sm text-slate-600">
        The rest of the app is fine. Please copy the line below to Mike so it can be fixed.
      </p>
      <pre className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 whitespace-pre-wrap break-words">
        {error?.message || 'Unknown error'}{error?.digest ? `\nref: ${error.digest}` : ''}
      </pre>
      <div className="mt-4 flex gap-3">
        <button onClick={() => reset()} className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600">
          Try again
        </button>
        <Link href="/crm" className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Back to the pipeline</Link>
      </div>
    </div>
  );
}
