import catalog from '../data/emergencyStations.json';

export const emergencyStations = catalog.stations;
export const stationAgencyLabels = { richmond: 'Richmond', henrico: 'Henrico', chesterfield: 'Chesterfield' };

export function getVisibleEmergencyStations(filters = {}) {
  return emergencyStations.filter(station => {
    if (filters[station.agency + 'Facilities'] === false) return false;
    const fireVisible = filters.showFireStations === true && station.kind !== 'rescue';
    const rescueVisible = filters.showRescueStations === true && station.kind !== 'fire';
    return fireVisible || rescueVisible;
  });
}

export function stationDescription(station) {
  return [
    station.name, station.address,
    station.battalion ? 'Battalion ' + station.battalion : '',
    station.companies || '',
  ].filter(Boolean).join(' · ');
}

export function stationDestination(station) {
  return { name: station.name, address: station.address, coords: [station.lat, station.lng] };
}
