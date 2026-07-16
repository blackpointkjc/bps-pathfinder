import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Jurisdiction boundaries (rough bounding boxes) ───────────────────────────
const JURISDICTION_BOUNDS = {
    richmond:     { minLat: 37.456, maxLat: 37.618, minLon: -77.519, maxLon: -77.373 },
    henrico:      { minLat: 37.490, maxLat: 37.680, minLon: -77.690, maxLon: -77.340 },
    chesterfield: { minLat: 37.230, maxLat: 37.490, minLon: -77.750, maxLon: -77.280 },
};

// Default center points for each jurisdiction (fallback of last resort)
const JURISDICTION_CENTERS = {
    richmond:     { lat: 37.5407, lon: -77.4360 },
    henrico:      { lat: 37.5930, lon: -77.5000 },
    chesterfield: { lat: 37.3600, lon: -77.5400 },
};

// ─── Determine jurisdiction from agency string ─────────────────────────────────
function getJurisdiction(agency = '', location = '') {
    const ag = agency.toUpperCase();
    const loc = location.toUpperCase();
    if (ag.includes('HENRICO') || ag.includes('HPD') || ag.includes('HCPD') || ag.includes('HFD') || ag.includes('HCFD'))
        return 'henrico';
    if (ag.includes('CHESTERFIELD') || ag.includes('CCPD') || ag.includes('CFD') || ag.includes('CCFD'))
        return 'chesterfield';
    if (loc.includes('HENRICO')) return 'henrico';
    if (loc.includes('CHESTERFIELD')) return 'chesterfield';
    return 'richmond';
}

// ─── Validate a lat/lon falls within a jurisdiction boundary ──────────────────
function withinBounds(lat, lon, jurisdiction) {
    const b = JURISDICTION_BOUNDS[jurisdiction];
    if (!b) return true; // Unknown jurisdiction, allow
    return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon;
}

// ─── Parse location string into structured components ─────────────────────────
function parseLocation(location) {
    const loc = location.trim();

    // Intersection: "STREET A / STREET B" or "STREET A & STREET B"
    if (/[\/&]/.test(loc)) {
        const parts = loc.split(/[\/&]/).map(s => s.trim()).filter(Boolean);
        if (parts.length === 2) {
            return { type: 'intersection', street1: parts[0], street2: parts[1] };
        }
    }

    // Block address: "1600 Block WILLOW LAWN DR" or "7700 Block E Parham Rd"
    const blockMatch = loc.match(/^(\d+)\s+(?:Block\s+)?(.+)$/i);
    if (blockMatch) {
        const blockNum = parseInt(blockMatch[1]);
        const street = blockMatch[2].trim();
        // Round to nearest 100 for block midpoint
        const blockMidpoint = Math.floor(blockNum / 100) * 100 + 50;
        return { type: 'block', blockNum, blockMidpoint, street, fullAddress: `${blockMidpoint} ${street}` };
    }

    // Plain street name only
    return { type: 'street', street: loc };
}

// ─── Census Geocoder ──────────────────────────────────────────────────────────
async function censuGeocode(addressStr) {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(addressStr)}&benchmark=2020&format=json`;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) { await sleep(2000); continue; }
            const data = await res.json();
            const match = data?.result?.addressMatches?.[0];
            if (match) {
                return { lat: parseFloat(match.coordinates.y), lon: parseFloat(match.coordinates.x) };
            }
            return null;
        } catch (e) {
            if (attempt === 0) await sleep(2000);
        }
    }
    return null;
}

// ─── Photon fallback geocoder ─────────────────────────────────────────────────
async function photonGeocode(addressStr) {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(addressStr)}&limit=3&lang=en`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        const data = await res.json();
        // Filter to Virginia features
        const vaFeature = data?.features?.find(f => {
            const props = f.properties;
            return props.country === 'United States of America' &&
                   (props.state === 'Virginia' || props.state === 'VA');
        });
        const feat = vaFeature || data?.features?.[0];
        if (feat) {
            return { lat: feat.geometry.coordinates[1], lon: feat.geometry.coordinates[0] };
        }
        return null;
    } catch (e) {
        return null;
    }
}

// ─── City suffix by jurisdiction ───────────────────────────────────────────────
function cityForJurisdiction(jurisdiction) {
    if (jurisdiction === 'henrico') return 'Henrico County, VA';
    if (jurisdiction === 'chesterfield') return 'Chesterfield County, VA';
    return 'Richmond, VA';
}

// ─── Main geocoding function with confidence scoring ──────────────────────────
async function smartGeocode(location, agency) {
    const jurisdiction = getJurisdiction(agency, location);
    const city = cityForJurisdiction(jurisdiction);
    const parsed = parseLocation(location);

    // ── Strategy 1: Full address (block midpoint) ──
    if (parsed.type === 'block') {
        const attempts = [
            `${parsed.fullAddress}, ${city}`,
            `${parsed.blockNum} ${parsed.street}, ${city}`,
        ];
        for (const addr of attempts) {
            let coords = await censuGeocode(addr);
            if (!coords) coords = await photonGeocode(addr);
            if (coords && withinBounds(coords.lat, coords.lon, jurisdiction)) {
                return { latitude: coords.lat, longitude: coords.lon, geo_confidence: 'medium', geo_method: 'block', geo_approximate: true };
            }
        }
    }

    // ── Strategy 2: Intersection (both streets geocoded, averaged) ──
    if (parsed.type === 'intersection') {
        const addr = `${parsed.street1} and ${parsed.street2}, ${city}`;
        let coords = await censuGeocode(addr);
        if (!coords) coords = await photonGeocode(addr);
        if (coords && withinBounds(coords.lat, coords.lon, jurisdiction)) {
            return { latitude: coords.lat, longitude: coords.lon, geo_confidence: 'medium', geo_method: 'intersection', geo_approximate: true };
        }
        // Try just first street
        coords = await photonGeocode(`${parsed.street1}, ${city}`);
        if (coords && withinBounds(coords.lat, coords.lon, jurisdiction)) {
            return { latitude: coords.lat, longitude: coords.lon, geo_confidence: 'low', geo_method: 'street', geo_approximate: true };
        }
    }

    // ── Strategy 3: Plain street — geocode with city ──
    if (parsed.type === 'street') {
        const addr = `${parsed.street}, ${city}`;
        let coords = await photonGeocode(addr);
        if (coords && withinBounds(coords.lat, coords.lon, jurisdiction)) {
            return { latitude: coords.lat, longitude: coords.lon, geo_confidence: 'low', geo_method: 'street', geo_approximate: true };
        }
    }

    // ── Strategy 4: Retry as full raw string ──
    let coords = await censuGeocode(`${location}, ${city}`);
    if (!coords) coords = await photonGeocode(`${location}, ${city}`);
    if (coords && withinBounds(coords.lat, coords.lon, jurisdiction)) {
        // Determine method/confidence based on parsed type
        const method = parsed.type === 'block' ? 'block' : parsed.type === 'intersection' ? 'intersection' : 'street';
        return { latitude: coords.lat, longitude: coords.lon, geo_confidence: 'low', geo_method: method, geo_approximate: true };
    }

    // ── Unmappable ──
    return null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let body = {};
        try { body = await req.json(); } catch (e) {}
        const limit = Math.min(parseInt(body?.limit) || 5, 50);

        const allCalls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 500);

        // Missing = no coords OR not yet evaluated (no geo_confidence set)
        const missingCoords = allCalls.filter(c =>
            (!c.latitude || !c.longitude ||
             parseFloat(c.latitude) === 0 || parseFloat(c.longitude) === 0) &&
            c.geo_confidence !== 'unmappable' // don't re-attempt confirmed unmappable
        );

        console.log(`Found ${missingCoords.length} calls to geocode out of ${allCalls.length} total`);

        // Analytics
        const analytics = {
            total: allCalls.length,
            exact: allCalls.filter(c => c.geo_confidence === 'high').length,
            approximate: allCalls.filter(c => c.geo_approximate === true).length,
            unmappable: allCalls.filter(c => c.geo_confidence === 'unmappable').length,
            unprocessed: missingCoords.length,
        };

        const MAX = limit; // Automation passes 5; manual button can pass up to 50
        let geocoded = 0;
        let failed = 0;

        for (const call of missingCoords.slice(0, MAX)) {
            const result = await smartGeocode(call.location, call.agency);

            const updateData = result
                ? {
                    latitude: result.latitude,
                    longitude: result.longitude,
                    geo_confidence: result.geo_confidence,
                    geo_method: result.geo_method,
                    geo_approximate: result.geo_approximate,
                }
                : {
                    geo_confidence: 'unmappable',
                    geo_method: 'none',
                    geo_approximate: false,
                };

            if (result) {
                console.log(`✅ [${result.geo_confidence.toUpperCase()}/${result.geo_method}] ${call.location} -> (${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)})`);
                geocoded++;
            } else {
                console.log(`🚫 [UNMAPPABLE] ${call.location} [${call.agency}]`);
                failed++;
            }

            // Retry once on rate limit
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    await base44.asServiceRole.entities.DispatchCall.update(call.id, updateData);
                    break;
                } catch (err) {
                    if (attempt === 0) await sleep(6000);
                }
            }

            await sleep(4000);
        }

        return Response.json({
            success: true,
            analytics,
            batch: { geocoded, failed, skipped: Math.max(0, missingCoords.length - MAX) },
            message: `Geocoded ${geocoded}, marked ${failed} unmappable. ${Math.max(0, missingCoords.length - MAX)} skipped for next run.`
        });

    } catch (error) {
        console.error('geocodeMissingCalls failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});