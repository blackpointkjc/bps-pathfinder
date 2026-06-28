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

// Parse ET wall-clock time → UTC ISO string
// Formats: "06/28/2026 7:48 PM", "7:48 PM", "06/28/2026 20:56", "20:56"
function parseTimeET(timeStr) {
    if (!timeStr) return null;
    try {
        const cleaned = timeStr.trim();
        let month, day, year, h, m;

        const fullAMPM = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        const full24h  = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
        const timeAMPM = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        const time24h  = cleaned.match(/^(\d{1,2}):(\d{2})$/);

        // Today's date in ET
        const nowET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // "2026-06-28"
        const [todayYear, todayMonth, todayDay] = nowET.split('-');

        if (fullAMPM) {
            [, month, day, year] = fullAMPM;
            h = parseInt(fullAMPM[4], 10); m = parseInt(fullAMPM[5], 10);
            const ap = fullAMPM[6].toUpperCase();
            if (ap === 'PM' && h !== 12) h += 12;
            if (ap === 'AM' && h === 12) h = 0;
        } else if (full24h) {
            [, month, day, year] = full24h;
            h = parseInt(full24h[4], 10); m = parseInt(full24h[5], 10);
        } else if (timeAMPM) {
            month = todayMonth; day = todayDay; year = todayYear;
            h = parseInt(timeAMPM[1], 10); m = parseInt(timeAMPM[2], 10);
            const ap = timeAMPM[3].toUpperCase();
            if (ap === 'PM' && h !== 12) h += 12;
            if (ap === 'AM' && h === 12) h = 0;
        } else if (time24h) {
            month = todayMonth; day = todayDay; year = todayYear;
            h = parseInt(time24h[1], 10); m = parseInt(time24h[2], 10);
        } else {
            return null;
        }

        // ET is UTC-5 (EST) or UTC-4 (EDT). Determine current offset by checking Jan 1 vs Jul 1.
        const jan = new Date(Date.UTC(parseInt(year), 0, 1));
        const jul = new Date(Date.UTC(parseInt(year), 6, 1));
        const testDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        // EDT (summer) = UTC-4, EST (winter) = UTC-5
        const isDST = testDate >= jul || testDate < jan ? false : true;
        // More accurate: check standard ET DST rules (2nd Sun Mar → 1st Sun Nov)
        const etOffsetHours = isEDT(parseInt(year), parseInt(month), parseInt(day)) ? 4 : 5;

        const utcHours = h + etOffsetHours;
        const d = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), utcHours, m, 0));
        return d.toISOString();
    } catch {
        return null;
    }
}

// Returns true if the given date falls in Eastern Daylight Time (UTC-4)
// DST starts 2nd Sunday of March, ends 1st Sunday of November
function isEDT(year, month, day) {
    if (month < 3 || month > 11) return false;
    if (month > 3 && month < 11) return true;
    if (month === 3) {
        // 2nd Sunday of March
        const firstDay = new Date(year, 2, 1).getDay(); // 0=Sun
        const secondSunday = 8 + (7 - firstDay) % 7;
        return day >= secondSunday;
    }
    if (month === 11) {
        // 1st Sunday of November
        const firstDay = new Date(year, 10, 1).getDay();
        const firstSunday = 1 + (7 - firstDay) % 7;
        return day < firstSunday;
    }
    return false;
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
            prompt: `CRITICAL: Visit https://gractivecalls.com/ RIGHT NOW and scroll the page to see ALL dispatch calls currently visible. Extract EVERY SINGLE CALL without exception.

Do NOT skip any calls. Do NOT filter. Do NOT abbreviate. Return the COMPLETE list.

The table has columns like: Time Received, Call Type/Incident, Location, Agency, Status, Unit(s).

For EACH call (no exceptions):
- call_id: call/incident ID or empty string
- incident: EXACT call type / incident description as shown
- location: COMPLETE address or intersection as shown
- agency: agency code (RPD, RFD, HPD, HFD, CCPD, CCFD, etc.)
- status: current status (New, Dispatched, Enroute, Arrived, On Scene, Cleared, etc.)
- time_received: exact time as shown on page (format: "06/22/2026 8:59 PM" or "8:59 PM")
- units: all unit numbers/codes assigned
- description: any additional notes or info

RETURN EVERY SINGLE CALL. Include active, pending, assigned, cleared—ALL calls. Do not omit any.`,
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

        const resolvedTime = time_received || new Date().toISOString();

        const t = new Date(resolvedTime);
        if (!newestTime || t > newestTime) newestTime = t;

        // Do NOT skip any calls — show everything from gractivecalls.com regardless of status

        const dedupKey = buildDedupKey(raw.incident, raw.location, agency, resolvedTime);
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
            time_received: resolvedTime,
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
                log.push(`[SYNC] + ADDED: ${raw.incident} @ ${raw.location} (${agency}, ${raw.time_received || 'no time'}) ${payload.latitude ? '📍 geocoded' : '⚠ no coords'}`);
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