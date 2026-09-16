import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { syncOfflineDataToServer, OfflineStorage } from './OfflineStorage';
import OfflineIndicator from './OfflineIndicator';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';

// Legacy compatibility component. Pathfinder no longer registers a custom
// /service-worker.js because the project does not ship one. Release refreshes are
// handled explicitly by the global Refresh App control in Layout, which prevents a
// stale/failed worker registration from becoming another background timer.
export default function PWAManager() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const added = [];
    const addHeadElement = element => {
      document.head.appendChild(element);
      added.push(element);
      return element;
    };

    try {
      const themeColor = document.createElement('meta');
      themeColor.name = 'theme-color';
      themeColor.content = '#050a12';
      addHeadElement(themeColor);

      const favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.type = 'image/webp';
      favicon.href = '/black-point-shield.webp';
      addHeadElement(favicon);

      const appleIcon = document.createElement('link');
      appleIcon.rel = 'apple-touch-icon';
      appleIcon.href = '/black-point-shield.webp';
      addHeadElement(appleIcon);

      const manifest = {
        name: 'BPS Pathfinder',
        short_name: 'Pathfinder',
        description: 'Black Point Protection operations portal',
        start_url: '/',
        display: 'standalone',
        background_color: '#050a12',
        theme_color: '#050a12',
        icons: [
          { src: '/black-point-shield.webp', sizes: '512x512', type: 'image/webp', purpose: 'any maskable' },
          { src: '/black-point-shield.webp', sizes: '192x192', type: 'image/webp', purpose: 'any' },
        ],
      };
      const manifestURL = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/json' }));
      const manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      manifestLink.href = manifestURL;
      addHeadElement(manifestLink);
      document.title = 'BPS Pathfinder';

      return () => {
        added.forEach(element => {
          try { element.remove(); } catch {}
        });
        URL.revokeObjectURL(manifestURL);
      };
    } catch (error) {
      console.warn('PWA metadata setup error:', error);
      return undefined;
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      handleOfflineSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine) handleOfflineSync();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleOfflineSync = async () => {
    const unsyncedCount = OfflineStorage.getUnsyncedCount();
    if (unsyncedCount === 0) return;

    try {
      const result = await syncOfflineDataToServer(base44);
      if (result.success) {
        toast({
          title: 'Sync Complete',
          description: `${result.synced} offline item(s) synced successfully.`,
          duration: 3000,
        });
        queryClient.invalidateQueries({ queryKey: ['myShiftReports'] });
        queryClient.invalidateQueries({ queryKey: ['myIncidentReports'] });
        queryClient.invalidateQueries({ queryKey: ['myTrespassNotices'] });
        queryClient.invalidateQueries({ queryKey: ['myParkingViolations'] });
        queryClient.invalidateQueries({ queryKey: ['myMaintenanceReports'] });
      } else {
        toast({
          title: 'Sync Completed with Errors',
          description: `${result.synced} items synced, ${result.errors.length} failed.`,
          variant: 'destructive',
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Error syncing offline data:', error);
    }
  };

  void isOnline;
  return <OfflineIndicator />;
}
