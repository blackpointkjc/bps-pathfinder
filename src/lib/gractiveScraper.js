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

// Normalize status string from site
function normalizeStatus(s) {
    const v = (s || '').trim();
    if (/^arrived$/i.test(v)) return 'Arrived';
    if (/^dispatched$/i.test(v)) return 'Dispatched';
    if (/^enroute$/i.test(v)) return 'Enroute';
    if (/^on.scene$/i.test(v)) return 'On Scene';
    if (/^cleared$/i.test(v)) return 'Cleared';
    if (/^cancelled$/i.test(v)) return 'Cancelled';
    // Henrico-style: "Assigned 9:56 pm", "Arv 12:00 am" — keep as-is but map obvious ones
    if (/^arv/i.test(v)) return 'Arrived';
    if (/^assigned/i.test(v)) return 'Dispatched';
    return v || 'New';
}

// Parse "06/22/2026 7:48 PM" → ISO string in ET
function parseTimeET(timeStr) {
    if (!timeStr) return null;
    try {
        // e.g. "06/22/2026 7:48 PM"
        const cleaned = timeStr.trim();
        // Build a date string parseable as ET
        const d = new Date(cleaned + ' EDT');
        if (isNaN(d)) return new Date(cleaned).toISOString();
        return d.toISOString();
    } catch {
        return null;
    }
}

// Build a stable call_id from incident + location + agency
function buildCallId(incident, location, agency) {
    const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return `${slug(agency)}-${slug(incident)}-${slug(location)}`;
}

/**
 * Fetches gractivecalls.com via allorigins CORS proxy, parses the table,
 * and upserts calls into DispatchCall entity.
 * Returns { added, updated, total }
 */
export async function syncGractiveCalls() {
    const PROXY = 'https://api.allorigins.win/get?url=';
    const TARGET = encodeURIComponent('https://gractivecalls.com/');
    const res = await fetch(`${PROXY}${TARGET}`);
    if (!res.ok) throw new Error(`Proxy fetch failed: ${res.status}`);
    const json = await res.json();
    const html = json.contents;
    if (!html) throw new Error('Empty response from proxy');

    // Parse HTML table rows
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const rows = Array.from(doc.querySelectorAll('table tr')).slice(1); // skip header

    if (rows.length === 0) throw new Error('No rows found in table');

    const scraped = [];
    for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 5) continue;
        const timeStr  = cells[0]?.textContent?.trim();
        const incident = cells[1]?.textContent?.trim().replace(/^#+\s*/, '');
        const location = cells[2]?.textContent?.trim();
        const agencyRaw= cells[3]?.textContent?.trim();
        const statusRaw= cells[4]?.textContent?.trim();

        if (!incident || !location) continue;

        const { agency, source } = detectAgency(agencyRaw);
        const call_id = buildCallId(incident, location, agency);

        scraped.push({
            call_id,
            incident,
            location,
            agency,
            source,
            status: normalizeStatus(statusRaw),
            time_received: parseTimeET(timeStr),
            priority: 'medium',
        });
    }

    if (scraped.length === 0) throw new Error('Parsed 0 calls from page');

    // Load existing calls to check for duplicates
    const existing = await base44.entities.DispatchCall.list('-created_date', 500);
    const existingByCallId = {};
    for (const c of existing) {
        if (c.call_id) existingByCallId[c.call_id] = c;
    }

    let added = 0, updated = 0;
    for (const call of scraped) {
        const existing = existingByCallId[call.call_id];
        if (existing) {
            // Update status if changed
            if (existing.status !== call.status) {
                await base44.entities.DispatchCall.update(existing.id, { status: call.status });
                updated++;
            }
        } else {
            // New call — create it
            await base44.entities.DispatchCall.create(call);
            added++;
        }
    }

    return { added, updated, total: scraped.length };
}