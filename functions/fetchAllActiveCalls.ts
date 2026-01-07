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
        
        // Source 1: gractivecalls.com (Richmond mainly)
        try {
            console.log('📡 Fetching from gractivecalls.com...');
            const response1 = await fetch('https://gractivecalls.com/', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            
            if (response1.ok) {
                const html = await response1.text();
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
                        
                        if (cells.length >= 3) {
                            const [timeReceived, incident, location, agency, status] = cells;
                            
                            // Validate that location is not a time value
                            const isTimeValue = /^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(location?.trim());
                            
                            if (incident && incident.trim() && location && location.trim() && !isTimeValue) {
                                calls.push({
                                    timeReceived: timeReceived || 'Unknown',
                                    incident: incident.trim(),
                                    location: location.trim(),
                                    agency: (agency && agency.trim()) || 'Unknown',
                                    status: (status && status.trim()) || 'Dispatched',
                                    source: 'gractivecalls.com'
                                });
                            }
                        }
                    }
                }
                console.log(`✅ gractivecalls.com: ${calls.filter(c => c.source === 'gractivecalls.com').length} calls`);
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
                                // Determine if it's a fire/EMS call or police call
                                const incidentLower = incident.toLowerCase();
                                let agency = 'Henrico Police';
                                
                                // Fire/EMS keywords
                                if (incidentLower.includes('fire') || 
                                    incidentLower.includes('rescue') || 
                                    incidentLower.includes('ems') || 
                                    incidentLower.includes('medical') || 
                                    incidentLower.includes('cardiac') ||
                                    incidentLower.includes('stroke') ||
                                    incidentLower.includes('unconscious') ||
                                    incidentLower.includes('breathing') ||
                                    incidentLower.includes('overdose') ||
                                    incidentLower.includes('choking') ||
                                    incidentLower.includes('accident with injury') ||
                                    incidentLower.includes('vehicle accident w/ injury') ||
                                    incidentLower.includes('mva with injury')) {
                                    agency = 'Henrico Fire';
                                }
                                
                                // Police keywords (including gun-related)
                                if (incidentLower.includes('gun') || 
                                    incidentLower.includes('firearm') || 
                                    incidentLower.includes('shooting') ||
                                    incidentLower.includes('shots fired') ||
                                    incidentLower.includes('weapon') ||
                                    incidentLower.includes('robbery') ||
                                    incidentLower.includes('assault') ||
                                    incidentLower.includes('theft') ||
                                    incidentLower.includes('burglary') ||
                                    incidentLower.includes('domestic') ||
                                    incidentLower.includes('suspicious') ||
                                    incidentLower.includes('trespass') ||
                                    incidentLower.includes('violation') ||
                                    incidentLower.includes('warrant') ||
                                    incidentLower.includes('pursuit')) {
                                    agency = 'Henrico Police';
                                }
                                
                                calls.push({
                                    timeReceived,
                                    incident: incident.trim(),
                                    location: location.trim(),
                                    agency,
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

        console.log(`✅ Total scraped calls: ${calls.length}`);

        // Save all scraped calls to database quickly (no geocoding)
        for (const call of calls) {
            try {
                const callId = `${call.source}-${call.timeReceived}-${call.incident}-${call.location}`.replace(/[^a-zA-Z0-9-]/g, '_');
                
                // Parse the call time
                let callTime = new Date();
                if (call.timeReceived) {
                    const timeMatch = call.timeReceived.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                    if (timeMatch) {
                        const hours = parseInt(timeMatch[1]);
                        const minutes = parseInt(timeMatch[2]);
                        const isPM = timeMatch[3].toUpperCase() === 'PM';
                        
                        let hours24 = hours;
                        if (isPM && hours !== 12) hours24 = hours + 12;
                        if (!isPM && hours === 12) hours24 = 0;
                        
                        callTime.setHours(hours24, minutes, 0, 0);
                        
                        // If call time is in the future, assume it's from yesterday
                        if (callTime > new Date()) {
                            callTime.setDate(callTime.getDate() - 1);
                        }
                    }
                }
                
                // Check if call already exists
                const existingCalls = await base44.asServiceRole.entities.DispatchCall.filter({ call_id: callId });
                
                if (!existingCalls || existingCalls.length === 0) {
                    // Create new call in database (save even without coordinates)
                    await base44.asServiceRole.entities.DispatchCall.create({
                        call_id: callId,
                        incident: call.incident,
                        location: call.location,
                        latitude: null,
                        longitude: null,
                        agency: call.agency,
                        status: call.status || 'New',
                        time_received: callTime.toISOString(),
                        description: call.ai_summary || `${call.incident} at ${call.location}`
                    });
                    console.log(`💾 Saved: ${callId}`);
                }
            } catch (error) {
                console.error('Error saving call to database:', error);
            }
        }
        
        // Fetch recent calls from database (last hour only)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const dbCalls = await base44.asServiceRole.entities.DispatchCall.list('-time_received', 200);
        
        const recentCalls = dbCalls.filter(call => {
            const receivedTime = new Date(call.time_received || call.created_date);
            return receivedTime >= oneHourAgo;
        }).map(call => ({
            id: call.id,
            callId: call.call_id,
            timeReceived: new Date(call.time_received || call.created_date).toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
            }),
            incident: call.incident,
            location: call.location,
            agency: call.agency,
            status: call.status,
            latitude: call.latitude,
            longitude: call.longitude,
            ai_summary: call.description || `${call.incident} at ${call.location}`,
            source: 'database'
        }));
        
        console.log(`📋 Returning ${recentCalls.length} calls from database`);
        
        return Response.json({
            success: true,
            totalCalls: recentCalls.length,
            geocodedCalls: recentCalls,
            geocodedCount: recentCalls.filter(c => c.latitude).length,
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