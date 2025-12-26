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
                            
                            if (incident && incident.trim() && location && location.trim()) {
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
                console.log(`✅ gractivecalls.com: ${calls.length} calls`);
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
                            
                            if (incident.trim() && location.trim()) {
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
        
        // Source 3: Chesterfield County Active Calls
        try {
            console.log('📡 Fetching from Chesterfield County...');
            const response3 = await fetch('https://www.chesterfield.gov/3999/Active-Police-Calls', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            
            if (response3.ok) {
                const html = await response3.text();
                console.log(`📄 Chesterfield HTML fetched (${html.length} chars)`);
                
                // Use AI to parse the Chesterfield table since structure may vary
                const parseResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
                    prompt: `Parse this HTML table from Chesterfield Police Active Calls and extract ALL active calls. Return a JSON array of calls with fields: timeReceived, incident, location, status. HTML: ${html.substring(0, 50000)}`,
                    response_json_schema: {
                        type: "object",
                        properties: {
                            calls: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        timeReceived: { type: "string" },
                                        incident: { type: "string" },
                                        location: { type: "string" },
                                        status: { type: "string" }
                                    }
                                }
                            }
                        }
                    }
                });
                
                if (parseResponse.calls && Array.isArray(parseResponse.calls)) {
                    for (const call of parseResponse.calls) {
                        if (call.incident && call.incident.trim() && call.location && call.location.trim()) {
                            calls.push({
                                timeReceived: call.timeReceived || 'Unknown',
                                incident: call.incident.trim(),
                                location: call.location.trim(),
                                agency: 'CCPD',
                                status: call.status?.trim() || 'Dispatched',
                                source: 'chesterfield.gov'
                            });
                        }
                    }
                }
                console.log(`✅ Chesterfield: ${calls.filter(c => c.source === 'chesterfield.gov').length} calls`);
            }
        } catch (error) {
            console.error('❌ Error fetching from Chesterfield:', error);
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
        
        // Geocode all calls with AI assistance
        const geocodedCalls = [];
        for (const call of calls) {
            try {
                let jurisdiction = 'Virginia, USA';
                
                if (call.agency.includes('RPD') || call.agency.includes('RFD')) {
                    jurisdiction = 'Richmond, VA, USA';
                } else if (call.agency.includes('HCPD') || call.agency.includes('HPD') || call.agency.includes('Henrico')) {
                    jurisdiction = 'Henrico County, VA, USA';
                } else if (call.agency.includes('CCPD') || call.agency.includes('CCFD') || call.agency.includes('Chesterfield')) {
                    jurisdiction = 'Chesterfield County, VA, USA';
                } else if (call.agency.includes('BPS')) {
                    jurisdiction = 'Richmond, VA, USA';
                }
                
                // Use AI to clean and format the address
                const aiAddressResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
                    prompt: `Extract and format this address for geocoding: "${call.location}". Make it a clean, standardized US address format. If it's an intersection, format it properly. Return ONLY the cleaned address, nothing else.`,
                    response_json_schema: {
                        type: "object",
                        properties: {
                            cleaned_address: { type: "string" }
                        }
                    }
                });
                
                const cleanedAddress = aiAddressResponse.cleaned_address || call.location;
                console.log(`🧹 Cleaned: "${call.location}" → "${cleanedAddress}"`);
                
                // Try multiple geocoding strategies
                let geoData = null;
                
                // Strategy 1: Cleaned address with jurisdiction
                const query1 = `${cleanedAddress}, ${jurisdiction}`;
                let geoResponse = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query1)}&limit=1&countrycodes=us`,
                    { headers: { 'User-Agent': 'Emergency-Dispatch-App/1.0' } }
                );
                geoData = await geoResponse.json();
                
                // Strategy 2: Original address with jurisdiction
                if (!geoData || geoData.length === 0) {
                    const query2 = `${call.location}, ${jurisdiction}`;
                    geoResponse = await fetch(
                        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query2)}&limit=1&countrycodes=us`,
                        { headers: { 'User-Agent': 'Emergency-Dispatch-App/1.0' } }
                    );
                    geoData = await geoResponse.json();
                }
                
                // Strategy 3: Extract street number and name
                if (!geoData || geoData.length === 0) {
                    const locationParts = cleanedAddress.match(/^(\d+)\s+(.+)$/);
                    if (locationParts) {
                        const [_, number, street] = locationParts;
                        const query3 = `${number} ${street}, ${jurisdiction}`;
                        geoResponse = await fetch(
                            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query3)}&limit=1&countrycodes=us`,
                            { headers: { 'User-Agent': 'Emergency-Dispatch-App/1.0' } }
                        );
                        geoData = await geoResponse.json();
                    }
                }
                
                // Strategy 4: Just the street name in jurisdiction
                if (!geoData || geoData.length === 0) {
                    const streetOnly = cleanedAddress.replace(/^\d+\s+/, '');
                    const query4 = `${streetOnly}, ${jurisdiction}`;
                    geoResponse = await fetch(
                        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query4)}&limit=1&countrycodes=us`,
                        { headers: { 'User-Agent': 'Emergency-Dispatch-App/1.0' } }
                    );
                    geoData = await geoResponse.json();
                }
                
                if (geoData && geoData.length > 0) {
                    const lat = parseFloat(geoData[0].lat);
                    const lon = parseFloat(geoData[0].lon);
                    
                    // Verify coordinates with AI
                    const verifyResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
                        prompt: `Verify these coordinates make sense: Address "${call.location}" in ${jurisdiction} mapped to (${lat}, ${lon}). The Richmond VA area is around (37.54, -77.43), Henrico is around (37.59, -77.37), Chesterfield is around (37.38, -77.50). Does this coordinate seem correct for this address? Respond with yes or no and a brief explanation.`,
                        response_json_schema: {
                            type: "object",
                            properties: {
                                is_valid: { type: "boolean" },
                                explanation: { type: "string" }
                            }
                        }
                    });
                    
                    if (verifyResponse.is_valid) {
                        console.log(`✓ ${call.location} → ${lat}, ${lon} (verified)`);
                        geocodedCalls.push({
                            ...call,
                            latitude: lat,
                            longitude: lon
                        });
                    } else {
                        console.log(`⚠️ ${call.location} → ${lat}, ${lon} (rejected: ${verifyResponse.explanation})`);
                        geocodedCalls.push({
                            ...call,
                            latitude: null,
                            longitude: null
                        });
                    }
                } else {
                    console.log(`✗ No geocode for ${call.location}`);
                    geocodedCalls.push({
                        ...call,
                        latitude: null,
                        longitude: null
                    });
                }
                
                // Rate limit
                await new Promise(resolve => setTimeout(resolve, 1200));
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
        
        // Generate AI summaries
        const callsWithSummaries = await Promise.all(
            geocodedCalls.map(async (call) => {
                try {
                    const summaryResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
                        prompt: `Summarize this emergency call in 1-2 sentences: ${call.incident} at ${call.location}, ${call.agency}, Status: ${call.status}`,
                        response_json_schema: {
                            type: "object",
                            properties: {
                                summary: { type: "string" }
                            }
                        }
                    });
                    return {
                        ...call,
                        ai_summary: summaryResponse.summary || `${call.incident} at ${call.location}`
                    };
                } catch (error) {
                    return { ...call, ai_summary: `${call.incident} at ${call.location}` };
                }
            })
        );
        
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