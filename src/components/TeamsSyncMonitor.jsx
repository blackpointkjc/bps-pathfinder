import { useEffect } from 'react';
import { getTeamsSyncConfig, syncTeamsChannelToEntity } from '@/lib/teamsGraph';

const hasRole = (user, role) => {
  const roles = [user?.role, ...(user?.additional_roles || [])].filter(Boolean).map(value => String(value).toLowerCase());
  return roles.includes(String(role).toLowerCase());
};

export default function TeamsSyncMonitor({ user }) {
  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;

    const sync = async () => {
      try {
        const officerConfig = await getTeamsSyncConfig('officer_chat');
        if (!cancelled && officerConfig?.enabled) {
          await syncTeamsChannelToEntity(user.id, {
            config: officerConfig,
            configKey: 'officer_chat',
            entityName: 'ChatMessage',
          });
        }
      } catch (error) {
        console.warn('[Teams] Officer channel background sync unavailable:', error?.message);
      }

      if (hasRole(user, 'supervisor') || hasRole(user, 'full_access') || user?.role === 'admin') {
        try {
          const supervisorConfig = await getTeamsSyncConfig('supervisor_chat');
          if (!cancelled && supervisorConfig?.enabled) {
            await syncTeamsChannelToEntity(user.id, {
              config: supervisorConfig,
              configKey: 'supervisor_chat',
              entityName: 'SupervisorChatMessage',
            });
          }
        } catch (error) {
          console.warn('[Teams] Supervisor channel background sync unavailable:', error?.message);
        }
      }
    };

    sync();
    const interval = window.setInterval(sync, 90000);
    const onFocus = () => sync();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id, user?.role, JSON.stringify(user?.additional_roles || [])]);

  return null;
}
