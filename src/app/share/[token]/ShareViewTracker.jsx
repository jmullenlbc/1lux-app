'use client';
import { useEffect } from 'react';

export default function ShareViewTracker({ token }) {
  useEffect(() => {
    // Fire once on mount — logs IP + user-agent server-side
    fetch(`/api/share/${token}`, { method: 'POST' }).catch(() => {});
  }, [token]);

  return null;
}
