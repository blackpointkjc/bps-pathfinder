import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const dPhi = (lat2 - lat1) * Math.PI / 180;
    const dLambda = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function etOffsetHours(date = new Date()) {
    const tzName = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
        .formatToParts(date).find(p => p.type === 'timeZoneName')?.value || 'GMT-5';
    const m = tzName.match(/GMT([+-])(\d+)/);
    if (m) return parseInt(m[2]);
    return 4;
}

// Parse "07/03/2026 19:51" (ET wall-clock) → UTC ISO
function parseTimeToISO(timeStr) {
    if (!timeStr) return new Date().toISOString();
    const offset = etOffsetHours();
    const m = timeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (m) {
        const [, month, day, year, hour, minutes] = m;
        return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour) + offset, parseInt(minutes), 0)).toISOString();
    }
    return new Date().toISOString();
}

function clampFuture(iso) {
    const t = new Date(iso).getTime();
    if (t > Date.now() + 60000) return new Date().toISOString();
    return iso;
}

function normalizeStatus(rawStatus) {
    const s = (rawStatus || '').toUpperCase().trim();
    const map = {
        'ENROUTE': 'Enroute', 'EN ROUTE': 'Enroute', 'ARRIVED': 'Arrived', 'ARV': 'Arrived',
        'DISPATCHED': 'Dispatched', 'ASSIGNED': 'Dispatched', 'PENDING': 'Pending',
        'NEW': 'New', 'ON SCENE': 'On Scene', 'ONSCENE': 'On Scene',
        'CLEARED': 'Cleared', 'CANCELLED': 'Cancelled', 'CLOSED': 'Closed'
    };
    return map[s] || (s || 'New');
}

function cleanAddress(address) {
    let clean = address.replace(/\b(\d+)\s*-?\s*BLK\b/i, '$1 Block').trim();
    clean = clean.replace(/^RICH:\s*@?\s*/i, '').replace(/\s+RICH$/i, '').trim();
    return `${clean}, Richmond, Virginia`;
}

async function geocodeAddress(address) {
    const fullAddress = cleanAddress(address);
    try {
        const encoded = encodeURIComponent(fullAddress);
        const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encoded}&benchmark=2020&format=json`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const data = await res.json();
        const match = data?.result?.addressMatches?.[0];
        if (match) {
            return { latitude: parseFloat(match.coordinates.y), longitude: parseFloat(match.coordinates.x) };
        }
    } catch (_e) { /* silent */ }

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
    } catch (_e) { /* silent */ }

    return null;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const MAX_GEOCODE_PER_RUN = 30;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const now = new Date();

        console.log('Starting RPD/RFD calls ingestion from apps.richmondgov.com...');

        const res = await fetch('https://apps.richmondgov.com/applications/activecalls', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
            },
            signal: AbortSignal.timeout(15000)
        });
        if (!res.ok) {
            return Response.json({
                success: false,
                error: `richmondgov.com fetch failed: HTTP ${res.status}`,
                timestamp: now.toISOString()
            }, { status: 502 });
        }
        // The Richmond page loads table data via JavaScript/AJAX, so the raw HTML
        // is just a shell. Use Gemini with web search to render and extract the data.
        const extractedData = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `Visit https://apps.richmondgov.com/applications/activecalls and extract ALL active calls from the table on that page.

The table has columns: Time Received, Agency, Dispatch Area, Unit, Call Type, Location, Status.

Return a JSON object with a "calls" array. Each element:
- time: "Time Received" (e.g. "07/03/2026 19:51")
- agency: "Agency" (e.g. "RPD" or "RFD")
- dispatch_area: "Dispatch Area"
- unit: "Unit"
- call_type: "Call Type"
- location: "Location"
- status: "Status"

Extract every single row. If the table is empty, return {"calls": []}.`,
            model: 'gemini_3_flash',
            add_context_from_internet: true,
            response_json_schema: {
                type: "object",
                properties: {
                    calls: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                time: { type: "string" },
                                agency: { type: "string" },
                                dispatch_area: { type: "string" },
                                unit: { type: "string" },
                                call_type: { type: "string" },
                                location: { type: "string" },
                                status: { type: "string" }
                            }
                        }
                    }
                }
            }
        });

        const rawCalls = extractedData?.calls || [];
        console.log(`LLM extracted ${rawCalls.length} calls from richmondgov.com`);

        const allCalls = rawCalls
            .filter(c => {
                const ag = (c.agency || '').toUpperCase().trim();
                return ag === 'RPD' || ag === 'RFD';
            })
            .map(c => {
                const agency = (c.agency || '').toUpperCase().trim();
                const timeStr = c.time || '';
                const callType = c.call_type || '';
                const location = c.location || '';
                const statusText = c.status || '';
                const dispatchArea = c.dispatch_area || '';
                const unit = c.unit || '';

                const timeSlug = timeStr.replace(/[^0-9]/g, '');
                const locSlug = location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 40);
                const callId = `richmond-${agency.toLowerCase()}-${timeSlug}-${locSlug}`;

                return {
                    call_id: callId,
                    incident: callType,
                    location,
                    agency,
                    zone: dispatchArea,
                    assigned_units: unit ? [unit] : [],
                    status: normalizeStatus(statusText),
                    priority: 'medium',
                    time_received: clampFuture(parseTimeToISO(timeStr)),
                    source: 'richmond',
                    description: `${callType} at ${location}${unit ? ` (Unit: ${unit})` : ''}`
                };
            });
        console.log(`Parsed ${allCalls.length} RPD/RFD calls`);

        if (allCalls.length === 0) {
            return Response.json({
                success: false,
                error: 'No RPD/RFD calls extracted from richmondgov.com',
                timestamp: now.toISOString()
            }, { status: 502 });
        }

        const twoHourCutoff = Date.now() - 2 * 60 * 60 * 1000;
        const activeCalls = allCalls.filter(c => new Date(c.time_received).getTime() >= twoHourCutoff);
        const phasedOut = allCalls.length - activeCalls.length;

        const hashOf = (cid) => cid && cid.includes('-') ? cid.split('-').slice(1).join('-') : cid;
        const incomingIds = new Set(activeCalls.map(c => hashOf(c.call_id)));
        const existingByCallId = new Map();
        const duplicateIdsToDelete = [];
        let created = 0, updated = 0, closed = 0, geocoded = 0, geocodeSkipped = 0;

        const existing = await base44.asServiceRole.entities.DispatchCall.filter({ source: 'richmond' });
        for (const rec of existing) {
            const hash = hashOf(rec.call_id);
            if (!hash) continue;
            const kept = existingByCallId.get(hash);
            if (!kept) {
                existingByCallId.set(hash, rec);
            } else if (new Date(rec.created_date) < new Date(kept.created_date)) {
                duplicateIdsToDelete.push(kept.id);
                existingByCallId.set(hash, rec);
            } else {
                duplicateIdsToDelete.push(rec.id);
            }
        }
        for (const id of duplicateIdsToDelete) {
            try { await base44.asServiceRole.entities.DispatchCall.delete(id); } catch (_e) { /* silent */ }
        }
        if (duplicateIdsToDelete.length) console.log(`DB: removed ${duplicateIdsToDelete.length} duplicate rows`);

        const OPEN_STATUSES = ['New', 'Pending', 'Dispatched', 'Enroute', 'On Scene', 'Arrived'];

        for (const callData of activeCalls) {
            const existingRec = existingByCallId.get(hashOf(callData.call_id));
            const locationChanged = !!existingRec && existingRec.location !== callData.location;
            const needsGeocode = !existingRec || (existingRec.latitude == null) || locationChanged;

            if (needsGeocode && geocoded < MAX_GEOCODE_PER_RUN) {
                const coords = await geocodeAddress(callData.location);
                if (coords) {
                    callData.latitude = coords.latitude;
                    callData.longitude = coords.longitude;
                    geocoded++;
                    console.log(`Geocoded: ${callData.location} -> (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`);
                } else {
                    console.log(`Could not geocode: ${callData.location}`);
                }
            } else if (needsGeocode) {
                geocodeSkipped++;
            }

            try {
                if (existingRec) {
                    const statusChanged = existingRec.status !== callData.status;
                    const incidentChanged = existingRec.incident !== callData.incident;
                    const gotCoords = callData.latitude != null && existingRec.latitude == null;
                    if (statusChanged || incidentChanged || locationChanged || gotCoords) {
                        const updates = {
                            status: callData.status,
                            incident: callData.incident,
                            location: callData.location,
                            zone: callData.zone,
                            assigned_units: callData.assigned_units,
                        };
                        if (gotCoords) {
                            updates.latitude = callData.latitude;
                            updates.longitude = callData.longitude;
                        }
                        if (['Cleared', 'Closed', 'Cancelled'].includes(callData.status)) {
                            updates.time_cleared = new Date().toISOString();
                        }
                        await base44.asServiceRole.entities.DispatchCall.update(existingRec.id, updates);
                        updated++;
                    }
                } else {
                    await base44.asServiceRole.entities.DispatchCall.create(callData);
                    created++;
                    await sleep(150);
                }
            } catch (e) {
                console.error(`Failed to upsert call ${callData.call_id}:`, e?.message);
            }
        }

        for (const [cid, rec] of existingByCallId) {
            if (incomingIds.has(cid)) continue;
            if (OPEN_STATUSES.includes(rec.status)) {
                try {
                    await base44.asServiceRole.entities.DispatchCall.update(rec.id, { status: 'Closed', time_closed: new Date().toISOString() });
                    closed++;
                } catch (_e) { /* silent */ }
            }
        }

        console.log(`DB: ${created} created, ${updated} updated, ${closed} closed, ${duplicateIdsToDelete.length} dupes removed (${geocoded} geocoded, ${geocodeSkipped} skipped)`);

        // Property alert checking
        let alertsCreated = 0;
        try {
            const properties = await base44.asServiceRole.entities.MonitoredProperty.filter({ enabled: true });
            if (properties.length > 0) {
                const callsWithCoords = activeCalls.filter(c => c.latitude && c.longitude);
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
                            }
                        }
                    }
                }
            }
        } catch (alertError) {
            console.error('Property alert check failed:', alertError);
        }

        return Response.json({
            success: true,
            timestamp: now.toISOString(),
            source: 'https://apps.richmondgov.com/applications/activecalls',
            total_parsed: allCalls.length,
            active_within_2h: activeCalls.length,
            phased_out: phasedOut,
            created,
            updated,
            closed,
            duplicates_removed: duplicateIdsToDelete.length,
            geocoded,
            geocode_skipped: geocodeSkipped,
            alerts_created: alertsCreated,
            dedup_enabled: true
        });

    } catch (error) {
        console.error('Richmond ingestion failed:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});