import { useEffect, useMemo, useState } from 'react';
import { Mail, ShieldCheck, Loader2, ExternalLink, CheckCircle2 } from 'lucide-react';
import {
  beginOutlookConnection,
  getMicrosoftMailConfig,
  getOutlookConnectionStatus,
  handleOutlookOAuthCallback,
  handleOutlookOAuthMessage,
  getOutlookRedirectOrigin,
  getMissingMicrosoftScopes,
} from '@/lib/outlookGraph';

const MICROSOFT_VERIFICATION_TTL_MS = 6 * 60 * 60 * 1000;

function verificationKey(userId) {
  return `bps:microsoft-verified:${String(userId || '').trim()}`;
}

function readVerifiedSession(userId) {
  if (!userId || typeof window === 'undefined') return false;
  try {
    const saved = JSON.parse(sessionStorage.getItem(verificationKey(userId)) || 'null');
    return Boolean(saved?.connected && Date.now() - Number(saved?.verifiedAt || 0) < MICROSOFT_VERIFICATION_TTL_MS);
  } catch {
    return false;
  }
}

function rememberVerifiedSession(userId) {
  if (!userId || typeof window === 'undefined') return;
  sessionStorage.setItem(verificationKey(userId), JSON.stringify({ connected: true, verifiedAt: Date.now() }));
}

function forgetVerifiedSession(userId) {
  if (!userId || typeof window === 'undefined') return;
  sessionStorage.removeItem(verificationKey(userId));
}

export default function MicrosoftMailSetupGate({ user, children, enabled = true }) {
  const userId = user?.id;
  const [status, setStatus] = useState(() => readVerifiedSession(userId)
    ? { loading: false, connected: true, configured: true, sessionVerified: true }
    : { loading: true, connected: false, configured: true });
  const [config, setConfig] = useState({ clientId: '', tenant: '' });
  const [error, setError] = useState('');

  const isCallback = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.has('code') || params.has('error');
  }, []);

  useEffect(() => {
    if (!enabled || !userId) return;
    let active = true;

    const load = async ({ force = false } = {}) => {
      if (!force && !isCallback && readVerifiedSession(userId)) {
        setStatus({ loading: false, connected: true, configured: true, sessionVerified: true });
        return;
      }
      try {
        setStatus(current => ({ ...current, loading: !current.connected, configured: true }));
        const currentConfig = await getMicrosoftMailConfig();
        if (!active) return;
        setConfig(currentConfig || { clientId: '', tenant: '' });

        if (isCallback) {
          const callback = await handleOutlookOAuthCallback(userId);
          if (callback.handled && !callback.success) setError(callback.error || 'Microsoft sign-in failed.');
        }

        const next = await getOutlookConnectionStatus(userId, user?.email || '');
        if (!active) return;
        const missingScopes = next.connected ? getMissingMicrosoftScopes(userId) : [];
        const fullyConnected = Boolean(next.connected && missingScopes.length === 0);
        if (fullyConnected) rememberVerifiedSession(userId);
        else forgetVerifiedSession(userId);
        setStatus({ ...next, connected: fullyConnected, missingScopes, loading: false, configured: true });
        if (fullyConnected) setError('');
        else if (next.connected && missingScopes.length) setError(`Microsoft permissions changed. Reconnect once to activate Teams sync. Missing: ${missingScopes.join(', ')}`);
      } catch (err) {
        if (!active) return;
        forgetVerifiedSession(userId);
        setStatus({ loading: false, connected: false, configured: true });
        setError(err?.message || 'Unable to verify your Microsoft 365 connection.');
      }
    };

    load();
    const onConnectionChanged = () => load({ force: true });
    const onMicrosoftMessage = async event => {
      const sameOrigin = event.origin === window.location.origin;
      const productionOAuthOrigin = event.origin === getOutlookRedirectOrigin();
      if (!sameOrigin && !productionOAuthOrigin) return;

      if (event.data?.type === 'bps:outlook-oauth-callback' && productionOAuthOrigin) {
        try {
          const callback = await handleOutlookOAuthMessage(userId, event.data);
          if (callback.handled && !callback.success) {
            if (active) setError(callback.error || 'Microsoft sign-in failed.');
            return;
          }
          if (callback.success) {
            window.dispatchEvent(new CustomEvent('bps:outlook-connection-changed'));
          }
        } catch (err) {
          if (active) setError(err?.message || 'Unable to complete Microsoft sign-in.');
        }
        return;
      }

      if (event.data?.type === 'bps:outlook-connected' && (!event.data.userId || event.data.userId === userId)) load({ force: true });
    };
    const onStorage = event => {
      if (event.key !== `bps:outlook-token:${String(userId || '').trim()}`) return;
      if (event.newValue) load({ force: true });
      else {
        forgetVerifiedSession(userId);
        setStatus({ loading: false, connected: false, configured: true });
      }
    };
    window.addEventListener('bps:outlook-connection-changed', onConnectionChanged);
    window.addEventListener('message', onMicrosoftMessage);
    window.addEventListener('storage', onStorage);
    return () => {
      active = false;
      window.removeEventListener('bps:outlook-connection-changed', onConnectionChanged);
      window.removeEventListener('message', onMicrosoftMessage);
      window.removeEventListener('storage', onStorage);
    };
  }, [enabled, userId, user?.email, isCallback]);

  const connect = async () => {
    try {
      setError('');
      await beginOutlookConnection(userId);
    } catch (err) {
      setError(err?.message || 'Unable to start Microsoft sign-in.');
    }
  };

  if (!enabled || !userId) return children;

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
            <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">Microsoft 365 Required</div>
            <h1 className="mt-1 text-2xl font-black">Connect your Black Point Microsoft account</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Pathfinder is already configured for the Black Point Microsoft tenant. No client ID, tenant ID, keys, or administrator setup is required from users.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <div className="mt-2 text-sm font-bold">Organization controlled</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">Microsoft authentication is restricted to the Black Point Entra tenant configured for Pathfinder.</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <Mail className="h-5 w-5 text-blue-300" />
            <div className="mt-2 text-sm font-bold">Your own Outlook mailbox</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">Sign in with your assigned Black Point Microsoft account to open that mailbox inside Pathfinder.</p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-emerald-700/50 bg-emerald-950/20 p-4 text-sm text-emerald-100">
          <div className="flex items-center gap-2 font-black"><CheckCircle2 className="h-4 w-4" /> MICROSOFT CONNECTION READY</div>
          <p className="mt-2 leading-6">Click below and Microsoft will open its secure sign-in page. Pathfinder automatically supplies the application, tenant, Outlook, shared-mailbox, and Teams permissions in the background.</p>
          {config?.tenant && <p className="mt-2 text-xs text-emerald-300">Black Point tenant configured.</p>}
        </div>

        {error && <div className="mt-4 rounded-xl border border-red-700/60 bg-red-950/30 p-4 text-sm text-red-200">{error}</div>}

        <button
          type="button"
          onClick={connect}
          className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-500"
        >
          <ExternalLink className="h-4 w-4" /> SIGN IN WITH MICROSOFT & CONNECT OUTLOOK
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">No Microsoft IDs or keys are entered by the user.</p>
      </div>
    </div>
  );
}
