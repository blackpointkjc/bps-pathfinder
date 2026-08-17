const STATUS_WORDS = new Set([
    'ENROUTE', 'EN ROUTE', 'ARRIVED', 'ASSIGNED', 'DISPATCHED',
    'CLEARED', 'CLOSED', 'PENDING', 'NEW', 'ON SCENE', 'ONSCENE',
    'CANCELLED', 'CANCEL', 'ACTIVE', 'OPEN', 'UNKNOWN', 'UNKNOWN INCIDENT'
]);

/**
 * Returns a clean, human-readable incident name from a call record.
 * Strips scraper-injected timestamps and status words.
 */
function isRfdCall(call) {
    if (!call) return false;
    const agency = String(call.agency || '').trim().toUpperCase();
    if (agency === 'RFD' || agency.includes('RICHMOND FIRE')) return true;
    const units = Array.isArray(call.assigned_units) ? call.assigned_units : [];
    return units.some(unit => String(unit || '').trim().toUpperCase().startsWith('RFD'));
}

export function cleanIncident(call) {
    if (!call) return 'UNKNOWN';
    let name = call.incident || call.incident_type || call.call_type || '';

    // Strip trailing timestamps like "1:07 PM" or "13:45"
    name = name.replace(/\s+\d{1,2}:\d{2}(\s*(AM|PM))?\s*$/i, '').trim();

    // Strip leading status prefix like "ENROUTE - " or "ASSIGNED: "
    name = name.replace(/^(ENROUTE|ARRIVED|ASSIGNED|DISPATCHED|CLEARED|ACTIVE)\s*[-:]\s*/i, '').trim();

    // If what's left is just a status word, it's not a real incident type
    if (!name || STATUS_WORDS.has(name.toUpperCase())) {
        if (isRfdCall(call)) return 'Fire Service';
        // Try description (skip if it also looks like garbage)
        const desc = (call.description || '').split('\n')[0].trim();
        const descClean = desc.replace(/\s+\d{1,2}:\d{2}(\s*(AM|PM))?\s*$/i, '').trim();
        if (descClean && !STATUS_WORDS.has(descClean.toUpperCase()) && descClean.length > 3) {
            return descClean;
        }
        // Last resort: agency + INCIDENT or call_id
        if (call.agency) return `${call.agency} CALL`;
        if (call.call_id) return `CALL ${call.call_id}`;
        return 'INCIDENT';
    }

    return name;
}