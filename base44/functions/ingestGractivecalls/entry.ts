import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import * as cheerio from 'npm:cheerio@1.0.0';

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const dPhi = (lat2 - lat1) * Math.PI / 180;
    const dLambda = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Returns the ET→UTC offset hours (4 during DST, 5 otherwise) for a given date.
function etOffsetHours(date = new Date()) {
    const tzName = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
        .formatToParts(date).find(p => p.type === 'timeZoneName')?.value || 'GMT-5';
    const m = tzName.match(/GMT([+-])(\d+)/);
    if (m) return parseInt(m[2]);
    return 5;
}

// Parse ET wall-clock time → UTC ISO. Handles "07/03/2026 1:34 PM" and "1:34 PM".
function parseTimeToISO(timeStr, referenceDate = new Date()) {
    if (!timeStr) return new Date().toISOString();
    const offset = etOffsetHours(referenceDate);

    const fullMatch = timeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (fullMatch) {
        const [, month, day, year, rawHour, minutes, ampm] = fullMatch;
        let hour = parseInt(rawHour);
        if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
        return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), hour + offset, parseInt(minutes), 0)).toISOString();
    }

    const timeAmPm = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeAmPm) {
        const [, rawHour, minutes, ampm] = timeAmPm;
        let hour = parseInt(rawHour);
        if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
        const etParts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(referenceDate);
        const y = etParts.find(p => p.type === 'year')?.value;
        const mo = etParts.find(p => p.type === 'month')?.value;
        const d = etParts.find(p => p.type === 'day')?.value;
        return new Date(Date.UTC(parseInt(y), parseInt(mo) - 1, parseInt(d), hour + offset, parseInt(minutes), 0)).toISOString();
    }

    return new Date().toISOString();
}

// Clamp any wall-clock time that parses to the future (gractive occasionally shows
// a future "Time Received") down to now so elapsed-time never goes negative.
function clampFuture(iso) {
    const t = new Date(iso).getTime();
    if (t > Date.now() + 60000) return new Date().toISOString();
    return iso;
}

function cleanAddress(address, city = 'Chesterfield County, Virginia') {
    let clean = address.replace(/\b(\d+)\s*-?\s*BLK\b/i, '$1 Block').trim();
    return `${clean}, ${city}`;
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

async function geocodeAddress(address, city = 'Chesterfield County, Virginia') {
    const fullAddress = cleanAddress(address, city);
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
// gractivecalls.com aggregates all local agencies — ingest every one
const ALLOWED_AGENCIES = new Set(['CCPD', 'CCFD', 'HPD', 'HFD', 'RPD', 'RFD']);
const AGENCY_SOURCE = {
    CCPD: 'chesterfield', CCFD: 'chesterfield',
    HPD: 'henrico', HFD: 'henrico',
    RPD: 'richmond', RFD: 'richmond',
};
const SOURCE_CITY = {
    chesterfield: 'Chesterfield County, Virginia',
    richmond: 'Richmond, Virginia',
    henrico: 'Henrico County, Virginia',
};
const SOURCE_PREFIX = {
    chesterfield: 'chesterfield',
    richmond: 'richmond',
    henrico: 'henrico',
};

// Parse the gractivecalls.com server-rendered Mantine table.
function parseGractive(html) {
    const $ = cheerio.load(html);
    const calls = [];
    $('table tbody tr').each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length < 6) return;
        const timeStr = $(cells[0]).text().trim();
        // HPD rows have Location/Incident columns swapped: cells[2] is a time,
        // cells[1] is the address, and cells[4] is the incident type (badge).
        const col2 = $(cells[2]).text().trim();
        const isSwapped = /\d{1,2}:\d{2}\s*(AM|PM)/i.test(col2);
        const location = isSwapped ? $(cells[1]).text().trim() : col2;
        const agency = $(cells[3]).text().trim().toUpperCase();
        const incident = isSwapped ? $(cells[4]).text().trim() : $(cells[1]).text().trim();
        const statusText = isSwapped ? '' : $(cells[4]).text().trim();
        if (!incident || !location || !agency) return;
        if (!ALLOWED_AGENCIES.has(agency)) return;

        const source = AGENCY_SOURCE[agency] || 'chesterfield';
        const prefix = SOURCE_PREFIX[source];

        // Extract the gractive call hash from the actions link for a stable call_id
        let callId = '';
        const link = $(row).find('a[href*="/call/"]').first();
        const href = link.attr('href') || '';
        const hashMatch = href.match(/\/call\/([a-f0-9]+)/i);
        if (hashMatch) {
            callId = `${prefix}-${hashMatch[1]}`;
        } else {
            const timeSlug = timeStr.replace(/[^0-9]/g, '');
            const locSlug = location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 40);
            callId = `${prefix}-${agency.toLowerCase()}-${timeSlug}-${locSlug}`;
        }

        calls.push({
            call_id: callId,
            incident,
            location,
            agency,
            zone: '',
            status: normalizeStatus(statusText),
            priority: 'medium',
            time_received: clampFuture(parseTimeToISO(timeStr)),
            source,
            description: `${incident} at ${location}`
        });
    });
    return calls;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const now = new Date();

        console.log('Starting active calls ingestion from gractivecalls.com (RPD/RFD/HPD/HFD/CCPD/CCFD)...');

        const res = await fetch('https://gractivecalls.com/', {
            headers: { 'User-Agent': 'BPS-CAD-Dispatch/1.0' },
            signal: AbortSignal.timeout(15000)
        });
        if (!res.ok) {
            return Response.json({
                success: false,
                error: `gractivecalls.com fetch failed: HTTP ${res.status}`,
                timestamp: now.toISOString()
            }, { status: 502 });
        }
        const html = await res.text();

        const allCalls = parseGractive(html);
        console.log(`gractivecalls.com: parsed ${allCalls.length} calls (RPD/RFD/HPD/HFD/CCPD/CCFD)`);

        if (allCalls.length === 0) {
            return Response.json({
                success: false,
                error: 'No calls parsed from gractivecalls.com',
                timestamp: now.toISOString()
            }, { status: 502 });
        }

        // Phase out: only keep calls received within the last 2 hours (ET). Anything
        // older is closed and ages out, even if gractive still lists it.
        const twoHourCutoff = Date.now() - 2 * 60 * 60 * 1000;
        const activeCalls = allCalls.filter(c => new Date(c.time_received).getTime() >= twoHourCutoff);
        const phasedOut = allCalls.length - activeCalls.length;
        if (phasedOut > 0) console.log(`Phased out ${phasedOut} calls older than 2h`);

        // One row per call (keyed by the gractive call hash): update status on existing
        // records instead of creating duplicates each sync.
        const hashOf = (cid) => cid && cid.includes('-') ? cid.split('-').slice(1).join('-') : cid;
        const incomingIds = new Set(activeCalls.map(c => hashOf(c.call_id)));
        const existingByCallId = new Map();
        const duplicateIdsToDelete = [];
        let created = 0, updated = 0, closed = 0, geocoded = 0, geocodeSkipped = 0;

        const [cc, rc, hc] = await Promise.all([
            base44.asServiceRole.entities.DispatchCall.filter({ source: 'chesterfield' }),
            base44.asServiceRole.entities.DispatchCall.filter({ source: 'richmond' }),
            base44.asServiceRole.entities.DispatchCall.filter({ source: 'henrico' }),
        ]);
        const existing = [...cc, ...rc, ...hc];
        // Index by hash (portion after source prefix) so calls migrate cleanly
        // when their source label changes (e.g. old 'chesterfield-' → new 'richmond-').
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
        // Clean up duplicate rows left over from prior no-dedup runs.
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
                const coords = await geocodeAddress(callData.location, SOURCE_CITY[callData.source]);
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
                    const sourceChanged = existingRec.source !== callData.source;
                    const gotCoords = callData.latitude != null && existingRec.latitude == null;
                    if (statusChanged || incidentChanged || locationChanged || sourceChanged || gotCoords) {
                        const updates = {
                            status: callData.status,
                            incident: callData.incident,
                            location: callData.location,
                            source: callData.source,
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

        // Calls that dropped off gractive have cleared — close them so they age out.
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
            source: 'https://gractivecalls.com/ (RPD/RFD/HPD/HFD/CCPD/CCFD)',
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
        console.error('Ingestion failed:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});