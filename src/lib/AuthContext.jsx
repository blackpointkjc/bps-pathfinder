import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import { endOfficerLocationSession } from '@/lib/officerLocationHub';
import { cacheOfficerStatus } from '@/lib/officerStatusService';

// Keep one AuthContext instance across Vite/Base44 hot-module reloads. Without
// this, the provider can remain mounted with the previous module's context while
// a freshly reloaded Layout imports a new context object, producing the false
// "useAuth must be used within an AuthProvider" runtime error in editor preview.
const AUTH_CONTEXT_KEY = '__BPS_PATHFINDER_AUTH_CONTEXT__';
const AuthContext = globalThis[AUTH_CONTEXT_KEY] || createContext(null);
if (!globalThis[AUTH_CONTEXT_KEY]) globalThis[AUTH_CONTEXT_KEY] = AuthContext;

const microsoftSessionError = error => {
  const message = [
    error?.message,
    error?.data?.message,
    error?.data?.detail,
    error?.response?.data?.message,
    error?.response?.data?.detail,
  ].filter(Boolean).join(' ');
  return /microsoft_built_in|AADSTS700084|refresh token|microsoft.*authentication failed/i.test(message);
};

const withTimeout = (promise, milliseconds, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

export const AuthProvider = ({ children }) => {
  const requestSequence = useRef(0);
  const dutyStatusBootstrappedRef = useRef(false);
  const operationalSessionHeartbeatRef = useRef(Date.now());
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [accountLock, setAccountLock] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  const checkUserAuth = useCallback(async (requestId) => {
    try {
      setIsLoadingAuth(true);
      let currentUser = await withTimeout(base44.auth.me(), 12000, 'Authentication request');
      if (requestId !== requestSequence.current) return;

      // The User record already carries the linked work/Microsoft aliases.
      // Do not re-query MicrosoftTeamsIdentity and OutlookMailboxLink on every auth
      // refresh; those duplicate reads were a major startup request source.
      const cleanEmail = value => String(value || '').trim().toLowerCase();
      const authEmail = cleanEmail(currentUser.email);
      const workEmail = cleanEmail(currentUser.work_email || currentUser.pathfinder_email || authEmail);
      const microsoftEmail = cleanEmail(currentUser.microsoft_email || currentUser.outlook_email);
      currentUser = {
        ...currentUser,
        email: workEmail || authEmail,
        auth_email: authEmail,
        work_email: workEmail || authEmail,
        pathfinder_email: workEmail || authEmail,
        microsoft_email: microsoftEmail,
        outlook_email: cleanEmail(currentUser.outlook_email || currentUser.microsoft_email),
        email_aliases: [...new Set([authEmail, workEmail, microsoftEmail, ...(currentUser.email_aliases || [])].map(cleanEmail).filter(Boolean))],
      };

      // A newly loaded Pathfinder session starts field personnel Out of Service.
      // Officers/supervisors explicitly choose Available/Enroute/etc. themselves.
      const roleSet = new Set([currentUser.role, ...(currentUser.additional_roles || [])].filter(Boolean).map(value => String(value).toLowerCase()));
      const fieldRank = ['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','first sergeant','sergeant','corporal','senior officer','officer','unarmed officer'].includes(String(currentUser.rank || '').trim().toLowerCase());
      const operational = roleSet.has('officer') || roleSet.has('cad_access') || roleSet.has('supervisor') || currentUser.is_supervisor === true || fieldRank;
      if (operational && !dutyStatusBootstrappedRef.current) {
        dutyStatusBootstrappedRef.current = true;
        currentUser = { ...currentUser, status: 'Out of Service' };
        cacheOfficerStatus('Out of Service');
        void base44.functions.invoke('enforceOfficerDutyStatus', { action: 'session_start' })
          .catch(error => console.warn('[AUTH] Unable to initialize Out of Service status:', error?.message || error));
      }

      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);

      // Authentication is complete at this point. Account-lock verification is
      // important, but it must not keep the entire app behind the splash screen
      // when the normal-priority read queue is backing off after an unrelated
      // rate limit. Resolve it immediately in the background.
      void base44.entities.AccountLock.filter({ user_id: currentUser.id, locked: true }, '-locked_at', 1)
        .then(locks => {
          if (requestId !== requestSequence.current) return;
          setAccountLock(locks?.[0] || null);
        })
        .catch(lockError => {
          console.warn('[AUTH] Account lock check unavailable:', lockError?.message);
          if (requestId === requestSequence.current) setAccountLock(null);
        });
      return currentUser;
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      console.error('User auth check failed:', error);
      setUser(null);
      setIsAuthenticated(false);
      setAccountLock(null);
      if (microsoftSessionError(error)) {
        try { sessionStorage.removeItem('bps:auth-provider'); } catch {}
        setAuthError({
          type: 'microsoft_session_expired',
          message: 'Your Microsoft session has expired. Please sign in again with your BlackPoint email.'
        });
      } else if (error.status === 401 || error.status === 403) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      } else {
        setAuthError({
          type: 'unknown',
          message: error.message || 'Unable to verify the secure session'
        });
      }
      return null;
    } finally {
      if (requestId === requestSequence.current) setIsLoadingAuth(false);
    }
  }, []);

  const checkAppState = useCallback(async () => {
    const requestId = ++requestSequence.current;
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      // Authenticated sessions verify the user in parallel with public settings.
      // Public settings are required for login/error routing, but they must not
      // serialize signed-in startup behind a separate network request.
      const authPromise = appParams.token ? checkUserAuth(requestId) : Promise.resolve(null);
      
      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      const appClient = createAxiosClient({
        baseURL: `${appParams.serverUrl}/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token, // Include token if available
        interceptResponses: true
      });
      
      try {
        const publicSettings = await withTimeout(
          appClient.get(`/prod/public-settings/by-id/${appParams.appId}`),
          12000,
          'App settings request'
        );
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await authPromise;
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);
        const authenticatedUser = appParams.token ? await authPromise.catch(() => null) : null;
        if (authenticatedUser) {
          // A signed-in session can continue even when the public-settings
          // endpoint is temporarily slow/unavailable. Retry settings later rather
          // than trapping the entire app behind the splash screen.
          setIsLoadingPublicSettings(false);
          return;
        }
        
        // Handle app-level errors without exposing Microsoft/AADSTS internals.
        if (microsoftSessionError(appError)) {
          try { sessionStorage.removeItem('bps:auth-provider'); } catch {}
          setAuthError({
            type: 'microsoft_session_expired',
            message: 'Your Microsoft session has expired. Please sign in again with your BlackPoint email.'
          });
        } else if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  }, [checkUserAuth]);

  useEffect(() => {
    // Authenticate once when the application session starts. Merely minimizing,
    // Alt-Tabbing, switching tabs, or restoring the window must never put the
    // entire React tree back into a loading state and destroy in-progress work.
    checkAppState();

    const reconnect = () => {
      // A genuine offline -> online transition may require session recovery.
      if (navigator.onLine) checkAppState();
    };

    window.addEventListener('online', reconnect);

    return () => {
      requestSequence.current += 1;
      window.removeEventListener('online', reconnect);
    };
  }, [checkAppState]);

  // CAD administrators can terminate an officer's current Pathfinder session.
  // Realtime subscription makes the action immediate; polling and focus checks
  // provide a reliable fallback when the browser loses its live connection.
  const forcedSessionLogoutInProgress = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || !user?.id || !user?.email || forcedSessionLogoutInProgress.current) return;

    let active = true;
    let unsubscribe;
    const checkForcedSignOut = async () => {
      try {
        const controls = await base44.entities.UserSessionControl.filter({
          user_id: user.id,
          action: 'force_sign_out',
          active: true,
        }, '-issued_at', 5);
        if (!active || forcedSessionLogoutInProgress.current || !controls?.length) return;

        const now = Date.now();
        const control = controls.find(item => {
          const expiry = new Date(item.expires_at || '').getTime();
          return Number.isFinite(expiry) && expiry > now;
        });
        if (!control?.id) return;

        const handledKey = `bps:force-sign-out:${control.id}`;
        try {
          if (localStorage.getItem(handledKey) === 'handled') return;
          localStorage.setItem(handledKey, 'handled');
        } catch (_) {}

        forcedSessionLogoutInProgress.current = true;
        await logout(true);
      } catch (error) {
        console.warn('[AUTH] Force sign-out check unavailable:', error?.message);
      }
    };

    checkForcedSignOut();
    try {
      unsubscribe = base44.entities.UserSessionControl.subscribe(() => checkForcedSignOut());
    } catch (_) {}
    // Realtime is the primary path; this is only a dropped-subscription fallback.
    // Do not re-query on every window focus/Alt-Tab because that created request
    // bursts across several open Pathfinder windows.
    const interval = window.setInterval(checkForcedSignOut, 5 * 60 * 1000);

    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
      window.clearInterval(interval);
    };
  }, [isAuthenticated, user?.id, user?.email]);

  // A supervisor/dispatch/admin can force an officer Out of Service from the
  // Personnel page. That is a server-side duty-status override, so the target
  // browser must also be removed from the authenticated session. Poll only the
  // signed-in officer's own override (the entity RLS allows that record) and do
  // not poll the whole roster. This keeps the action reliable even when the
  // Personnel page is open on another device/browser.
  const forcedLogoutInProgress = useRef(false);
  useEffect(() => {
    // Admins manage overrides and must always be able to sign in to release
    // them. A forced OOS must never lock the admin who issued it out of the app.
    const isAdmin = user?.role === 'admin';
    if (!isAuthenticated || !user?.id || !user?.email || forcedLogoutInProgress.current || isAdmin) return;

    let active = true;
    let unsubscribe;
    const checkForcedOOS = async () => {
      try {
        const overrides = await base44.entities.OfficerStatusOverride.filter({ officer_id: user.id, active: true }, '-forced_at', 1);
        if (!active || forcedLogoutInProgress.current || !overrides?.length) return;

        forcedLogoutInProgress.current = true;
        // The server-side override has already changed the officer's User/Unit
        // status to Out of Service. Show the professional notice overlay and wait
        // for the officer to acknowledge before completing the sign-out redirect.
        try {
          window.dispatchEvent(new CustomEvent('bps:forced-oos', {
            detail: { reason: overrides[0]?.reason || 'An authorized user placed you Out of Service.' }
          }));
        } catch (_) {}
        // The overlay dispatches 'bps:forced-oos-acknowledged' when the officer
        // clicks "Acknowledge & Sign Out". Until then, keep the session open so
        // the message stays on screen.
      } catch (error) {
        // Do not log the officer out for a transient network/API failure. The
        // next interval will retry the authoritative server check.
        console.warn('[AUTH] Forced OOS check unavailable:', error?.message);
      }
    };

    checkForcedOOS();
    try {
      unsubscribe = base44.entities.OfficerStatusOverride.subscribe(event => {
        if (String(event?.data?.officer_id || '') === String(user.id)) checkForcedOOS();
      });
    } catch (_) {}
    // Realtime provides immediate delivery. Poll slowly only as a safety fallback.
    const interval = window.setInterval(checkForcedOOS, 2 * 60 * 1000);
    // When the officer acknowledges the forced-OOS notice, complete the sign-out.
    const onAck = () => logout(true);
    window.addEventListener('bps:forced-oos-acknowledged', onAck);
    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener('bps:forced-oos-acknowledged', onAck);
    };
  }, [isAuthenticated, user?.id, user?.email]);

  const logout = useCallback(async (shouldRedirect = true) => {
    // Before clearing the auth token, force duty status OOS and close the one
    // canonical live-location session. Pages never delete ActiveOfficer directly.
    try {
      const response = await base44.functions.invoke('enforceOfficerDutyStatus', { action: 'logout' });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
    } catch (error) {
      console.warn('[AUTH] Duty-status logout function failed:', error?.message);
    }
    try {
      await endOfficerLocationSession();
    } catch (locationError) {
      console.warn('[AUTH] Live-location session close failed:', locationError?.message);
    }

    setUser(null);
    setIsAuthenticated(false);
    setAccountLock(null);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return undefined;
    const roles = new Set([user.role, ...(user.additional_roles || [])].filter(Boolean).map(value => String(value).toLowerCase()));
    const rank = String(user.rank || '').trim().toLowerCase();
    const operational = roles.has('officer') || roles.has('cad_access') || roles.has('supervisor') || user.is_supervisor === true
      || ['colonel','lt colonel','lieutenant colonel','major','captain','lieutenant','first sergeant','sergeant','corporal','senior officer','officer','unarmed officer'].includes(rank);
    if (!operational) return undefined;

    const staleAfterMs = 8 * 60 * 60 * 1000;
    let signingOut = false;
    operationalSessionHeartbeatRef.current = Date.now();
    const markAlive = () => { if (!signingOut) operationalSessionHeartbeatRef.current = Date.now(); };
    const verifyResume = () => {
      if (signingOut) return;
      const age = Date.now() - Number(operationalSessionHeartbeatRef.current || 0);
      if (age >= staleAfterMs) {
        signingOut = true;
        cacheOfficerStatus('Out of Service');
        void logout(true);
        return;
      }
      markAlive();
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') verifyResume(); };
    const interval = window.setInterval(markAlive, 60_000);
    window.addEventListener('pageshow', verifyResume);
    window.addEventListener('focus', verifyResume);
    window.addEventListener('bps-background-location-tick', markAlive);
    window.addEventListener('bps-live-location-persisted', markAlive);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pageshow', verifyResume);
      window.removeEventListener('focus', verifyResume);
      window.removeEventListener('bps-background-location-tick', markAlive);
      window.removeEventListener('bps-live-location-persisted', markAlive);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isAuthenticated, user?.id, user?.role, user?.rank, user?.is_supervisor, user?.additional_roles, logout]);

  const navigateToLogin = useCallback(() => {
    try { sessionStorage.removeItem('bps:auth-provider'); } catch {}
    base44.auth.redirectToLogin(window.location.href);
  }, []);

  const navigateToMicrosoftLogin = useCallback(() => {
    // Base44's native provider creates the secure session. Linked identity
    // records preserve the existing Pathfinder user ID even when the Microsoft
    // work email differs from the user's original login name.
    try {
      sessionStorage.removeItem('bps:microsoft-auth-error');
      sessionStorage.setItem('bps:auth-provider', 'microsoft');
    } catch {}
    base44.auth.loginWithProvider('microsoft', window.location.href);
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      accountLock,
      appPublicSettings,
      logout,
      navigateToLogin,
      navigateToMicrosoftLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};