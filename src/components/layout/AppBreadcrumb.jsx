'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

// Static label map for known path segments
const SEGMENT_MAP = {
  dashboard:     { label: 'Dashboard',        href: '/dashboard' },
  'knowledge-base': { label: 'Knowledge Base', href: '/knowledge-base' },
  clients:       { label: 'Clients',           href: '/clients'   },
  manufacturers: { label: 'Manufacturers',     href: '/manufacturers' },
  products:      { label: 'Products',          href: '/products'  },
  'pre-con':     { label: 'Pre-Con',           href: '/pre-con'   },
  admin:         { label: 'Admin',             href: '/admin'     },
  pricing:       { label: 'Pricing',           href: null         },
  import:        { label: 'Import',            href: null         },
  changelog:     { label: 'Changelog',         href: null         },
  summary:       { label: 'Summary',           href: null         },
  tracker:       { label: 'Submittal Tracker', href: null         },
  wizard:        { label: 'Design Wizard',     href: null         },
  'peer-review': { label: 'Bid Matrix',        href: null         },
  new:           { label: 'New',               href: null         },
  project:       null, // skip — the project name is fetched directly
  users:         { label: 'Users',             href: null         },
};

function isCuid(s) {
  return /^c[a-z0-9]{20,}$/.test(s);
}

// Given the full path segments, determine what type an ID at position `idx` is
function resolveIdType(segments, idx) {
  const prev = segments[idx - 1];
  if (prev === 'project')       return 'project';
  if (prev === 'clients')       return 'client';
  if (prev === 'manufacturers') return 'manufacturer';
  if (prev === 'products')      return 'product';
  return null;
}

async function fetchName(type, id) {
  try {
    if (type === 'project') {
      const r = await fetch(`/api/projects/${id}`, { cache: 'no-store' });
      if (!r.ok) return null;
      const d = await r.json();
      return { name: d.name, clientName: d.client?.name, projectId: id };
    }
    if (type === 'client') {
      const r = await fetch(`/api/clients/${id}`, { cache: 'no-store' });
      if (!r.ok) return null;
      const d = await r.json();
      return { name: d.name };
    }
    if (type === 'manufacturer') {
      const r = await fetch(`/api/manufacturers/${id}`, { cache: 'no-store' });
      if (!r.ok) return null;
      const d = await r.json();
      return { name: d.name };
    }
  } catch { return null; }
  return null;
}

export default function AppBreadcrumb() {
  const pathname = usePathname();
  const [resolvedNames, setResolvedNames] = useState({});

  const segments = pathname.split('/').filter(Boolean);

  // Collect all IDs that need resolving
  useEffect(() => {
    const toFetch = [];
    segments.forEach((seg, idx) => {
      if (isCuid(seg)) {
        const type = resolveIdType(segments, idx);
        if (type) toFetch.push({ seg, type });
      }
    });
    if (toFetch.length === 0) return;

    let cancelled = false;
    Promise.all(toFetch.map(async ({ seg, type }) => {
      const result = await fetchName(type, seg);
      return { seg, result };
    })).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach(({ seg, result }) => { if (result) map[seg] = result; });
      setResolvedNames(map);
    });
    return () => { cancelled = true; };
  }, [pathname]);

  // Build crumb list
  const crumbs = [];

  // Always start with Dashboard
  crumbs.push({ label: 'Dashboard', href: '/dashboard' });

  let i = 0;
  while (i < segments.length) {
    const seg = segments[i];

    if (isCuid(seg)) {
      const type = resolveIdType(segments, i);
      const resolved = resolvedNames[seg];

      if (type === 'project') {
        // Insert client name before project if available
        if (resolved?.clientName) {
          crumbs.push({ label: resolved.clientName, href: null });
        }
        crumbs.push({
          label: resolved?.name || '…',
          href: `/project/${seg}`,
        });
      } else {
        crumbs.push({
          label: resolved?.name || '…',
          href: null,
        });
      }
    } else {
      const entry = SEGMENT_MAP[seg];
      if (entry === null) { i++; continue; } // skip (e.g. "project")
      if (entry === undefined) { i++; continue; } // unknown segment

      // Build href for this crumb
      let href = entry.href;
      if (!href) {
        // Build path up to this segment
        href = '/' + segments.slice(0, i + 1).join('/');
      }
      crumbs.push({ label: entry.label, href });
    }

    i++;
  }

  // Don't render if only "Dashboard" (we're on the dashboard itself)
  if (crumbs.length <= 1 && pathname === '/dashboard') return null;

  return (
    <div className="bg-white border-b border-slate-100 px-6 py-2 flex items-center gap-1.5 text-xs text-slate-400 print:hidden">
      {crumbs.map((crumb, idx) => (
        <span key={idx} className="flex items-center gap-1.5">
          {idx > 0 && <span className="text-slate-300">›</span>}
          {crumb.href && idx < crumbs.length - 1 ? (
            <Link href={crumb.href} className="hover:text-amber-600 transition-colors truncate max-w-[200px]">
              {crumb.label}
            </Link>
          ) : (
            <span className={idx === crumbs.length - 1 ? 'text-slate-600 font-medium truncate max-w-[200px]' : 'truncate max-w-[200px]'}>
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
