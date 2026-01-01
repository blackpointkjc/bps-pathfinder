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
                                calls.push({
                                    timeReceived: timeReceived || 'Unknown',
                                    incident: incident.trim(),
                                    location: location.trim(),
                                    agency: agency.trim(),
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
        
        // Geocode all calls with AI assistance (skip if already has coordinates from database)
        const geocodedCalls = [];
        for (const call of calls) {
            // Skip geocoding if call already has coordinates (from dispatch database)
            if (call.latitude && call.longitude) {
                geocodedCalls.push(call);
                continue;
            }
            try {
                const locationLower = call.location.toLowerCase();
                const agencyLower = call.agency.toLowerCase();
                let jurisdiction = 'Virginia, USA';
                
                console.log(`🔍 Determining jurisdiction for: Agency="${call.agency}", Location="${call.location}"`);
                
                // Check for Chesterfield - be very broad
                if (agencyLower.includes('ccpd') || 
                    agencyLower.includes('ccfd') || 
                    agencyLower.includes('chesterfield') || 
                    agencyLower.includes('cfrd') ||
                    agencyLower.includes('cfd') ||
                    agencyLower.includes('ches') ||
                    locationLower.includes('chester') || 
                    locationLower.includes('midlothian') || 
                    locationLower.includes('bon air') || 
                    locationLower.includes('ettrick') ||
                    locationLower.includes('colonial heights') || 
                    locationLower.includes('matoaca') ||
                    locationLower.includes('woodlake') || 
                    locationLower.includes('beach road') ||
                    locationLower.includes('ironbridge') || 
                    locationLower.includes('iron bridge')) {
                    jurisdiction = 'Chesterfield County, VA, USA';
                    console.log(`✅ Identified as Chesterfield County`);
                } else if (call.agency.includes('RPD') || call.agency.includes('RFD') || call.agency.includes('BPS') || call.agency.includes('BSP')) {
                    jurisdiction = 'Richmond, VA, USA';
                    console.log(`✅ Identified as Richmond`);
                } else if (call.agency.includes('HCPD') || call.agency.includes('HPD') || call.agency.includes('Henrico')) {
                    jurisdiction = 'Henrico County, VA, USA';
                    console.log(`✅ Identified as Henrico County`);
                }
                
                // Clean address format (handle intersections, blocks, etc.)
                let cleanedAddress = call.location.trim();
                
                // Remove "Block" text (e.g., "8800 Block THREE CHOPT RD" -> "8800 THREE CHOPT RD")
                cleanedAddress = cleanedAddress.replace(/\s+Block\s+/gi, ' ');
                
                // Convert intersection format "STREET1/STREET2" to "STREET1 and STREET2"
                if (cleanedAddress.includes('/')) {
                    const parts = cleanedAddress.split('/').map(s => s.trim());
                    cleanedAddress = `${parts[0]} and ${parts[1]}`;
                }
                
                // Remove trailing jurisdiction indicators
                cleanedAddress = cleanedAddress.replace(/\s+(RICH|CHES|HENR|VA|RICHMOND|HENRICO|CHESTERFIELD)$/i, '').trim();
                
                // Try geocoding with cleaned address - try multiple strategies
                let geoData = null;
                
                // Strategy 1: Try with full cleaned address
                let query = `${cleanedAddress}, ${jurisdiction}`;
                let geoResponse = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=us`,
                    { headers: { 'User-Agent': 'Emergency-Dispatch-App/1.0' } }
                );
                geoData = await geoResponse.json();
                
                // Strategy 2: If no results and has "and" (intersection), try without "and"
                if ((!geoData || geoData.length === 0) && cleanedAddress.includes(' and ')) {
                    const firstStreet = cleanedAddress.split(' and ')[0].trim();
                    query = `${firstStreet}, ${jurisdiction}`;
                    geoResponse = await fetch(
                        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=us`,
                        { headers: { 'User-Agent': 'Emergency-Dispatch-App/1.0' } }
                    );
                    geoData = await geoResponse.json();
                }
                
                if (geoData && geoData.length > 0) {
                    const lat = parseFloat(geoData[0].lat);
                    const lon = parseFloat(geoData[0].lon);
                    console.log(`✅ GEOCODED: ${call.agency} - ${call.incident} at ${call.location}: [${lat}, ${lon}] in ${jurisdiction}`);
                    geocodedCalls.push({
                        ...call,
                        latitude: lat,
                        longitude: lon
                    });
                } else {
                    console.log(`❌ FAILED TO GEOCODE: ${call.agency} - ${call.incident} at ${call.location} in ${jurisdiction}`);
                    console.log(`   Query was: ${query}`);
                    // DON'T add calls without coordinates - they won't show on map anyway
                }
                
                // Rate limit to avoid hitting Nominatim too hard
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Error geocoding ${call.location}:`, error);
                geocodedCalls.push({
                    ...call,
                    latitude: null,
                    longitude: null
                });
            }
        }
        
        console.log(`✅ Geocoded ${geocodedCalls.filter(c => c.latitude).length}/${geocodedCalls.length} calls`);
        
        // DEBUGGING: Count CCPD/CCFD before and after geocoding
        const ccpdBeforeGeocode = calls.filter(c => c.agency?.includes('CCPD') || c.agency?.includes('CCFD')).length;
        const ccpdAfterGeocode = geocodedCalls.filter(c => c.agency?.includes('CCPD') || c.agency?.includes('CCFD')).length;
        const ccpdWithCoords = geocodedCalls.filter(c => (c.agency?.includes('CCPD') || c.agency?.includes('CCFD')) && c.latitude && c.longitude).length;
        
        console.log(`🔍 CHESTERFIELD TRACKING:`);
        console.log(`   Before geocoding: ${ccpdBeforeGeocode} calls`);
        console.log(`   After geocoding: ${ccpdAfterGeocode} calls`);
        console.log(`   With valid coords: ${ccpdWithCoords} calls`);
        
        // Generate AI summaries for geocoded calls only (skip if no coordinates)
        const callsWithSummaries = geocodedCalls.map(call => ({
            ...call,
            ai_summary: call.ai_summary || `${call.incident} at ${call.location}`
        }));
        
        // FINAL DEBUG: What are we actually returning?
        const finalCCPD = callsWithSummaries.filter(c => c.agency?.includes('CCPD') || c.agency?.includes('CCFD')).length;
        console.log(`   In final response: ${finalCCPD} Chesterfield calls`);
        
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