import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('🔍 Starting active call scraper...');
        
        const calls = [];
        
        // Source 1: gractivecalls.com (Richmond + Chesterfield)
        try {
            console.log('📡 Scraping gractivecalls.com...');
            const response1 = await fetch('https://gractivecalls.com/', {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(10000)
            });
            
            if (response1.ok) {
                const html = await response1.text();
                console.log('✅ Fetched HTML from gractivecalls');
                
                const tableStart = html.indexOf('<table');
                const tableEnd = html.indexOf('</table>', tableStart);
                
                if (tableStart !== -1) {
                    const tableHtml = html.substring(tableStart, tableEnd + 8);
                    const rows = tableHtml.split(/<tr[^>]*>/i);
                    
                    console.log(`Found ${rows.length} rows in table`);
                    
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row.includes('<td')) continue;
                        
                        const cells = [];
                        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                        
                        for (const match of cellMatches) {
                            cells.push(match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
                        }
                        
                        // Expected columns: Time, Incident Type, Location, Agency, Status
                        if (cells.length >= 5 && cells[2] && cells[1]) {
                            const time = cells[0];
                            const incident = cells[1].trim();
                            const location = cells[2].trim();
                            const agency = cells[3]?.trim() || 'Unknown';
                            const status = cells[4]?.trim() || 'Dispatched';
                            
                            // Validate location doesn't look like a time
                            if (location && !/^\d{1,2}:\d{2}/.test(location)) {
                                calls.push({
                                    time,
                                    incident,
                                    location,
                                    agency,
                                    status,
                                    source: 'gractivecalls'
                                });
                            }
                        }
                    }
                }
                console.log(`✅ gractivecalls: Parsed ${calls.length} calls`);
            }
        } catch (error) {
            console.error('❌ gractivecalls error:', error.message);
        }
        
        // Source 2: Henrico County
        try {
            console.log('📡 Scraping Henrico County...');
            const response2 = await fetch('https://activecalls.henrico.gov/', {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(10000)
            });
            
            if (response2.ok) {
                const html = await response2.text();
                console.log('✅ Fetched HTML from Henrico');
                
                const tableStart = html.indexOf('<table');
                const tableEnd = html.indexOf('</table>', tableStart);
                
                if (tableStart !== -1) {
                    const tableHtml = html.substring(tableStart, tableEnd + 8);
                    const rows = tableHtml.split(/<tr[^>]*>/i);
                    
                    console.log(`Found ${rows.length} rows in Henrico table`);
                    
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row.includes('<td')) continue;
                        
                        const cells = [];
                        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                        
                        for (const match of cellMatches) {
                            cells.push(match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
                        }
                        
                        // Henrico format: Time, Incident, Location, Status
                        if (cells.length >= 4 && cells[1] && cells[2]) {
                            const time = cells[0];
                            const incident = cells[1].trim();
                            const location = cells[2].trim();
                            const status = cells[3]?.trim() || 'Dispatched';
                            
                            // Validate location doesn't look like a time
                            if (location && !/^\d{1,2}:\d{2}/.test(location)) {
                                const incidentLower = incident.toLowerCase();
                                let agency = 'Henrico Police';
                                
                                if (incidentLower.includes('fire') || incidentLower.includes('medical') || 
                                    incidentLower.includes('rescue') || incidentLower.includes('ems')) {
                                    agency = 'Henrico Fire';
                                }
                                
                                calls.push({
                                    time,
                                    incident,
                                    location,
                                    agency,
                                    status,
                                    source: 'henrico'
                                });
                            }
                        }
                    }
                }
                console.log(`✅ Henrico: Total ${calls.filter(c => c.source === 'henrico').length} Henrico calls`);
            }
        } catch (error) {
            console.error('❌ Henrico error:', error.message);
        }
        
        console.log(`✅ Total scraped: ${calls.length} calls`);
        
        // Geocode and save to database
        let saved = 0;
        let geocoded = 0;
        
        for (const call of calls) {
            try {
                const callId = `${call.time}-${call.incident}-${call.location}`.replace(/[^a-zA-Z0-9-]/g, '_').substring(0, 100);
                
                const existing = await base44.asServiceRole.entities.DispatchCall.filter({ call_id: callId });
                
                if (!existing || existing.length === 0) {
                    // Clean and geocode the location
                    let latitude = null;
                    let longitude = null;
                    
                    // Skip highway/interstate locations
                    if (call.location.includes(' I64 ') || call.location.includes(' I295 ') || 
                        call.location.includes('I64 ') || call.location.includes('I295 ') ||
                        /\bEN \d+[A-Z]?\b/.test(call.location)) {
                        console.log(`⏭️ Skipping highway location: ${call.location}`);
                    } else {
                        try {
                            // Clean the location string
                            let cleanLocation = call.location
                                .replace(/\s*\/\s*/g, ' AND ')  // Replace "/" with "AND"
                                .replace(/\b\d+\s+Block\b/gi, '') // Remove "200 Block"
                                .replace(/\sBlock\b/gi, '') // Remove "Block"
                                .trim();
                            
                            // Try geocoding with cleaned address
                            const locationQueries = [
                                `${cleanLocation}, ${call.agency.includes('Henrico') ? 'Henrico County' : call.agency.includes('Richmond') || call.agency.includes('RPD') || call.agency.includes('RFD') ? 'Richmond' : 'Chesterfield County'}, Virginia`,
                                `${cleanLocation}, Virginia`
                            ];
                            
                            for (const query of locationQueries) {
                                const geoResponse = await fetch(
                                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
                                    { 
                                        headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' },
                                        signal: AbortSignal.timeout(3000)
                                    }
                                );
                                
                                if (geoResponse.ok) {
                                    const geoData = await geoResponse.json();
                                    if (geoData && geoData.length > 0) {
                                        latitude = parseFloat(geoData[0].lat);
                                        longitude = parseFloat(geoData[0].lon);
                                        geocoded++;
                                        console.log(`✅ Geocoded: ${call.location} -> ${cleanLocation} -> ${latitude}, ${longitude}`);
                                        break;
                                    }
                                }
                                
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                        } catch (geoError) {
                            console.log(`⚠️ Geocode failed for ${call.location}`);
                        }
                    }
                    
                    // Save call (even without coordinates)
                    await base44.asServiceRole.entities.DispatchCall.create({
                        call_id: callId,
                        incident: call.incident,
                        location: call.location,
                        agency: call.agency,
                        status: call.status,
                        latitude: latitude,
                        longitude: longitude,
                        time_received: new Date().toISOString(),
                        description: `${call.incident} at ${call.location}`
                    });
                    saved++;
                    
                    // Rate limiting delay
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                console.error('❌ Error saving call:', error.message);
            }
        }
        
        console.log(`💾 FINAL: Saved ${saved} new calls (${geocoded} successfully geocoded)`);
        
        return Response.json({ 
            success: true, 
            scraped: calls.length, 
            saved,
            geocoded
        });
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});