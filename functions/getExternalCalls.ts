import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Cache for external calls (30 second TTL)
let callsCache = {
    data: [],
    timestamp: 0,
    status: 'unknown'
};

const CACHE_TTL = 30000; // 30 seconds

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const now = Date.now();
        
        // Return cached data if fresh
        if (now - callsCache.timestamp < CACHE_TTL && callsCache.data.length > 0) {
            return Response.json({
                success: true,
                calls: callsCache.data,
                cached: true,
                lastRefresh: new Date(callsCache.timestamp).toISOString(),
                status: callsCache.status
            });
        }
        
        // Fetch GR Active Calls (Richmond + Henrico)
        let externalCalls = [];
        let fetchStatus = 'ok';
        
        try {
            const response = await fetch('https://gractivecalls.com/', {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(10000)
            });
            
            if (response.ok) {
                const html = await response.text();
                const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
                
                if (tbodyMatch) {
                    const rows = tbodyMatch[1].split(/<tr[^>]*>/i);
                    
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row.includes('<td')) continue;
                        
                        const cells = [];
                        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                        
                        for (const match of cellMatches) {
                            cells.push(match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
                        }
                        
                        if (cells.length >= 5) {
                            const time = cells[0]?.trim() || '';
                            const incident = cells[1]?.trim() || 'Unknown';
                            const location = cells[2]?.trim() || '';
                            const agency = cells[3]?.trim() || '';
                            const status = cells[4]?.trim() || 'Active';
                            
                            // Determine source
                            let source = 'external_gr';
                            if (agency.toLowerCase().includes('henrico')) {
                                source = 'henrico_external';
                            } else if (agency.toLowerCase().includes('richmond')) {
                                source = 'richmond_external';
                            }
                            
                            if (location && time && incident) {
                                externalCalls.push({
                                    externalSource: 'gractivecalls',
                                    externalCallId: `gr-${Date.now()}-${i}`,
                                    timeReceived: time,
                                    agency,
                                    callType: incident,
                                    priority: assessPriority(incident),
                                    address: location,
                                    locationText: location,
                                    status,
                                    source,
                                    latitude: null, // Will geocode if needed
                                    longitude: null,
                                    lastUpdated: new Date().toISOString()
                                });
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('GR fetch error:', error);
            fetchStatus = 'error';
            
            // Return stale cache if available
            if (callsCache.data.length > 0) {
                return Response.json({
                    success: true,
                    calls: callsCache.data,
                    cached: true,
                    stale: true,
                    lastRefresh: new Date(callsCache.timestamp).toISOString(),
                    status: 'stale',
                    error: 'External feed unavailable - showing cached data'
                });
            }
        }
        
        // Update cache
        callsCache = {
            data: externalCalls,
            timestamp: now,
            status: fetchStatus
        };
        
        return Response.json({
            success: true,
            calls: externalCalls,
            cached: false,
            lastRefresh: new Date(now).toISOString(),
            status: fetchStatus,
            count: externalCalls.length
        });
        
    } catch (error) {
        console.error('Error:', error);
        return Response.json({ 
            success: false, 
            error: error.message,
            calls: callsCache.data,
            stale: true
        }, { status: 500 });
    }
});

function assessPriority(incident) {
    const lower = incident.toLowerCase();
    if (lower.includes('shooting') || lower.includes('stabbing') || lower.includes('officer')) {
        return 'critical';
    }
    if (lower.includes('assault') || lower.includes('robbery') || lower.includes('burglary')) {
        return 'high';
    }
    if (lower.includes('accident') || lower.includes('alarm') || lower.includes('disturbance')) {
        return 'medium';
    }
    return 'low';
}