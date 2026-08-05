// Offline storage utilities for PWA functionality with cross-device sync support

const OFFLINE_STORAGE_KEY = 'virtusconnect-offline-data';
const DEVICE_ID_KEY = 'virtusconnect-device-id';

// Get or create a unique device ID
const getDeviceId = () => {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

export const OfflineStorage = {
  // Save data to offline storage AND cloud for cross-device access
  saveOfflineData: async (type, data, base44 = null) => {
    try {
      const existingData = OfflineStorage.getOfflineData();
      const deviceId = getDeviceId();
      const newItem = {
        id: `offline-${Date.now()}-${Math.random()}`,
        type,
        data,
        timestamp: new Date().toISOString(),
        synced: false,
        deviceId
      };

      existingData.push(newItem);
      localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(existingData));
      
      // Also save to cloud for cross-device access if base44 is available and we're online
      if (base44 && navigator.onLine) {
        try {
          await base44.entities.OfflineSync.create({
            sync_type: 'pending_submission',
            entity_type: type,
            draft_data: data,
            device_id: deviceId,
            last_edited: new Date().toISOString(),
            synced: false
          });
        } catch (cloudError) {
          console.log('Saved locally, will sync to cloud later:', cloudError);
        }
      }
      
      // Register for background sync if available
      if ('serviceWorker' in navigator && 'sync' in navigator.serviceWorker) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.sync.register('sync-offline-data');
        });
      }

      return newItem;
    } catch (error) {
      console.error('Error saving offline data:', error);
      return null;
    }
  },

  // Save draft data for cross-device continuation
  saveDraft: async (entityType, draftData, base44) => {
    try {
      const deviceId = getDeviceId();
      
      // Save to cloud immediately if online
      if (base44 && navigator.onLine) {
        await base44.entities.OfflineSync.create({
          sync_type: 'draft',
          entity_type: entityType,
          draft_data: draftData,
          device_id: deviceId,
          last_edited: new Date().toISOString(),
          synced: false
        });
      }
      
      // Also save locally as backup
      const draftKey = `draft-${entityType}`;
      localStorage.setItem(draftKey, JSON.stringify({
        data: draftData,
        timestamp: new Date().toISOString()
      }));
      
      return true;
    } catch (error) {
      console.error('Error saving draft:', error);
      return false;
    }
  },

  // Load most recent draft from any device
  loadDraft: async (entityType, base44) => {
    try {
      // Try to get from cloud first (cross-device)
      if (base44 && navigator.onLine) {
        const user = await base44.auth.me();
        const cloudDrafts = await base44.entities.OfflineSync.filter({
          sync_type: 'draft',
          entity_type: entityType,
          created_by: user.email,
          synced: false
        }, '-last_edited', 1);
        
        if (cloudDrafts && cloudDrafts.length > 0) {
          return cloudDrafts[0].draft_data;
        }
      }
      
      // Fallback to local storage
      const draftKey = `draft-${entityType}`;
      const localDraft = localStorage.getItem(draftKey);
      return localDraft ? JSON.parse(localDraft).data : null;
    } catch (error) {
      console.error('Error loading draft:', error);
      return null;
    }
  },

  // Clear draft after successful submission
  clearDraft: async (entityType, base44) => {
    try {
      // Clear from cloud
      if (base44 && navigator.onLine) {
        const user = await base44.auth.me();
        const cloudDrafts = await base44.entities.OfflineSync.filter({
          sync_type: 'draft',
          entity_type: entityType,
          created_by: user.email,
          synced: false
        });
        
        for (const draft of cloudDrafts) {
          await base44.entities.OfflineSync.update(draft.id, { synced: true });
        }
      }
      
      // Clear local
      const draftKey = `draft-${entityType}`;
      localStorage.removeItem(draftKey);
    } catch (error) {
      console.error('Error clearing draft:', error);
    }
  },

  // Get all offline data
  getOfflineData: () => {
    try {
      const data = localStorage.getItem(OFFLINE_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting offline data:', error);
      return [];
    }
  },

  // Get unsynced items
  getUnsyncedData: () => {
    const allData = OfflineStorage.getOfflineData();
    return allData.filter(item => !item.synced);
  },

  // Mark item as synced
  markAsSynced: (id) => {
    try {
      const allData = OfflineStorage.getOfflineData();
      const updatedData = allData.map(item => 
        item.id === id ? { ...item, synced: true } : item
      );
      localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(updatedData));
    } catch (error) {
      console.error('Error marking as synced:', error);
    }
  },

  // Remove synced items older than 7 days
  cleanupSyncedData: () => {
    try {
      const allData = OfflineStorage.getOfflineData();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const cleanedData = allData.filter(item => {
        if (!item.synced) return true;
        const itemDate = new Date(item.timestamp);
        return itemDate > sevenDaysAgo;
      });

      localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(cleanedData));
    } catch (error) {
      console.error('Error cleaning up synced data:', error);
    }
  },

  // Get count of unsynced items
  getUnsyncedCount: () => {
    return OfflineStorage.getUnsyncedData().length;
  },

  // Clear all offline data (use with caution)
  clearAllOfflineData: () => {
    try {
      localStorage.removeItem(OFFLINE_STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing offline data:', error);
    }
  }
};

// Hook for syncing offline data with cross-device support
export const syncOfflineDataToServer = async (base44) => {
  const unsyncedData = OfflineStorage.getUnsyncedData();
  
  // Also pull unsynced data from cloud that was created on other devices
  let cloudUnsyncedData = [];
  try {
    if (navigator.onLine) {
      const user = await base44.auth.me();
      cloudUnsyncedData = await base44.entities.OfflineSync.filter({
        sync_type: 'pending_submission',
        created_by: user.email,
        synced: false
      });
    }
  } catch (error) {
    console.log('Could not fetch cloud data:', error);
  }
  
  if (unsyncedData.length === 0 && cloudUnsyncedData.length === 0) {
    return { success: true, synced: 0 };
  }

  let syncedCount = 0;
  const errors = [];

  // Sync local unsynced data
  for (const item of unsyncedData) {
    try {
      switch (item.type) {
        case 'trespass_notice':
          await base44.entities.TrespassingNotice.create(item.data);
          break;
        case 'incident_report':
          await base44.entities.IncidentReport.create(item.data);
          break;
        case 'shift_report':
          await base44.entities.ShiftReport.create(item.data);
          break;
        case 'maintenance_report':
          await base44.entities.MaintenanceReport.create(item.data);
          break;
        case 'parking_violation':
          await base44.entities.ParkingViolation.create(item.data);
          break;
        default:
          console.warn('Unknown offline data type:', item.type);
      }

      OfflineStorage.markAsSynced(item.id);
      syncedCount++;
    } catch (error) {
      console.error(`Error syncing item ${item.id}:`, error);
      errors.push({ item, error: error.message });
    }
  }

  // Sync cloud unsynced data (from other devices)
  for (const cloudItem of cloudUnsyncedData) {
    try {
      switch (cloudItem.entity_type) {
        case 'trespass_notice':
          await base44.entities.TrespassingNotice.create(cloudItem.draft_data);
          break;
        case 'incident_report':
          await base44.entities.IncidentReport.create(cloudItem.draft_data);
          break;
        case 'shift_report':
          await base44.entities.ShiftReport.create(cloudItem.draft_data);
          break;
        case 'maintenance_report':
          await base44.entities.MaintenanceReport.create(cloudItem.draft_data);
          break;
        case 'parking_violation':
          await base44.entities.ParkingViolation.create(cloudItem.draft_data);
          break;
        default:
          console.warn('Unknown cloud sync type:', cloudItem.entity_type);
      }

      await base44.entities.OfflineSync.update(cloudItem.id, { synced: true });
      syncedCount++;
    } catch (error) {
      console.error(`Error syncing cloud item ${cloudItem.id}:`, error);
      errors.push({ item: cloudItem, error: error.message });
    }
  }

  // Cleanup old synced data
  OfflineStorage.cleanupSyncedData();

  return {
    success: errors.length === 0,
    synced: syncedCount,
    errors
  };
};