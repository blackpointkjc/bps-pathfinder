import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowAlert(true);
      setTimeout(() => setShowAlert(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowAlert(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!showAlert) return null;

  return (
    <Alert 
      className={`fixed top-4 right-4 z-50 w-auto shadow-lg ${
        isOnline 
          ? 'bg-green-50 border-green-500 text-green-900' 
          : 'bg-amber-50 border-amber-500 text-amber-900'
      }`}
    >
      <div className="flex items-center gap-2">
        {isOnline ? (
          <Wifi className="w-5 h-5 text-green-600" />
        ) : (
          <WifiOff className="w-5 h-5 text-amber-600" />
        )}
        <AlertDescription>
          {isOnline ? 'Back online - syncing data...' : 'You are offline - data will sync when connected'}
        </AlertDescription>
      </div>
    </Alert>
  );
}