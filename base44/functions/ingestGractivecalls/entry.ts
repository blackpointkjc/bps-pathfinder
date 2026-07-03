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
    if (m) return parseInt(m[2]); // 'GMT-4' → 4, 'GMT-5' → 5
    return 5;
}

function parseTimeToISO(timeStr, referenceDate = new Date()) {
    if (!timeStr) return new Date().toISOString();
    const pad = (n) => String(n).padStart(2, '0');
    const offset = etOffsetHours(referenceDate);

    // Richmond format: "07/03/2026 13:37" (MM/DD/YYYY HH:MM, 24h)
    const full24 = timeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (full24 && !/AM|PM/i.test(timeStr)) {
        const [, month, day, year, hour, minutes] = full24;
        return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour) + offset, parseInt(minutes), 0)).toISOString();
    }

    // Full format with AM/PM: "07/03/2026 1:37 PM"
    const fullMatch = timeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (fullMatch) {
        const [, month, day, year, rawHour, minutes, ampm] = fullMatch;
        let hour = parseInt(rawHour);
        if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
        return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), hour + offset, parseInt(minutes), 0)).toISOString();
    }

    // Time only with AM/PM (Henrico): "1:38 PM" — use today's date in ET
    const timeAmPm = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeAmPm) {
        const [, rawHour, minutes, ampm] = timeAmPm;
        let hour = parseInt(rawHour);
        if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
        // Build the date in Eastern local components, then convert to UTC
        const etParts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(referenceDate);
        const y = etParts.find(p => p.type === 'year')?.value;
        const mo = etParts.find(p => p.type === 'month')?.value;
        const d = etParts.find(p => p.type === 'day')?.value;
        return new Date(Date.UTC(parseInt(y), parseInt(mo) - 1, parseInt(d), hour + offset, parseInt(minutes), 0)).toISOString();
    }

    // Bare 24h time only (fallback): "13:37"
    const timeOnly = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (timeOnly) {
        const etParts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(referenceDate);
        const y = etParts.find(p => p.type === 'year')?.value;
        const mo = etParts.find(p => p.type === 'month')?.value;
        const d = etParts.find(p => p.type === 'day')?.value;
        return new Date(Date.UTC(parseInt(y), parseInt(mo) - 1, parseInt(d), parseInt(timeOnly[1]) + offset, parseInt(timeOnly[2]), 0)).toISOString();
    }

    return new Date().toISOString();
}

function cleanAddress(address, source) {
    let clean = address.replace(/\b(\d+)\s*-?\s*BLK\b/i, '$1 Block');
    clean = clean.replace(/\b(\d+)\s+Block\b/i, '$1 Block');
    clean = clean.replace(/\bRICH\b$/, 'Richmond').trim();
    let city = 'Richmond, Virginia';
    if (source === 'henrico') city = 'Henrico County, Virginia';
    else if (source === 'chesterfield') city = 'Chesterfield County, Virginia';
    return `${clean}, ${city}`;
}

// Map a raw status string from the source feed to the DispatchCall status enum.
function normalizeStatus(rawStatus, source) {
    const s = (rawStatus || '').toUpperCase().trim();
    // Henrico: "ASSIGNED 1:39 PM", "ENROUTE 1:35 PM", "ARRIVED 1:31 PM", "TRNSPRT 11:02 AM"
    if (source === 'henrico') {
        if (s.startsWith('ASSIGNED')) return 'Dispatched';
        if (s.startsWith('ENROUTE')) return 'Enroute';
        if (s.startsWith('ARRIVED')) return 'Arrived';
        if (s.startsWith('TRNSPRT')) return 'On Scene';
        return 'New';
    }
    // Richmond: "Enroute", "Arrived", "Dispatched", "Pending", etc.
    const map = {
        'ENROUTE': 'Enroute', 'ARRIVED': 'Arrived', 'DISPATCHED': 'Dispatched',
        'PENDING': 'Pending', 'NEW': 'New', 'CLEARED': 'Cleared',
        'CLOSED': 'Closed', 'CANCELLED': 'Cancelled'
    };
    return map[s] || 'New';
}

async function geocodeAddress(address, source) {
    const fullAddress = cleanAddress(address, source);
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

// Parse the City of Richmond Active Calls HTML table.
function parseRichmond(html) {
    const $ = cheerio.load(html);
    const calls = [];
    const seen = new Set();
    // The page uses a DataTable: table#tblActiveCallsListing tbody tr
    $('#tblActiveCallsListing tbody tr').each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length < 7) return;
        const timeStr = $(cells[0]).text().trim();
        const agency = $(cells[1]).text().trim();
        const dispatchArea = $(cells[2]).text().trim();
        const unit = $(cells[3]).text().trim();
        const callType = $(cells[4]).text().trim();
        const location = $(cells[5]).text().trim();
        const status = $(cells[6]).text().trim();
        if (!callType || !location || !agency) return;

        const timeSlug = timeStr.replace(/[^0-9]/g, '');
        const locSlug = location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 40);
        const unitSlug = unit.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 12);
        const callId = `richmond-${agency.toLowerCase()}-${timeSlug}-${unitSlug}-${locSlug}`;
        if (seen.has(callId)) return;
        seen.add(callId);

        calls.push({
            call_id: callId,
            incident: callType,
            location,
            agency,
            zone: dispatchArea,
            assigned_units: unit ? [unit] : [],
            status: normalizeStatus(status, 'richmond'),
            priority: 'medium',
            time_received: parseTimeToISO(timeStr),
            source: 'richmond',
            description: `${callType} at ${location}`
        });
    });
    return calls;
}

// Parse the Henrico County Active Calls HTML table.
function parseHenrico(html) {
    const $ = cheerio.load(html);
    const calls = [];
    const seen = new Set();
    $('#activeCallsTable tbody tr').each((_, row) => {
        const cells = $(row).find('td');
        if (cells.length < 6) return;
        const cadNumber = $(cells[0]).text().trim();
        const timeStr = $(cells[1]).text().trim();
        const location = $(cells[2]).text().trim();
        const incident = $(cells[3]).text().trim();
        const statusRaw = $(cells[4]).text().trim();
        const district = $(cells[5]).text().trim();
        if (!cadNumber || !location || !incident) return;

        const callId = `henrico-${cadNumber}`;
        if (seen.has(callId)) return;
        seen.add(callId);

        calls.push({
            call_id: callId,
            incident,
            location,
            agency: 'HPD',
            zone: district,
            status: normalizeStatus(statusRaw, 'henrico'),
            priority: 'medium',
            time_received: parseTimeToISO(timeStr),
            source: 'henrico',
            description: `${incident} at ${location}`
        });
    });
    return calls;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const now = new Date();

        console.log('Starting active calls ingestion from official sources...');

        // Fetch both official endpoints in parallel
        const [richmondRes, henricoRes] = await Promise.allSettled([
            fetch('https://apps.richmondgov.com/applications/activecalls/Home/ActiveCalls', {
                headers: { 'User-Agent': 'BPS-CAD-Dispatch/1.0' },
                signal: AbortSignal.timeout(15000)
            }),
            fetch('https://activecalls.henrico.gov/', {
                headers: { 'User-Agent': 'BPS-CAD-Dispatch/1.0' },
                signal: AbortSignal.timeout(15000)
            })
        ]);

        let richmondCalls = [];
        let henricoCalls = [];

        if (richmondRes.status === 'fulfilled' && richmondRes.value.ok) {
            const html = await richmondRes.value.text();
            richmondCalls = parseRichmond(html);
            console.log(`Richmond (apps.richmondgov.com): parsed ${richmondCalls.length} calls`);
        } else {
            console.error('Richmond fetch failed:', richmondRes.status === 'rejected' ? richmondRes.reason?.message : richmondRes.value?.status);
        }

        if (henricoRes.status === 'fulfilled' && henricoRes.value.ok) {
            const html = await henricoRes.value.text();
            henricoCalls = parseHenrico(html);
            console.log(`Henrico (activecalls.henrico.gov): parsed ${henricoCalls.length} calls`);
        } else {
            console.error('Henrico fetch failed:', henricoRes.status === 'rejected' ? henricoRes.reason?.message : henricoRes.value?.status);
        }

        const allCalls = [...richmondCalls, ...henricoCalls];
        console.log(`Total parsed: ${allCalls.length} calls`);

        if (allCalls.length === 0) {
            return Response.json({
                success: false,
                error: 'No calls parsed from either source',
                timestamp: now.toISOString()
            }, { status: 502 });
        }

        // Fetch existing auto-ingested calls (richmond + henrico only)
        const [existingRichmond, existingHenrico] = await Promise.all([
            base44.asServiceRole.entities.DispatchCall.filter({ source: 'richmond' }),
            base44.asServiceRole.entities.DispatchCall.filter({ source: 'henrico' })
        ]);
        const existingCalls = [...existingRichmond, ...existingHenrico];
        const existingMap = new Map(existingCalls.map(c => [c.call_id, c]));
        console.log(`Found ${existingCalls.length} existing RPD/HPD calls in database`);

        // Classify new calls using AI priority system
        const newCallsToInsert = allCalls.filter(c => !existingMap.has(c.call_id));
        const classificationMap = new Map();
        if (newCallsToInsert.length > 0) {
            try {
                const BATCH_SIZE = 20;
                for (let i = 0; i < newCallsToInsert.length; i += BATCH_SIZE) {
                    const batch = newCallsToInsert.slice(i, i + BATCH_SIZE);
                    const classifyRes = await fetch(`https://${req.headers.get('host')}/classifyCallPriority`, {
                        method: 'POST',
                        headers: { ...Object.fromEntries(req.headers), 'content-type': 'application/json' },
                        body: JSON.stringify({ calls: batch })
                    });
                    if (classifyRes.ok) {
                        const classifyData = await classifyRes.json();
                        (classifyData.results || []).forEach((r, idx) => {
                            classificationMap.set(batch[idx].call_id, r);
                        });
                    }
                    await sleep(300);
                }
                console.log(`Classified ${classificationMap.size} new calls`);
            } catch (classifyErr) {
                console.error('Classification step failed (non-fatal):', classifyErr);
            }
        }

        let inserted = 0, updated = 0, geocoded = 0, geocodeSkipped = 0;
        const newCallIds = new Set(allCalls.map(c => c.call_id));

        for (const callData of allCalls) {
            const existing = existingMap.get(callData.call_id);

            if (existing) {
                const locationChanged = existing.location !== callData.location;
                const missingCoords = !existing.latitude || !existing.longitude;
                if ((locationChanged || missingCoords) && geocoded < MAX_GEOCODE_PER_RUN) {
                    const coords = await geocodeAddress(callData.location, callData.source);
                    if (coords) {
                        callData.latitude = coords.latitude;
                        callData.longitude = coords.longitude;
                        geocoded++;
                    } else {
                        callData.latitude = existing.latitude;
                        callData.longitude = existing.longitude;
                    }
                } else {
                    callData.latitude = existing.latitude;
                    callData.longitude = existing.longitude;
                }

                const statusChanged = existing.status !== callData.status;
                if (statusChanged || locationChanged) {
                    try {
                        await base44.asServiceRole.entities.DispatchCall.update(existing.id, {
                            status: callData.status,
                            time_received: callData.time_received,
                            location: callData.location,
                            zone: callData.zone,
                            latitude: callData.latitude,
                            longitude: callData.longitude
                        });
                        updated++;
                        await sleep(150);
                    } catch (_e) { /* record deleted concurrently */ }
                }
            } else {
                if (geocoded < MAX_GEOCODE_PER_RUN) {
                    const coords = await geocodeAddress(callData.location, callData.source);
                    if (coords) {
                        callData.latitude = coords.latitude;
                        callData.longitude = coords.longitude;
                        geocoded++;
                        console.log(`Geocoded: ${callData.location} -> (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`);
                    } else {
                        console.log(`Could not geocode: ${callData.location}`);
                    }
                } else {
                    geocodeSkipped++;
                }

                const classification = classificationMap.get(callData.call_id);
                if (classification) {
                    const levelMap = { 1: 'critical', 2: 'high', 3: 'medium', 4: 'low' };
                    callData.priority = levelMap[classification.priority_level] || 'medium';
                }

                try {
                    await base44.asServiceRole.entities.DispatchCall.create(callData);
                    inserted++;
                    await sleep(200);
                } catch (_e) { /* duplicate — skip */ }
            }
        }

        // Delete RPD/HPD calls no longer on the live sites
        let deleted = 0;
        for (const existing of existingCalls) {
            if (!newCallIds.has(existing.call_id)) {
                try {
                    await base44.asServiceRole.entities.DispatchCall.delete(existing.id);
                    deleted++;
                    console.log(`Removed: ${existing.incident} @ ${existing.location}`);
                } catch (_e) { /* already deleted */ }
            }
        }

        console.log(`DB: ${inserted} created (${geocoded} geocoded, ${geocodeSkipped} skipped), ${updated} updated, ${deleted} deleted`);

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
            sources: {
                richmond: 'https://apps.richmondgov.com/applications/ActiveCalls (AJAX: /Home/ActiveCalls)',
                henrico: 'https://activecalls.henrico.gov/'
            },
            richmond_calls: richmondCalls.length,
            henrico_calls: henricoCalls.length,
            total_parsed: allCalls.length,
            inserted,
            updated,
            deleted,
            geocoded,
            geocode_skipped: geocodeSkipped,
            alerts_created: alertsCreated
        });

    } catch (error) {
        console.error('Ingestion failed:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});