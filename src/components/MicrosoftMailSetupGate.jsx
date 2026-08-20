import { useEffect, useMemo, useState } from 'react';
import { Mail, ShieldCheck, Loader2, ExternalLink, AlertTriangle, Settings, CheckCircle2 } from 'lucide-react';
import {
  beginOutlookConnection,
  getMicrosoftMailConfig,
  getOutlookConnectionStatus,
  getOutlookRedirectUri,
  handleOutlookOAuthCallback,
  saveMicrosoftMailConfig,
} from '@/lib/outlookGraph';

export default function MicrosoftMailSetupGate({ user, children }) {
  const [status, setStatus] = useState({ loading: true, connected: false, configured: false });
  const [config, setConfig] = useState({ clientId: '', tenant: 'common' });
  const [clientIdInput, setClientIdInput] = useState('');
  const [tenantInput, setTenantInput] = useState('common');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const userId = user?.id;
  const isAdmin = user?.role === 'admin';
  const redirectUri = typeof window !== 'undefined' ? getOutlookRedirectUri() : '/OutlookMail';

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
        const currentConfig = await getMicrosoftMailConfig({ force: true });
        if (!active) return;
        setConfig(currentConfig || { clientId: '', tenant: 'common' });
        setClientIdInput(currentConfig?.clientId || '');
        setTenantInput(currentConfig?.tenant || 'common');

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
        setStatus({ loading: false, connected: false, configured: false });
        setError(err?.message || 'Unable to verify your Microsoft 365 connection.');
      }
    };

    load();
    const onConnectionChanged = () => load();
    const onConfigChanged = () => load();
    window.addEventListener('bps:outlook-connection-changed', onConnectionChanged);
    window.addEventListener('bps:microsoft-mail-config-changed', onConfigChanged);
    return () => {
      active = false;
      window.removeEventListener('bps:outlook-connection-changed', onConnectionChanged);
      window.removeEventListener('bps:microsoft-mail-config-changed', onConfigChanged);
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

  const saveConfiguration = async () => {
    try {
      setSaving(true);
      setError('');
      setSavedNotice('');
      const saved = await saveMicrosoftMailConfig({
        clientId: clientIdInput,
        tenant: tenantInput,
        updatedBy: user?.email || user?.id || '',
      });
      setConfig(saved);
      setStatus(current => ({ ...current, configured: true }));
      setSavedNotice('Microsoft configuration saved. Users can now connect their own mailbox.');
    } catch (err) {
      setError(err?.message || 'Unable to save the Microsoft configuration.');
    } finally {
      setSaving(false);
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
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-auto bg-[#050a12] p-4 py-8 text-white sm:items-center">
      <div className="w-full max-w-2xl rounded-2xl border border-[#294867] bg-[#0b1725] p-6 shadow-2xl sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-blue-500/50 bg-blue-950/40">
            <Mail className="h-7 w-7 text-blue-300" />
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">Required Account Setup</div>
            <h1 className="mt-1 text-2xl font-black">Connect your Microsoft 365 email</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Every Pathfinder user connects their own Outlook or Microsoft 365 account. Pathfinder never shares one user's mailbox connection with another user.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <div className="mt-2 text-sm font-bold">Your mailbox stays yours</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">Microsoft asks the individual user to sign in and approve only their own delegated mail access.</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <Mail className="h-5 w-5 text-blue-300" />
            <div className="mt-2 text-sm font-bold">Outlook inside Pathfinder</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">After connection, Outlook Mail opens inside Pathfinder for reading, sending, replying, forwarding and new-mail alerts.</p>
          </div>
        </div>

        {!status.configured && isAdmin && (
          <div className="mt-5 rounded-xl border border-amber-600/50 bg-amber-950/30 p-4 text-amber-100">
            <div className="flex items-center gap-2 text-sm font-black"><Settings className="h-4 w-4" /> ONE-TIME ADMIN SETUP</div>
            <p className="mt-2 text-sm leading-6">
              Before users can link Outlook, create a Microsoft Entra App Registration, add the redirect URI shown below as a <strong>Single-page application (SPA)</strong>, then paste its Application (client) ID here. You only do this once for Pathfinder.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-amber-200">
                Application (client) ID
                <input
                  type="text"
                  value={clientIdInput}
                  onChange={event => setClientIdInput(event.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className="mt-1 w-full rounded-lg border border-amber-700/60 bg-black/30 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-white outline-none focus:border-blue-400"
                />
              </label>

              <label className="block text-xs font-bold uppercase tracking-wider text-amber-200">
                Microsoft tenant
                <input
                  type="text"
                  value={tenantInput}
                  onChange={event => setTenantInput(event.target.value)}
                  placeholder="common"
                  className="mt-1 w-full rounded-lg border border-amber-700/60 bg-black/30 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-white outline-none focus:border-blue-400"
                />
              </label>

              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-amber-200">SPA redirect URI to register in Microsoft</div>
                <div className="mt-1 select-all break-all rounded-lg border border-amber-700/50 bg-black/30 px-3 py-2.5 font-mono text-xs text-white">{redirectUri}</div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-xs leading-5 text-slate-300">
              Microsoft Graph delegated permissions needed: <strong>User.Read</strong>, <strong>Mail.ReadWrite</strong>, and <strong>Mail.Send</strong>. The OAuth flow also requests <strong>openid</strong>, <strong>profile</strong>, and <strong>offline_access</strong>.
            </div>

            <button
              type="button"
              onClick={saveConfiguration}
              disabled={saving || !clientIdInput.trim()}
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 text-sm font-black text-black hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
              SAVE MICROSOFT CONFIGURATION
            </button>
          </div>
        )}

        {!status.configured && !isAdmin && (
          <div className="mt-5 rounded-xl border border-amber-600/50 bg-amber-950/30 p-4 text-sm text-amber-100">
            <div className="flex items-center gap-2 font-black"><AlertTriangle className="h-4 w-4" /> MICROSOFT MAIL SETUP IS NOT READY</div>
            <p className="mt-2 leading-6">A Pathfinder administrator must finish the one-time Microsoft Entra configuration before you can connect your mailbox. Once that is saved, this screen will automatically show the Microsoft sign-in button.</p>
          </div>
        )}

        {status.configured && (
          <div className="mt-5 rounded-xl border border-emerald-700/50 bg-emerald-950/20 p-4 text-sm text-emerald-100">
            <div className="flex items-center gap-2 font-black"><CheckCircle2 className="h-4 w-4" /> MICROSOFT CONNECTION READY</div>
            <p className="mt-2 leading-6">Click the button below. Microsoft will open its secure sign-in page. Sign in with the Outlook or Microsoft 365 mailbox you want connected to your Pathfinder account and approve the requested mail permissions.</p>
            {config?.tenant && <p className="mt-2 text-xs text-emerald-300">Tenant authority: {config.tenant}</p>}
          </div>
        )}

        {savedNotice && <div className="mt-4 rounded-lg border border-emerald-700/50 bg-emerald-950/30 p-3 text-sm text-emerald-200">{savedNotice}</div>}
        {error && <div className="mt-4 rounded-xl border border-red-700/60 bg-red-950/30 p-4 text-sm text-red-200">{error}</div>}

        <button
          type="button"
          onClick={connect}
          disabled={!status.configured}
          className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          <ExternalLink className="h-4 w-4" /> SIGN IN WITH MICROSOFT & CONNECT OUTLOOK
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">Pathfinder checks this connection after every sign-in. Users are prompted again only if their Microsoft authorization is missing, expired, revoked, or not available in that browser.</p>
      </div>
    </div>
  );
}
