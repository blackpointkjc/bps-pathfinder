import { base44 } from '@/api/base44Client';

// Maps agency string from site to our internal values
function detectAgency(agencyStr) {
    const a = (agencyStr || '').trim().toUpperCase();
    if (a === 'RPD') return { agency: 'RPD', source: 'richmond' };
    if (a === 'RFD') return { agency: 'RFD', source: 'richmond' };
    if (a === 'HPD' || a === 'HCPD') return { agency: 'HPD', source: 'henrico' };
    if (a === 'HFD' || a === 'HCFD') return { agency: 'HFD', source: 'henrico' };
    if (a === 'CCPD') return { agency: 'CCPD', source: 'chesterfield' };
    if (a === 'CCFD') return { agency: 'CCFD', source: 'chesterfield' };
    return { agency: a, source: 'richmond' };
}

function normalizeStatus(s) {
    const v = (s || '').trim();
    if (/^arrived$/i.test(v)) return 'Arrived';
    if (/^dispatched$/i.test(v)) return 'Dispatched';
    if (/^enroute$/i.test(v)) return 'Enroute';
    if (/^on.scene$/i.test(v)) return 'On Scene';
    if (/^cleared$/i.test(v)) return 'Cleared';
    if (/^cancelled$/i.test(v)) return 'Cancelled';
    if (/^arv/i.test(v)) return 'Arrived';
    if (/^assigned/i.test(v)) return 'Dispatched';
    return v || 'New';
}

// Parse ET wall-clock time in multiple formats:
// "06/22/2026 7:48 PM", "7:48 PM", "06/22/2026 20:56", "20:56"
function parseTimeET(timeStr) {
    if (!timeStr) return null;
    try {
        const cleaned = timeStr.trim();

        // Full datetime with AM/PM: "06/22/2026 7:48 PM"
        const fullAMPM = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        // Full datetime 24h: "06/22/2026 20:56"
        const full24h = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
        // Time only AM/PM: "7:48 PM"
        const timeAMPM = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        // Time only 24h: "20:56"
        const time24h = cleaned.match(/^(\d{1,2}):(\d{2})$/);

        let month, day, year, h, m;

        const todayET = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
        const todayParts = todayET.split('/');

        if (fullAMPM) {
            [, month, day, year] = fullAMPM;
            h = parseInt(fullAMPM[4], 10);
            m = parseInt(fullAMPM[5], 10);
            const ap = fullAMPM[6].toUpperCase();
            if (ap === 'PM' && h !== 12) h += 12;
            if (ap === 'AM' && h === 12) h = 0;
        } else if (full24h) {
            [, month, day, year] = full24h;
            h = parseInt(full24h[4], 10);
            m = parseInt(full24h[5], 10);
        } else if (timeAMPM) {
            [month, day, year] = todayParts;
            h = parseInt(timeAMPM[1], 10);
            m = parseInt(timeAMPM[2], 10);
            const ap = timeAMPM[3].toUpperCase();
            if (ap === 'PM' && h !== 12) h += 12;
            if (ap === 'AM' && h === 12) h = 0;
        } else if (time24h) {
            [month, day, year] = todayParts;
            h = parseInt(time24h[1], 10);
            m = parseInt(time24h[2], 10);
        } else {
            return null;
        }

        const MM = String(month).padStart(2, '0');
        const DD = String(day).padStart(2, '0');
        const HH = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');

        // Treat as ET wall-clock: build fake UTC then apply ET offset
        const fakeUTC = new Date(`${year}-${MM}-${DD}T${HH}:${mm}:00Z`);
        const etWall = new Date(fakeUTC.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const offsetMs = fakeUTC.getTime() - etWall.getTime();
        return new Date(fakeUTC.getTime() + offsetMs).toISOString();
    } catch {
        return null;
    }
}

// Build a stable dedup key: agency + incident + location + time_received (rounded to minute)
function buildDedupKey(incident, location, agency, timeStr) {
    const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    // Round time to nearest minute for dedup
    let timePart = '';
    if (timeStr) {
        try {
            const d = new Date(timeStr);
            if (!isNaN(d)) {
                timePart = `${d.getUTCFullYear()}${d.getUTCMonth()}${d.getUTCDate()}${d.getUTCHours()}${d.getUTCMinutes()}`;
            }
        } catch {}
    }
    return `${slug(agency)}-${slug(incident)}-${slug(location)}-${timePart}`;
}

const SYNC_SCHEMA = {
    type: 'object',
    properties: {
        calls: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    call_id:      { type: 'string' },
                    incident:     { type: 'string' },
                    location:     { type: 'string' },
                    agency:       { type: 'string' },
                    status:       { type: 'string' },
                    time_received:{ type: 'string' },
                    units:        { type: 'string' },
                    description:  { type: 'string' }
                },
                required: ['incident', 'location', 'agency']
            }
        },
        fetch_time: { type: 'string' },
        total_found: { type: 'number' }
    }
};

/**
 * Syncs live calls from gractivecalls.com using LLM web fetch.
 * Returns { added, updated, total, errors, log }
 */
export async function syncGractiveCalls() {
    const syncStart = new Date();
    const log = [];
    log.push(`[SYNC ${syncStart.toLocaleTimeString('en-US', { hour12: false })}] ► Starting sync from gractivecalls.com`);

    let rawCalls = [];
    try {
        const result = await base44.integrations.Core.InvokeLLM({
            prompt: `Visit https://gractivecalls.com/ right now and extract ALL currently active dispatch calls shown on the page.
            
Return EVERY call you see — do not skip any. The table typically has columns like: Time Received, Call Type/Incident, Location, Agency (RPD/RFD/HPD/HFD/CCPD/CCFD), Status, Unit(s).

For each call extract:
- call_id: any call ID or incident number shown (empty string if none)
- incident: the call type / incident description
- location: the full address or intersection
- agency: the agency code (RPD, RFD, HPD, HFD, CCPD, CCFD)
- status: the current status (Dispatched, Enroute, Arrived, On Scene, etc.)
- time_received: the exact time received as shown on the page (e.g. "06/23/2026 20:45" or "06/23/2026 8:45 PM")
- units: any unit numbers assigned
- description: any additional notes

Return ALL calls. Do not filter or skip any. Include cleared/closed calls too if shown.`,
            add_context_from_internet: true,
            model: 'gemini_3_flash',
            response_json_schema: SYNC_SCHEMA
        });

        rawCalls = result?.calls || [];
        log.push(`[SYNC] ✓ LLM fetch complete — found ${rawCalls.length} calls on gractivecalls.com`);
        log.push(`[SYNC] Fetch time reported by LLM: ${result?.fetch_time || 'unknown'}`);
    } catch (err) {
        const msg = `[SYNC] ✗ LLM fetch FAILED: ${err?.message || String(err)}`;
        log.push(msg);
        console.error(msg, err);
        return { added: 0, updated: 0, total: 0, errors: [msg], log };
    }

    if (!rawCalls.length) {
        log.push('[SYNC] ⚠ No calls returned from LLM — aborting');
        return { added: 0, updated: 0, total: 0, errors: ['No calls returned'], log };
    }

    // Load existing active calls from DB for dedup
    let existingCalls = [];
    try {
        existingCalls = await base44.entities.DispatchCall.list('-time_received', 500);
    } catch (err) {
        log.push(`[SYNC] ⚠ Could not load existing calls: ${err?.message}`);
    }

    // Build dedup map: dedupKey → existing record
    const existingByDedupKey = new Map();
    const existingByCallId = new Map();
    for (const c of existingCalls) {
        if (c.call_id) existingByCallId.set(c.call_id.trim(), c);
        const key = buildDedupKey(c.incident, c.location, c.agency, c.time_received);
        existingByDedupKey.set(key, c);
    }

    let added = 0;
    let updated = 0;
    let newestTime = null;

    for (const raw of rawCalls) {
        if (!raw.incident || !raw.location) continue;

        const { agency, source } = detectAgency(raw.agency);
        const status = normalizeStatus(raw.status);
        const time_received = parseTimeET(raw.time_received);

        if (!time_received) {
            console.warn('[GRACTIVE] Skipping call with unparseable time:', raw.time_received, raw.incident);
            continue;
        }

        if (time_received) {
            const t = new Date(time_received);
            if (!newestTime || t > newestTime) newestTime = t;
        }

        // Skip calls that are already closed unless status changed
        if (['Cleared', 'Closed', 'Cancelled'].includes(status)) continue;

        const dedupKey = buildDedupKey(raw.incident, raw.location, agency, time_received);
        const callIdKey = raw.call_id?.trim();

        // Check for existing record
        let existing = null;
        if (callIdKey) existing = existingByCallId.get(callIdKey);
        if (!existing) existing = existingByDedupKey.get(dedupKey);

        const payload = {
            incident: raw.incident,
            location: raw.location,
            agency,
            source,
            status,
            ...(time_received ? { time_received } : {}),
            ...(raw.call_id ? { call_id: raw.call_id } : {}),
            ...(raw.units ? { assigned_units: raw.units.split(/[,\s]+/).filter(Boolean) } : {}),
            ...(raw.description ? { description: raw.description } : {}),
        };

        try {
            if (existing) {
                // Only update if status changed
                if (existing.status !== status) {
                    await base44.entities.DispatchCall.update(existing.id, { status, ...(raw.units ? { assigned_units: raw.units.split(/[,\s]+/).filter(Boolean) } : {}) });
                    updated++;
                    log.push(`[SYNC] ↑ UPDATED: ${raw.incident} @ ${raw.location} [${existing.status} → ${status}]`);
                }
            } else {
                await base44.entities.DispatchCall.create(payload);
                added++;
                log.push(`[SYNC] + ADDED: ${raw.incident} @ ${raw.location} (${agency}, ${raw.time_received || 'no time'})`);
            }
        } catch (err) {
            log.push(`[SYNC] ✗ Error saving call ${raw.incident} @ ${raw.location}: ${err?.message}`);
        }
    }

    const syncEnd = new Date();
    const duration = ((syncEnd - syncStart) / 1000).toFixed(1);
    log.push(`[SYNC] ► Sync complete in ${duration}s — +${added} new, ~${updated} updated, ${rawCalls.length} total on site`);
    if (newestTime) log.push(`[SYNC] ► Newest call time on site: ${newestTime.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: true })}`);

    // Print all logs to console
    log.forEach(l => console.log(l));

    return { added, updated, total: rawCalls.length, errors: [], log, newestTime };
}