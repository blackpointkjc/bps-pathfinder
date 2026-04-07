import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function cleanAddress(address, agency) {
    // Remove 'Block' from addresses (e.g., '1600 Block WILLOW LAWN DR' -> '1600 WILLOW LAWN DR')
    let clean = address.replace(/\b(\d+)\s+Block\b/i, '$1');
    // Remove trailing abbreviations like 'RICH' for Richmond
    clean = clean.replace(/\bRICH\b$/, 'Richmond').trim();
    // Determine city from agency
    let city = 'Richmond, Virginia';
    if (agency) {
        const ag = agency.toUpperCase();
        if (ag.includes('HENRICO') || ag.includes('HFD') || ag.includes('HPD') || ag.includes('HCPD') || ag.includes('HCFD')) {
            city = 'Henrico County, Virginia';
        } else if (ag.includes('CHESTERFIELD') || ag.includes('CFD') || ag.includes('CCPD') || ag.includes('CCFD')) {
            city = 'Chesterfield County, Virginia';
        }
    }
    if (clean.toUpperCase().includes('HENRICO')) city = 'Henrico County, Virginia';
    if (clean.toUpperCase().includes('CHESTERFIELD')) city = 'Chesterfield County, Virginia';
    return `${clean}, ${city}`;
}

async function geocodeAddress(address, agency) {
    const fullAddress = cleanAddress(address, agency);

    // Try Census Geocoder first (free, no rate limit, US-only)
    try {
        const encoded = encodeURIComponent(fullAddress);
        const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encoded}&benchmark=2020&format=json`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const data = await res.json();
        const match = data?.result?.addressMatches?.[0];
        if (match) {
            return { latitude: parseFloat(match.coordinates.y), longitude: parseFloat(match.coordinates.x) };
        }
    } catch (e) {
        console.log(`Census geocode error for "${address}": ${e.message}`);
    }

    // Fallback: Photon (OpenStreetMap-based, no API key needed)
    try {
        const query = encodeURIComponent(fullAddress);
        const url = `https://photon.komoot.io/api/?q=${query}&limit=1&lang=en`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        const feat = data?.features?.[0];
        if (feat) {
            const [lon, lat] = feat.geometry.coordinates;
            return { latitude: lat, longitude: lon };
        }
    } catch (e) {
        console.log(`Photon geocode error for "${address}": ${e.message}`);
    }

    return null;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Fetch all active dispatch calls
        const allCalls = await base44.asServiceRole.entities.DispatchCall.list('-created_date', 500);

        // Filter calls with missing or zero coordinates
        const missingCoords = allCalls.filter(c =>
            !c.latitude || !c.longitude ||
            parseFloat(c.latitude) === 0 || parseFloat(c.longitude) === 0
        );

        console.log(`Found ${missingCoords.length} calls missing coordinates out of ${allCalls.length} total`);

        let geocoded = 0;
        let failed = 0;
        const MAX = 3; // Small batch — automation runs every 10 min // Small batch per run — automation runs every 10 min to handle remainder

        for (const call of missingCoords.slice(0, MAX)) {
            const coords = await geocodeAddress(call.location, call.agency);
            if (coords) {
                // Retry entity update once on rate limit
                let updated = false;
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        await base44.asServiceRole.entities.DispatchCall.update(call.id, {
                            latitude: coords.latitude,
                            longitude: coords.longitude
                        });
                        updated = true;
                        break;
                    } catch (err) {
                        if (attempt === 0) await sleep(5000);
                    }
                }
                if (updated) {
                    geocoded++;
                    console.log(`✅ Geocoded: ${call.location} -> (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`);
                } else {
                    failed++;
                    console.log(`❌ Update failed (rate limit): ${call.location}`);
                }
            } else {
                failed++;
                console.log(`❌ Failed: ${call.location}`);
            }
            await sleep(5000);
        }

        return Response.json({
            success: true,
            total_missing: missingCoords.length,
            geocoded,
            failed,
            skipped: Math.max(0, missingCoords.length - MAX),
            message: `Geocoded ${geocoded} calls. Run again if more skipped.`
        });

    } catch (error) {
        console.error('Geocode missing calls failed:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});