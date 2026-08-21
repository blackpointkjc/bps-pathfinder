import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { syncOfflineDataToServer, OfflineStorage } from './OfflineStorage';
import OfflineIndicator from './OfflineIndicator';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';

export default function PWAManager() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    // Register service worker - wrap in try/catch to prevent crashes
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register('/service-worker.js')
          .then((registration) => {
            console.log('Service Worker registered:', registration);

            // Check for updates periodically
            setInterval(() => {
              registration.update();
            }, 60000); // Check every minute
          })
          .catch((error) => {
            // Service worker registration failed - this is OK, app still works
            console.warn('Service Worker registration failed (this is OK):', error);
          });

        // Listen for service worker messages
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'SYNC_OFFLINE_DATA') {
            handleOfflineSync();
          }
        });
      }
    } catch (e) {
      console.warn('Service worker setup error:', e);
    }

    // Add theme color meta tag - wrap in try/catch
    try {
      const themeColor = document.createElement('meta');
      themeColor.name = 'theme-color';
      themeColor.content = '#1e40af';
      document.head.appendChild(themeColor);

      // Add favicon
      const favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.type = 'image/png';
      favicon.href = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/374fe6ac4_44CF61FA-A42C-41D4-AA78-E01E328319A9.png';
      document.head.appendChild(favicon);

      // Add apple touch icon
      const appleIcon = document.createElement('link');
      appleIcon.rel = 'apple-touch-icon';
      appleIcon.href = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/374fe6ac4_44CF61FA-A42C-41D4-AA78-E01E328319A9.png';
      document.head.appendChild(appleIcon);

      // Add PWA manifest
      const manifest = {
        "name": "Connect",
        "short_name": "Connect",
        "description": "Black Point Protection Security Portal",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#1e1e1e",
        "theme_color": "#1e40af",
        "icons": [
          {
            "src": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/374fe6ac4_44CF61FA-A42C-41D4-AA78-E01E328319A9.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "any maskable"
          },
          {
            "src": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/374fe6ac4_44CF61FA-A42C-41D4-AA78-E01E328319A9.png",
            "sizes": "192x192",
            "type": "image/png",
            "purpose": "any"
          },
          {
            "src": "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/374fe6ac4_44CF61FA-A42C-41D4-AA78-E01E328319A9.png",
            "sizes": "144x144",
            "type": "image/png"
          }
        ]
      };
      
      const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
      const manifestURL = URL.createObjectURL(manifestBlob);
      const manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      manifestLink.href = manifestURL;
      document.head.appendChild(manifestLink);

      // Update page title
      document.title = 'Connect';

      return () => {
        try {
          document.head.removeChild(themeColor);
          document.head.removeChild(favicon);
          document.head.removeChild(appleIcon);
          document.head.removeChild(manifestLink);
        } catch (e) {
          // Elements may already be removed
        }
      };
    } catch (e) {
      console.warn('Meta tag setup error:', e);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      handleOfflineSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Try to sync on mount if online
    if (navigator.onLine) {
      handleOfflineSync();
    }

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

        // Invalidate relevant queries to refresh data
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

  return <OfflineIndicator />;
}