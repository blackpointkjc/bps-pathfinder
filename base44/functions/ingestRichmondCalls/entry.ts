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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Extract calls via LLM with web search ────────────────────────────────────
// The Richmond page renders its table via JavaScript, so a plain fetch only gets
// a loading shell. Gemini with web search can render and extract the table.
async function extractCallsViaLLM(base44) {
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
    return extractedData?.calls || [];
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const now = new Date();

        console.log('Starting RPD/RFD calls ingestion from apps.richmondgov.com...');

        const rawCalls = await extractCallsViaLLM(base44);
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

        // Richmond's page shows all active calls for the day — use a 12-hour window
        // so genuinely active incidents aren't phased out prematurely.
        const cutoff = Date.now() - 12 * 60 * 60 * 1000;
        const activeCalls = allCalls.filter(c => new Date(c.time_received).getTime() >= cutoff);
        const phasedOut = allCalls.length - activeCalls.length;

        const hashOf = (cid) => cid && cid.includes('-') ? cid.split('-').slice(1).join('-') : cid;
        const incomingIds = new Set(activeCalls.map(c => hashOf(c.call_id)));
        const existingByCallId = new Map();
        const duplicateIdsToDelete = [];
        let created = 0, updated = 0, closed = 0;

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

        // Geocoding is handled by the geocodeMissingCalls background process —
        // keeping this function fast and reliable.
        for (const callData of activeCalls) {
            const existingRec = existingByCallId.get(hashOf(callData.call_id));

            try {
                if (existingRec) {
                    const statusChanged = existingRec.status !== callData.status;
                    const incidentChanged = existingRec.incident !== callData.incident;
                    const locationChanged = existingRec.location !== callData.location;
                    if (statusChanged || incidentChanged || locationChanged) {
                        const updates = {
                            status: callData.status,
                            incident: callData.incident,
                            location: callData.location,
                            zone: callData.zone,
                            assigned_units: callData.assigned_units,
                        };
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

        console.log(`DB: ${created} created, ${updated} updated, ${closed} closed, ${duplicateIdsToDelete.length} dupes removed`);

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
            active_within_12h: activeCalls.length,
            phased_out: phasedOut,
            created,
            updated,
            closed,
            duplicates_removed: duplicateIdsToDelete.length,
            alerts_created: alertsCreated,
            dedup_enabled: true
        });

    } catch (error) {
        console.error('Richmond ingestion failed:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});