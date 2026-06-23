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
 * Live scraping of gractivecalls.com requires a backend function to avoid CORS.
 * Client-side sync is disabled. Returns empty result so the dashboard still loads.
 * To re-enable, upgrade to a plan with backend functions and use the ingestGractivecalls function.
 */
export async function syncGractiveCalls() {
    console.log('[gractiveScraper] Client-side sync disabled — requires backend function. Data loads from database only.');
    return { added: 0, updated: 0, total: 0 };
}