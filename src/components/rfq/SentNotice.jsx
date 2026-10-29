'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import { gmailComposeUrl, rfqNumber, showDate } from '@/lib/rfq/format';

// Shown right after an RFQ is made. The app does not send email itself yet,
// so this hands over the To, Subject and Body to copy, a Gmail draft with them
// filled in, and the PDF to attach.

function Copy({ label, text }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked; the text is on screen */ }
  }
  return <Button size="sm" variant="secondary" onClick={copy}>{done ? 'Copied' : `Copy ${label}`}</Button>;
}

export default function SentNotice({ projectId, rfq, email, onClose }) {
  const pdf = `/api/projects/${projectId}/rfqs/${rfq.id}/pdf`;
  return (
    <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <p className="font-semibold text-emerald-900">{rfqNumber(rfq.number)} is ready for {rfq.toName}</p>
          <p className="text-sm text-emerald-800">Lines are marked Sent. Need by {showDate(rfq.needBy)}. Download the PDF, then send the email with it attached.</p>
        </div>
        <button type="button" onClick={onClose} className="ml-auto text-sm text-emerald-800 hover:underline">Close</button>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <a href={`${pdf}?download=1`}><Button size="sm">Download PDF</Button></a>
        <a href={gmailComposeUrl(email)} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary">Open in Gmail</Button></a>
        <a href={pdf} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary">View PDF</Button></a>
        <Copy label="To" text={email.to} />
        <Copy label="Subject" text={email.subject} />
        <Copy label="Body" text={email.body} />
      </div>
      <details className="mt-3">
        <summary className="text-sm text-emerald-900 cursor-pointer">See the email</summary>
        <div className="mt-2 bg-white border border-emerald-100 rounded-lg p-3 text-sm text-slate-700 space-y-1">
          <p><span className="text-slate-500">To:</span> {email.to}</p>
          <p><span className="text-slate-500">Subject:</span> {email.subject}</p>
          <pre className="whitespace-pre-wrap font-sans">{email.body}</pre>
        </div>
      </details>
    </div>
  );
}
