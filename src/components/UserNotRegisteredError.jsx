import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

const UserNotRegisteredError = () => {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', requested_category: 'unsure', notes: '' });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const submitRequest = async event => {
    event.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const existing = await base44.entities.AccessRequest.filter({ email: form.email.trim().toLowerCase(), status: 'pending' }).catch(() => []);
      if (!existing?.length) {
        await base44.entities.AccessRequest.create({ ...form, email: form.email.trim().toLowerCase(), status: 'pending' });
      }
      setStatus('sent');
    } catch (requestError) {
      setError(requestError?.message || 'Unable to submit the access request.');
      setStatus('idle');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070d16] p-4 text-slate-100">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-[#111827] p-7 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-3xl">🛡️</div>
          <h1 className="text-3xl font-black text-white">Access Restricted</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">Submit an access request. A Black Point administrator will review it and assign the correct Officer, Student, or Client portal.</p>
        </div>

        {status === 'sent' ? (
          <div className="mt-7 rounded-xl border border-emerald-600/40 bg-emerald-950/30 p-5 text-center">
            <p className="font-bold text-emerald-300">Request submitted</p>
            <p className="mt-2 text-sm text-emerald-100">Your request is now visible under Admin → Pending Users & Account Assignment.</p>
          </div>
        ) : (
          <form onSubmit={submitRequest} className="mt-7 space-y-4">
            <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Full Name</label><input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-white" /></div>
            <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Email</label><input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-white" /></div>
            <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-white" /></div>
            <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Requested Portal</label><select value={form.requested_category} onChange={e => setForm({ ...form, requested_category: e.target.value })} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-white"><option value="unsure">Administrator should decide</option><option value="officer">Officer</option><option value="student">Student</option><option value="client">Client</option></select></div>
            <div><label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Notes</label><textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-white" /></div>
            {error && <p className="rounded-lg border border-red-700/50 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>}
            <button disabled={status === 'sending'} className="w-full rounded-lg bg-[#c9a227] px-4 py-3 font-black text-black hover:bg-[#ddb940] disabled:opacity-60">{status === 'sending' ? 'Submitting…' : 'Request Access'}</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default UserNotRegisteredError;
