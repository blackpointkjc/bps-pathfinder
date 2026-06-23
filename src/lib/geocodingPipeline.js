/**
 * Geocoding Pipeline
 * Runs BEFORE the map renders.
 * Fetches calls missing coords → normalizes address → geocodes → saves back to DB.
 */
import { base44 } from '@/api/base44Client';

// ─── STEP 2: normalizeAddress ────────────────────────────────────────────────
// Agency bracket → jurisdiction suffix map
const AGENCY_SUFFIXES = {
    RPD:  'Richmond, VA',
    RFD:  'Richmond, VA',
    HPD:  'Henrico County, VA',
    CCPD: 'Chesterfield County, VA',
    CCFD: 'Chesterfield County, VA',
};

export function normalizeAddress(rawLocation) {
    if (!rawLocation) return null;

    let addr = rawLocation;

    // Extract agency tag e.g. [RPD] before removing it
    const agencyMatch = addr.match(/\[([A-Z]+)\]/);
    const agencyTag = agencyMatch ? agencyMatch[1] : null;
    const suffix = AGENCY_SUFFIXES[agencyTag] || 'Richmond, VA'; // default Richmond

    // Strip agency tag
    addr = addr.replace(/\[[A-Z]+\]/g, '');

    // Strip incident prefix before @  (e.g. "CRASH , PROPERTY DAMAGE @ ...")
    if (addr.includes('@')) {
        addr = addr.split('@').slice(1).join('@');
    }

    // Replace ' / ' or ' & ' (intersection) with ' and '
    addr = addr.replace(/\s*[\/&]\s*/g, ' and ');

    // Remove noise words
    addr = addr.replace(/\bblock\b/gi, '');
    addr = addr.replace(/\bRICH:/gi, '');

    // Title-case
    addr = addr.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

    // Collapse duplicate spaces
    addr = addr.replace(/\s{2,}/g, ' ').trim();
    // Remove trailing commas/hyphens
    addr = addr.replace(/[,\-]+$/, '').trim();

    if (!addr) return null;

    return `${addr}, ${suffix}`;
}

// ─── STEP 3: geocodeAddress ──────────────────────────────────────────────────
// Uses Nominatim (OSM). Free, no key required, rate-limited to 1 req/sec.
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

async function geocodeAddress(cleanAddress) {
    const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(cleanAddress)}&format=json&limit=1&countrycodes=us`;
    const resp = await fetch(url, {
        headers: { 'Accept-Language': 'en-US', 'User-Agent': 'BPS-CAD/1.0' }
    });
    if (!resp.ok) throw new Error(`Nominatim HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.length) return { success: false };
    return {
        success: true,
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
        formattedAddress: data[0].display_name,
    };
}

// ─── STEP 5: processMissingCoordinates ──────────────────────────────────────
// Returns the refreshed list of calls (all with whatever coords we got).
export async function processMissingCoordinates(calls) {
    const missing = calls.filter(c =>
        !c.geocode_failed &&
        (!c.latitude || !c.longitude || isNaN(c.latitude) || isNaN(c.longitude) ||
         c.latitude === 0 || c.longitude === 0)
    );

    console.log(`[GEO] Starting geocode process`);
    console.log(`[GEO] ${missing.length} calls need coordinates`);

    if (missing.length === 0) {
        console.log(`[GEO] All calls already have coordinates — skipping`);
        return calls;
    }

    const updatedMap = {}; // id → patched call

    for (let i = 0; i < missing.length; i++) {
        const call = missing[i];
        const cleanAddr = normalizeAddress(call.location);

        if (!cleanAddr) {
            console.log(`[GEO] [${i + 1}/${missing.length}] Unmappable location: "${call.location}" — skipping`);
            try {
                await base44.entities.DispatchCall.update(call.id, { geocode_failed: true, geo_confidence: 'unmappable' });
            } catch (_) {}
            updatedMap[call.id] = { ...call, geocode_failed: true };
            continue;
        }

        console.log(`[GEO] [${i + 1}/${missing.length}] Geocoding: ${cleanAddr}`);

        try {
            // Nominatim: respect 1 req/sec rate limit
            if (i > 0) await new Promise(r => setTimeout(r, 1100));

            const result = await geocodeAddress(cleanAddr);

            if (result.success) {
                console.log(`[GEO] ✓ Success: ${cleanAddr} → (${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)})`);
                try {
                    await base44.entities.DispatchCall.update(call.id, {
                        latitude: result.latitude,
                        longitude: result.longitude,
                        geocoded: true,
                        geo_confidence: 'medium',
                        geo_method: 'street',
                    });
                    console.log(`[GEO] ✓ Saved coordinates for call ${call.id}`);
                    updatedMap[call.id] = {
                        ...call,
                        latitude: result.latitude,
                        longitude: result.longitude,
                        geocoded: true,
                    };
                } catch (saveErr) {
                    console.warn(`[GEO] ✗ Save failed for call ${call.id}:`, saveErr.message);
                    updatedMap[call.id] = {
                        ...call,
                        latitude: result.latitude,
                        longitude: result.longitude,
                    };
                }
            } else {
                console.log(`[GEO] ✗ No result for: ${cleanAddr}`);
                try {
                    await base44.entities.DispatchCall.update(call.id, { geocode_failed: true });
                } catch (_) {}
                updatedMap[call.id] = { ...call, geocode_failed: true };
            }
        } catch (err) {
            console.warn(`[GEO] ✗ Error geocoding "${cleanAddr}":`, err.message);
            updatedMap[call.id] = call;
        }
    }

    // Merge updates back into the calls array
    const merged = calls.map(c => updatedMap[c.id] ? updatedMap[c.id] : c);
    const withCoords = merged.filter(c => c.latitude && c.longitude && !isNaN(c.latitude));
    console.log(`[GEO] Refresh complete — ${withCoords.length}/${merged.length} calls have coordinates`);

    return merged;
}