'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Card, { CardHeader, CardBody } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import Input from '@/components/ui/Input';
import { CLIENT_TYPES, LOCATION_TYPES } from '@/lib/utils';

export default function NewClientPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', type: 'developer', locationType: 'standalone', notes: '' });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Client name is required'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), type: form.type, locationType: form.locationType, notes: form.notes || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create client'); return; }
      router.push('/dashboard');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-10">
      <div className="mb-8">
        <button onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h1 className="text-2xl font-bold text-slate-900">New Client</h1>
        <p className="text-slate-500 text-sm mt-1">Add a client to organize projects under.</p>
      </div>

      <Card>
        <CardHeader><h2 className="font-semibold text-slate-900">Client Details</h2></CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Client / Company Name *"
              placeholder="e.g., NexMetro Development"
              value={form.name}
              onChange={set('name')}
              autoFocus
            />

            <Select label="Organization Type" value={form.type} onChange={set('type')}>
              {CLIENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>

            <Select label="Location Type" value={form.locationType} onChange={set('locationType')}>
              {LOCATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
              <textarea
                rows={3}
                placeholder="Internal notes about this client..."
                value={form.notes}
                onChange={set('notes')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-700 resize-none"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-600">{error}</div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" variant="amber" size="lg" loading={loading}>Create Client</Button>
              <Button type="button" variant="secondary" size="lg" onClick={() => router.back()}>Cancel</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
