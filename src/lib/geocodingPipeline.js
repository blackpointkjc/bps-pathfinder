/**
 * Geocoding Pipeline — address normalization only.
 * NO frontend fetch to Nominatim or any geocoding service.
 * Geocoding must be triggered manually and handled by the backend function `geocodeCallAddress`.
 */

const AGENCY_SUFFIXES = {
    RPD:  'Richmond, VA',
    RFD:  'Richmond, VA',
    HPD:  'Henrico County, VA',
    CCPD: 'Chesterfield County, VA',
    CCFD: 'Chesterfield County, VA',
};

/**
 * Normalize a raw CAD location string into a clean geocodable address.
 * e.g. "CRASH , PROPERTY DAMAGE @ 1600 COMMERCE RD [RPD]" → "1600 Commerce Rd, Richmond, VA"
 */
export function normalizeAddress(rawLocation) {
    if (!rawLocation) return null;

    let addr = rawLocation;

    // Extract agency tag before stripping
    const agencyMatch = addr.match(/\[([A-Z]+)\]/);
    const agencyTag = agencyMatch ? agencyMatch[1] : null;
    const suffix = AGENCY_SUFFIXES[agencyTag] || 'Richmond, VA';

    // Strip agency tag [RPD], [CCFD], etc.
    addr = addr.replace(/\[[A-Z]+\]/g, '');

    // Strip incident prefix before @ (e.g. "CRASH , PROPERTY DAMAGE @ 1600 COMMERCE RD")
    if (addr.includes('@')) {
        addr = addr.split('@').slice(1).join('@');
    }

    // Replace intersections / and & with " and "
    addr = addr.replace(/\s*[\/&]\s*/g, ' and ');

    // Remove noise words
    addr = addr.replace(/\bblock\b/gi, '');
    addr = addr.replace(/\bRICH:/gi, '');

    // Title-case
    addr = addr.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

    // Collapse spaces, trim
    addr = addr.replace(/\s{2,}/g, ' ').trim().replace(/[,\-]+$/, '').trim();

    if (!addr) return null;

    return `${addr}, ${suffix}`;
}

/**
 * Returns calls split into mapped (have coords) and unmapped (missing coords).
 */
export function splitCallsByCoords(calls) {
    const mapped = [];
    const unmapped = [];
    for (const c of calls) {
        if (c.latitude && c.longitude && !isNaN(c.latitude) && !isNaN(c.longitude) &&
            c.latitude !== 0 && c.longitude !== 0) {
            mapped.push(c);
        } else {
            unmapped.push(c);
        }
    }
    return { mapped, unmapped };
}