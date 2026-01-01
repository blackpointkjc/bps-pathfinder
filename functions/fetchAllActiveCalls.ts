import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('🔍 Fetching calls from ALL sources...');
        
        const calls = [];
        
        // Load dispatch-created calls from database
        try {
            console.log('📡 Fetching from dispatch database...');
            const dispatchCalls = await base44.entities.DispatchCall.filter({
                status: { $in: ['New', 'Pending', 'Dispatched', 'Enroute', 'On Scene'] }
            });
            
            if (dispatchCalls && dispatchCalls.length > 0) {
                for (const dbCall of dispatchCalls) {
                    calls.push({
                        timeReceived: dbCall.time_received || new Date(dbCall.created_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                        incident: dbCall.incident,
                        location: dbCall.location,
                        agency: dbCall.agency || 'Unknown',
                        status: dbCall.status || 'Dispatched',
                        latitude: dbCall.latitude,
                        longitude: dbCall.longitude,
                        source: 'dispatch',
                        id: dbCall.id
                    });
                }
                console.log(`✅ Database: ${dispatchCalls.length} dispatch calls`);
            }
        } catch (error) {
            console.error('❌ Error fetching from dispatch database:', error);
        }
        
        // Source 1: gractivecalls.com (Greater Richmond Area - ALL tabs)
        try {
            console.log('📡 Fetching from gractivecalls.com...');
            
            // Fetch ALL tabs - gractivecalls shows Richmond, Henrico AND Chesterfield
            const response1 = await fetch('https://gractivecalls.com/', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (response1.ok) {
                const html = await response1.text();
                
                // Find the table body - gractivecalls uses a specific structure
                const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
                if (!tbodyMatch) {
                    console.error('❌ Could not find table body in gractivecalls.com');
                } else {
                    const tbodyHtml = tbodyMatch[1];
                    // Match all table rows
                    const rowMatches = tbodyHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
                    
                    for (const rowMatch of rowMatches) {
                        const rowHtml = rowMatch[1];
                        const cells = [];
                        
                        // Extract all td content
                        const cellMatches = rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                        
                        for (const match of cellMatches) {
                            let text = match[1]
                                .replace(/<[^>]+>/g, '')
                                .replace(/&nbsp;/g, ' ')
                                .replace(/&amp;/g, '&')
                                .replace(/&#x27;/g, "'")
                                .trim();
                            cells.push(text);
                        }
                        
                        // We should have 6 cells: Time, Incident, Location, Agency, Status, Actions
                        if (cells.length >= 5) {
                            const timeReceived = cells[0];
                            const incident = cells[1];
                            const location = cells[2];
                            const agency = cells[3];
                            const status = cells[4];
                            
                            // Validate
                            if (incident && incident.trim() && location && location.trim() && agency && agency.trim()) {
                                let mappedAgency = agency.trim();
                                const incidentLower = incident.toLowerCase();
                                
                                // Map fire agencies to police for firearm calls
                                const isPoliceFireCall = incidentLower.includes('firearm') || 
                                                         incidentLower.includes('gunfire') || 
                                                         incidentLower.includes('shooting') ||
                                                         incidentLower.includes('shots fired');
                                
                                if (isPoliceFireCall) {
                                    if (agency.includes('CCFD')) mappedAgency = 'CCPD';
                                    else if (agency.includes('RFD')) mappedAgency = 'RPD';
                                    else if (agency.includes('HFD')) mappedAgency = 'HPD';
                                }
                                
                                calls.push({
                                    timeReceived: timeReceived || 'Unknown',
                                    incident: incident.trim(),
                                    location: location.trim(),
                                    agency: mappedAgency,
                                    status: (status && status.trim()) || 'Dispatched',
                                    source: 'gractivecalls.com'
                                });
                            }
                        }
                    }
                }
                
                const grCallCount = calls.filter(c => c.source === 'gractivecalls.com').length;
                console.log(`✅ gractivecalls.com: Found ${grCallCount} calls`);
                
                // Count by agency for debugging
                const agencyCounts = {};
                calls.forEach(c => {
                    if (c.source === 'gractivecalls.com') {
                        agencyCounts[c.agency] = (agencyCounts[c.agency] || 0) + 1;
                    }
                });
                console.log('📊 Agencies from gractivecalls:', JSON.stringify(agencyCounts));
            }
        } catch (error) {
            console.error('❌ Error fetching from gractivecalls.com:', error);
        }
        
        // Source 2: Henrico County Active Calls
        try {
            console.log('📡 Fetching from Henrico County...');
            const response2 = await fetch('https://activecalls.henrico.gov/', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            
            if (response2.ok) {
                const html = await response2.text();
                const tableStart = html.indexOf('<table');
                const tableEnd = html.indexOf('</table>', tableStart);
                
                if (tableStart !== -1 && tableEnd !== -1) {
                    const tableHtml = html.substring(tableStart, tableEnd + 8);
                    const rows = tableHtml.split(/<tr[^>]*>/i).slice(1);
                    
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row.includes('<td')) continue;
                        
                        const cells = [];
                        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                        
                        for (const match of cellMatches) {
                            const text = match[1]
                                .replace(/<[^>]+>/g, '')
                                .replace(/&nbsp;/g, ' ')
                                .trim();
                            cells.push(text);
                        }
                        
                        if (cells.length >= 2) {
                            const timeReceived = cells[0] || 'Unknown';
                            const incident = cells[1] || '';
                            const location = cells[2] || '';
                            const status = cells[3] || 'Dispatched';
                            
                            // Validate that location is not a time value
                            const isTimeValue = /^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(location?.trim());
                            
                            if (incident.trim() && location.trim() && !isTimeValue) {
                                calls.push({
                                    timeReceived,
                                    incident: incident.trim(),
                                    location: location.trim(),
                                    agency: 'Henrico Police',
                                    status: status.trim(),
                                    source: 'activecalls.henrico.gov'
                                });
                            }
                        }
                    }
                }
                console.log(`✅ Henrico: ${calls.filter(c => c.source === 'activecalls.henrico.gov').length} calls`);
            }
        } catch (error) {
            console.error('❌ Error fetching from Henrico:', error);
        }
        
        // Note: Chesterfield calls (CCPD, CCFD) are included in gractivecalls.com source above
        
        // Auto-archive old dispatch calls to history
        try {
            await base44.asServiceRole.functions.invoke('archiveOldCalls', {});
        } catch (error) {
            // Silently fail if archiving fails
        }
        
        console.log(`✅ Total calls from all sources: ${calls.length}`);
        
        if (calls.length === 0) {
            console.warn('⚠️ No calls found in HTML table. Check if website structure changed.');
            return Response.json({
                success: false,
                error: 'No calls found on website',
                totalCalls: 0,
                geocodedCalls: [],
                timestamp: new Date().toISOString()
            });
        }
        
        // Fast geocoding with 10 second timeout
        console.log(`🔍 Geocoding ${calls.length} calls...`);
        const geocodedCalls = [];
        
        const geocodeWithTimeout = Promise.race([
            (async () => {
                const results = await Promise.allSettled(
                    calls.map(async (call) => {
                        if (call.latitude && call.longitude) return call;
                        
                        try {
                            const agencyLower = call.agency.toLowerCase();
                            let jurisdiction = 'Virginia, USA';
                            
                            if (agencyLower.includes('ccpd') || agencyLower.includes('chesterfield')) {
                                jurisdiction = 'Chesterfield County, VA';
                            } else if (agencyLower.includes('rpd') || agencyLower.includes('rfd')) {
                                jurisdiction = 'Richmond, VA';
                            } else if (agencyLower.includes('hpd') || agencyLower.includes('henrico')) {
                                jurisdiction = 'Henrico County, VA';
                            }
                            
                            let address = call.location.trim().replace(/\s+Block\s+/gi, ' ');
                            if (address.includes('/')) {
                                const parts = address.split('/');
                                address = `${parts[0].trim()} and ${parts[1].trim()}`;
                            }
                            
                            const response = await fetch(
                                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', ' + jurisdiction)}&limit=1`,
                                { headers: { 'User-Agent': 'Emergency-Dispatch-App/1.0' } }
                            );
                            const data = await response.json();
                            
                            if (data?.[0]) {
                                return { ...call, latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
                            }
                            return null;
                        } catch {
                            return null;
                        }
                    })
                );
                return results;
            })(),
            new Promise(resolve => setTimeout(() => resolve([]), 10000))
        ]);
        
        const results = await geocodeWithTimeout;
        results.forEach(result => {
            if (result?.status === 'fulfilled' && result.value?.latitude && result.value?.longitude) {
                geocodedCalls.push(result.value);
            }
        });
        
        console.log(`✅ Geocoded ${geocodedCalls.length}/${calls.length} calls`);
        
        console.log(`✅ Geocoded ${geocodedCalls.filter(c => c.latitude).length}/${geocodedCalls.length} calls`);
        
        // Generate AI summaries for geocoded calls only (skip if no coordinates)
        const callsWithSummaries = geocodedCalls.map(call => ({
            ...call,
            ai_summary: call.ai_summary || `${call.incident} at ${call.location}`
        }));
        
        return Response.json({
            success: true,
            totalCalls: calls.length,
            geocodedCalls: callsWithSummaries,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error fetching all active calls:', error);
        return Response.json({ 
            error: 'Failed to fetch calls',
            details: error.message 
        }, { status: 500 });
    }
});