// Central utility for critical call detection across the app
import { CALL_TYPES, classifyCall } from '@/lib/cadCallTypes';

/**
 * Evaluates if a call is critical based on:
 * 1. Classified call code priority (from 15 standard types)
 * 2. Priority field value
 * Returns true if critical, false otherwise
 */
export function isCriticalCall(callData) {
  if (!callData) return false;

  // Check priority field first
  if (callData.priority === 'critical') return true;

  // Classify by incident description
  const classified = classifyCall(callData.incident || '');
  if (classified.matched_type?.priority === 'critical') return true;

  return false;
}

/**
 * Gets all keywords from critical call types (01-10)
 */
export function getCriticalCallKeywords() {
  return CALL_TYPES.filter(t => t.priority === 'critical').flatMap(t => t.keywords);
}

/**
 * Calculate distance in meters between two coordinates (Haversine formula)
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Suggest three closest available units for a call
 * @param {Object} callData - The dispatch call
 * @param {Array} units - Available units with location
 * @returns {Array} - Three closest units sorted by distance
 */
export function suggestClosestUnits(callData, units) {
  if (!callData?.latitude || !callData?.longitude || !units?.length) return [];

  const unitsWithDistance = units
    .filter(u => u.current_latitude && u.current_longitude && u.status === 'Available')
    .map(u => ({
      ...u,
      distance: calculateDistance(
        callData.latitude,
        callData.longitude,
        u.current_latitude,
        u.current_longitude
      )
    }))
    .sort((a, b) => a.distance - b.distance);

  return unitsWithDistance.slice(0, 3);
}