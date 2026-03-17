import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as cheerio from 'npm:cheerio@1.0.0';

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseTimeToISO(timeStr) {
    if (!timeStr) return new Date().toISOString();
    const fullMatch = timeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (fullMatch) {
        const [, month, day, year, rawHour, minutes, ampm] = fullMatch;
        let hour = parseInt(rawHour);
        if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
        const pad = (n) => String(n).padStart(2, '0');
        const testDate = new Date(`${year}-${pad(month)}-${pad(day)}T12:00:00Z`);
        const tzName = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
            .formatToParts(testDate).find(p => p.type === 'timeZoneName')?.value || 'GMT-5';
        const offsetHours = tzName.includes('-4') ? 4 : 5;
        return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), hour + offsetHours, parseInt(minutes), 0)).toISOString();
    }
    const timeOnly = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (timeOnly) {
        const nowEastern = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const d = new Date(nowEastern);
        d.setHours(parseInt(timeOnly[1]), parseInt(timeOnly[2]), 0, 0);
        return d.toISOString();
    }
    return new Date().toISOString();
}

async function geocodeAddress(address) {
    try {
        const query = encodeURIComponent(address + ', Virginia, USA');
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&countrycodes=us`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'BPS-CAD-Dispatch/1.0 (emergency-services)' },
            signal: AbortSignal.timeout(5000)
        });
        const data = await res.json();
        if (data?.length > 0) {
            return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
        }
    } catch (e) { /* silent */ }
    return null;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Max new geocoding calls per run to stay well under time limit
const MAX_GEOCODE_PER_RUN = 10;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        console.log('🚨 Starting active calls ingestion from gractivecalls.com...');

        const htmlResponse = await fetch('https://gractivecalls.com', {
            headers: { 'User-Agent': 'BPS-CAD-Dispatch/1.0' },
            signal: AbortSignal.timeout(15000)
        });

        if (!htmlResponse.ok) {
            throw new Error(`Failed to fetch gractivecalls.com: ${htmlResponse.status}`);
        }

        const html = await htmlResponse.text();
        const $ = cheerio.load(html);

        const allCalls = [];
        const seenIds = new Set();

        $('table tbody tr').each((_, row) => {
            const cells = $(row).find('td');
            if (cells.length >= 5) {
                const timeStr = $(cells[0]).text().trim();
                const incident = $(cells[1]).text().trim();
                const location = $(cells[2]).text().trim();
                const agency = $(cells[3]).text().trim();
                const status = $(cells[4]).text().trim();

                if (!incident || !location || !agency) return;

                const incidentSlug = incident.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 30);
                const locationSlug = location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 40);
                const stableId = `${agency.toLowerCase()}-${incidentSlug}-${locationSlug}`;

                if (!seenIds.has(stableId)) {
                    seenIds.add(stableId);
                    allCalls.push({
                        call_id: stableId,
                        incident,
                        location,
                        agency,
                        status,
                        priority: 'medium',
                        time_received: parseTimeToISO(timeStr),
                        source: 'gractivecalls',
                        description: `${incident} at ${location}`
                    });
                }
            }
        });

        console.log(`📡 HTML parsed ${allCalls.length} calls`);

        // Fetch existing calls (with their coords already stored)
        const existingCalls = await base44.asServiceRole.entities.DispatchCall.filter({ source: 'gractivecalls' });
        const existingMap = new Map(existingCalls.map(c => [c.call_id, c]));
        console.log(`📊 Found ${existingCalls.length} existing calls in database`);

        let inserted = 0, updated = 0, geocoded = 0, geocodeSkipped = 0;
        const newCallIds = new Set(allCalls.map(c => c.call_id));

        for (const callData of allCalls) {
            const existing = existingMap.get(callData.call_id);

            if (existing) {
                // Reuse stored coordinates — never re-geocode existing calls
                callData.latitude = existing.latitude;
                callData.longitude = existing.longitude;

                // Only update mutable fields
                await base44.asServiceRole.entities.DispatchCall.update(existing.id, {
                    status: callData.status,
                    time_received: callData.time_received,
                });
                updated++;
            } else {
                // Brand new call — geocode only if under limit
                if (geocoded < MAX_GEOCODE_PER_RUN) {
                    const coords = await geocodeAddress(callData.location);
                    if (coords) {
                        callData.latitude = coords.latitude;
                        callData.longitude = coords.longitude;
                        geocoded++;
                        console.log(`📍 Geocoded: ${callData.location} → (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`);
                    } else {
                        console.log(`❌ Could not geocode: ${callData.location}`);
                    }
                    await sleep(1100); // Nominatim rate limit: 1 req/sec
                } else {
                    geocodeSkipped++;
                    console.log(`⏭️ Geocode skipped (limit reached): ${callData.location}`);
                }

                await base44.asServiceRole.entities.DispatchCall.create(callData);
                inserted++;
            }
        }

        // Delete calls no longer on the live site
        let deleted = 0;
        for (const existing of existingCalls) {
            if (!newCallIds.has(existing.call_id)) {
                await base44.asServiceRole.entities.DispatchCall.delete(existing.id);
                deleted++;
                console.log(`🗑️ Removed: ${existing.incident} @ ${existing.location}`);
            }
        }

        console.log(`💾 DB: ${inserted} created (${geocoded} geocoded, ${geocodeSkipped} skipped), ${updated} updated, ${deleted} deleted`);

        // Property alert checking
        let alertsCreated = 0;
        try {
            const properties = await base44.asServiceRole.entities.MonitoredProperty.filter({ enabled: true });
            if (properties.length > 0) {
                const callsWithCoords = allCalls.filter(c => c.latitude && c.longitude);
                for (const call of callsWithCoords) {
                    for (const property of properties) {
                        const distance = calculateDistance(call.latitude, call.longitude, property.latitude, property.longitude);
                        if (distance <= property.radiusMeters) {
                            const existingAlert = await base44.asServiceRole.entities.PropertyAlert.filter({
                                callId: call.call_id,
                                propertyId: property.id
                            });
                            if (existingAlert.length === 0) {
                                await base44.asServiceRole.entities.PropertyAlert.create({
                                    callId: call.call_id,
                                    propertyId: property.id,
                                    propertyName: property.name,
                                    callIncident: call.incident,
                                    callLocation: call.location,
                                    distanceMeters: Math.round(distance),
                                    acknowledged: false
                                });
                                alertsCreated++;
                                console.log(`🚨 Alert: ${call.incident} within ${Math.round(distance)}m of ${property.name}`);
                            }
                        }
                    }
                }
            }
        } catch (alertError) {
            console.error('❌ Property alert check failed:', alertError);
        }

        return Response.json({
            success: true,
            timestamp: new Date().toISOString(),
            source: 'gractivecalls.com',
            total_parsed: allCalls.length,
            inserted,
            updated,
            deleted,
            geocoded,
            geocode_skipped: geocodeSkipped,
            alerts_created: alertsCreated
        });

    } catch (error) {
        console.error('❌ Ingestion failed:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});