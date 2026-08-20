import React, { useEffect, useMemo, useState } from 'react';
import { Mail, ShieldCheck, Loader2, ExternalLink, AlertTriangle } from 'lucide-react';
import { beginOutlookConnection, getOutlookConnectionStatus, handleOutlookOAuthCallback, isMicrosoftConfigured } from '@/lib/outlookGraph';

export default function MicrosoftMailSetupGate({ user, children }) {
  const [status, setStatus] = useState({ loading: true, connected: false, configured: isMicrosoftConfigured() });
  const [error, setError] = useState('');
  const userId = user?.id;
  const isCallback = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.has('code') || params.has('error');
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;

    const load = async () => {
      try {
        setStatus(current => ({ ...current, loading: true }));
        if (isCallback) {
          const callback = await handleOutlookOAuthCallback(userId);
          if (callback.handled && !callback.success) setError(callback.error || 'Microsoft sign-in failed.');
        }
        const next = await getOutlookConnectionStatus(userId);
        if (!active) return;
        setStatus({ ...next, loading: false });
        if (next.connected) setError('');
      } catch (err) {
        if (!active) return;
        setStatus({ loading: false, connected: false, configured: isMicrosoftConfigured() });
        setError(err?.message || 'Unable to verify your Microsoft 365 connection.');
      }
    };

    load();
    const onConnectionChanged = () => load();
    window.addEventListener('bps:outlook-connection-changed', onConnectionChanged);
    return () => {
      active = false;
      window.removeEventListener('bps:outlook-connection-changed', onConnectionChanged);
    };
  }, [userId, isCallback]);

  const connect = async () => {
    try {
      setError('');
      await beginOutlookConnection(userId);
    } catch (err) {
      setError(err?.message || 'Unable to start Microsoft sign-in.');
    }
  };

  if (!userId) return children;
  if (status.loading) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#050a12] p-6 text-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-300" />
          <p className="mt-4 text-sm font-bold tracking-wide text-slate-300">VERIFYING MICROSOFT 365 MAIL</p>
        </div>
      </div>
    );
  }

  if (status.connected) return children;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-auto bg-[#050a12] p-4 text-white">
      <div className="w-full max-w-xl rounded-2xl border border-[#294867] bg-[#0b1725] p-6 shadow-2xl sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-blue-500/50 bg-blue-950/40">
            <Mail className="h-7 w-7 text-blue-300" />
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">Required Account Setup</div>
            <h1 className="mt-1 text-2xl font-black">Connect your Microsoft 365 email</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Pathfinder requires each signed-in user to connect their own Outlook or Microsoft 365 mailbox before entering the application.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <div className="mt-2 text-sm font-bold">Your mailbox stays yours</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">Each Pathfinder user signs into Microsoft separately. Mail is accessed under that user's delegated Microsoft permissions.</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <Mail className="h-5 w-5 text-blue-300" />
            <div className="mt-2 text-sm font-bold">Outlook inside Pathfinder</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">After connection, the user can open mail, send, reply, forward, manage unread messages, and receive new-mail alerts inside the app.</p>
          </div>
        </div>

        {!status.configured && (
          <div className="mt-5 rounded-xl border border-amber-600/50 bg-amber-950/30 p-4 text-sm text-amber-100">
            <div className="flex items-center gap-2 font-black"><AlertTriangle className="h-4 w-4" /> ADMIN CONFIGURATION REQUIRED</div>
            <p className="mt-2 leading-6">The Microsoft Entra application client ID has not been configured yet. Set <code className="rounded bg-black/30 px-1 py-0.5">VITE_MICROSOFT_CLIENT_ID</code> for this Base44 app, then register <code className="rounded bg-black/30 px-1 py-0.5">{typeof window !== 'undefined' ? `${window.location.origin}/OutlookMail` : '/OutlookMail'}</code> as a Single-page application redirect URI in Microsoft Entra.</p>
          </div>
        )}

        {error && <div className="mt-5 rounded-xl border border-red-700/60 bg-red-950/30 p-4 text-sm text-red-200">{error}</div>}

        <button
          type="button"
          onClick={connect}
          disabled={!status.configured}
          className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          <ExternalLink className="h-4 w-4" /> SIGN IN WITH MICROSOFT & CONNECT OUTLOOK
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">This setup is checked after every Pathfinder sign-in. A user is prompted again only when their Microsoft connection is missing, expired, revoked, or used from a browser where it has not been connected.</p>
      </div>
    </div>
  );
}
