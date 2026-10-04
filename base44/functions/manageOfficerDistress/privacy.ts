// This exception belongs only to Colonel Hiers; all other accounts share live GPS.
export const LIVE_LOCATION_PRIVACY_USER_ID = '6a72bbee2842d6338cbae513';
export function canHideLiveLocation(user: any) {
  const rank = String(user?.rank || '').trim().toLowerCase().replace(/\s*\([^)]*\)\s*$/, '');
  return user?.id === LIVE_LOCATION_PRIVACY_USER_ID && user?.role === 'admin' && rank === 'colonel';
}
export async function isLiveLocationHidden(base44: any, user: any) {
  if (!canHideLiveLocation(user)) return false;
  const rows = await base44.asServiceRole.entities.LiveLocationPrivacy.filter({ user_id: user.id }, '-updated_date', 1);
  return rows?.[0]?.hidden === true;
}
export function stripLiveLocation(row: any) {
  const clean = { ...row, live_location_hidden: true, live_location_privacy_user_id: LIVE_LOCATION_PRIVACY_USER_ID, show_on_map: false, map_visible: false };
  for (const key of Object.keys(clean)) {
    if (/latitude|longitude|heading|speed|accuracy|gps_|last_gps|last_known/.test(key)) clean[key] = null;
  }
  clean.current_location = '';
  clean.location = '';
  clean.location_description = 'Live location hidden';
  return clean;
}
export const clearedLivePosition = {
  latitude: null, longitude: null, heading: null, speed: 0, accuracy: null,
  gps_updated_at: null, gps_source: '', gps_session_key: '', gps_device_id: '',
  reliable_latitude: null, reliable_longitude: null, reliable_accuracy: null,
  reliable_gps_updated_at: null, reliable_gps_source: '', reliable_session_key: '',
  gps_candidate_latitude: null, gps_candidate_longitude: null, gps_candidate_accuracy: null,
  gps_candidate_updated_at: null, gps_candidate_session_key: '', gps_candidate_count: 0,
  current_location: 'Live location hidden', live_location_hidden: true, live_location_privacy_user_id: LIVE_LOCATION_PRIVACY_USER_ID,
};
