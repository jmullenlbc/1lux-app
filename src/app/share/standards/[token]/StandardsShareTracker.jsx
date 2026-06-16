'use client';
import { useEffect } from 'react';

export default function StandardsShareTracker({ token }) {
  useEffect(() => {
    fetch(`/api/share/standards/${token}`, { method: 'POST' }).catch(() => {});
  }, [token]);
  return null;
}
