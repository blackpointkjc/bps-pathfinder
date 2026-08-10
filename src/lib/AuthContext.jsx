import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';

// Keep one AuthContext instance across Vite/Base44 hot-module reloads. Without
// this, the provider can remain mounted with the previous module's context while
// a freshly reloaded Layout imports a new context object, producing the false
// "useAuth must be used within an AuthProvider" runtime error in editor preview.
const AUTH_CONTEXT_KEY = '__BPS_PATHFINDER_AUTH_CONTEXT__';
const AuthContext = globalThis[AUTH_CONTEXT_KEY] || createContext(null);
if (!globalThis[AUTH_CONTEXT_KEY]) globalThis[AUTH_CONTEXT_KEY] = AuthContext;

const withTimeout = (promise, milliseconds, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

export const AuthProvider = ({ children }) => {
  const requestSequence = useRef(0);
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
      const currentUser = await withTimeout(base44.auth.me(), 12000, 'Authentication request');
      if (requestId !== requestSequence.current) return;
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
      try {
        const locks = await base44.entities.AccountLock.filter({ user_id: currentUser.id, locked: true }, '-locked_at', 1);
        if (requestId !== requestSequence.current) return;
        setAccountLock(locks?.[0] || null);
      } catch (lockError) {
        // A lock-check failure must not accidentally lock everyone out. Retry on
        // the next authentication check instead.
        console.warn('[AUTH] Account lock check unavailable:', lockError?.message);
        setAccountLock(null);
      }
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      console.error('User auth check failed:', error);
      setUser(null);
      setIsAuthenticated(false);
      setAccountLock(null);
      if (error.status === 401 || error.status === 403) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      } else {
        setAuthError({
          type: 'unknown',
          message: error.message || 'Unable to verify the secure session'
        });
      }
    } finally {
      if (requestId === requestSequence.current) setIsLoadingAuth(false);
    }
  }, []);

  const checkAppState = useCallback(async () => {
    const requestId = ++requestSequence.current;
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
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
          await checkUserAuth(requestId);
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);
        
        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
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

  // A supervisor/dispatch/admin can force an officer Out of Service from the
  // Personnel page. That is a server-side duty-status override, so the target
  // browser must also be removed from the authenticated session. Poll only the
  // signed-in officer's own override (the entity RLS allows that record) and do
  // not poll the whole roster. This keeps the action reliable even when the
  // Personnel page is open on another device/browser.
  const forcedLogoutInProgress = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || !user?.id || !user?.email || forcedLogoutInProgress.current) return;

    let active = true;
    const checkForcedOOS = async () => {
      try {
        const overrides = await base44.entities.OfficerStatusOverride.filter({ officer_id: user.id, active: true }, '-forced_at', 1);
        if (!active || forcedLogoutInProgress.current || !overrides?.length) return;

        forcedLogoutInProgress.current = true;
        // Give the browser one short moment to persist UI state before the auth
        // redirect. The server-side override has already changed the officer's
        // User/Unit status to Out of Service.
        try {
          window.dispatchEvent(new CustomEvent('bps:forced-oos', {
            detail: { reason: overrides[0]?.reason || 'An authorized user placed you Out of Service.' }
          }));
        } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, 150));
        if (!active) return;
        await logout(true);
      } catch (error) {
        // Do not log the officer out for a transient network/API failure. The
        // next interval will retry the authoritative server check.
        console.warn('[AUTH] Forced OOS check unavailable:', error?.message);
      }
    };

    checkForcedOOS();
    const interval = window.setInterval(checkForcedOOS, 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isAuthenticated, user?.id, user?.email]);

  const logout = useCallback(async (shouldRedirect = true) => {
    // Before clearing the auth token, force any CAD officer Out of Service so
    // logout can never leave a ghost Available unit on dispatch/status boards.
    try {
      await base44.functions.invoke('enforceOfficerDutyStatus', { action: 'logout' });
    } catch (error) {
      console.warn('[AUTH] Unable to force Out of Service before logout:', error?.message);
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
  }, []);

  const navigateToLogin = useCallback(() => {
    base44.auth.redirectToLogin(window.location.href);
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
