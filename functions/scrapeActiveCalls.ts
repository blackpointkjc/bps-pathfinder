import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('🔍 Scraping calls from active call websites...');
        
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
                const tableStart = html.indexOf('<table');
                const tableEnd = html.indexOf('</table>', tableStart);
                
                if (tableStart !== -1) {
                    const tableHtml = html.substring(tableStart, tableEnd + 8);
                    const rows = tableHtml.split(/<tr[^>]*>/i).slice(1);
                    
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row.includes('<td')) continue;
                        
                        const cells = [];
                        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                        
                        for (const match of cellMatches) {
                            cells.push(match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
                        }
                        
                        // Columns: Time, Incident, Location, Agency, Status
                        if (cells.length >= 3 && cells[1] && cells[2]) {
                            const location = cells[2].trim();
                            const incident = cells[1].trim();
                            
                            // Skip if location looks like a time
                            if (!/^\d{1,2}:\d{2}/.test(location) && incident && location) {
                                calls.push({
                                    time: cells[0] || new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                                    incident: incident,
                                    location: location,
                                    agency: cells[3]?.trim() || 'Unknown',
                                    status: cells[4]?.trim() || 'Dispatched'
                                });
                            }
                        }
                    }
                }
                console.log(`✅ gractivecalls: ${calls.filter(c => !c.agency.includes('Henrico')).length} calls`);
            }
        } catch (error) {
            console.error('❌ Error scraping gractivecalls:', error);
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
                const tableStart = html.indexOf('<table');
                const tableEnd = html.indexOf('</table>', tableStart);
                
                if (tableStart !== -1) {
                    const tableHtml = html.substring(tableStart, tableEnd + 8);
                    const rows = tableHtml.split(/<tr[^>]*>/i).slice(1);
                    
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row.includes('<td')) continue;
                        
                        const cells = [];
                        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                        
                        for (const match of cellMatches) {
                            cells.push(match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
                        }
                        
                        // Henrico format: Time, Incident, Location, Status
                        if (cells.length >= 3 && cells[1] && cells[2]) {
                            const location = cells[2].trim();
                            const incident = cells[1].trim();
                            
                            // Skip if location looks like a time
                            if (!/^\d{1,2}:\d{2}/.test(location) && incident && location) {
                                const incidentLower = incident.toLowerCase();
                                let agency = 'Henrico Police';
                                
                                if (incidentLower.includes('fire') || incidentLower.includes('medical') || 
                                    incidentLower.includes('rescue') || incidentLower.includes('ems') ||
                                    incidentLower.includes('cardiac') || incidentLower.includes('breathing')) {
                                    agency = 'Henrico Fire';
                                }
                                
                                calls.push({
                                    time: cells[0] || new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
                                    incident: incident,
                                    location: location,
                                    agency: agency,
                                    status: cells[3]?.trim() || 'Dispatched'
                                });
                            }
                        }
                    }
                }
                console.log(`✅ Henrico: ${calls.filter(c => c.agency.includes('Henrico')).length} calls`);
            }
        } catch (error) {
            console.error('❌ Error scraping Henrico:', error);
        }
        
        console.log(`✅ Total scraped: ${calls.length} calls`);
        
        // Geocode and save to database
        let saved = 0;
        let geocoded = 0;
        
        for (const call of calls) {
            try {
                const callId = `${call.time}-${call.incident}-${call.location}`.replace(/[^a-zA-Z0-9-]/g, '_');
                
                const existing = await base44.asServiceRole.entities.DispatchCall.filter({ call_id: callId });
                
                if (!existing || existing.length === 0) {
                    // Geocode using the location address
                    let latitude = null;
                    let longitude = null;
                    
                    try {
                        // Try multiple geocoding attempts with increasing specificity
                        const queries = [
                            `${call.location}, Virginia`,
                            `${call.location}, Henrico, Virginia`,
                            `${call.location}, Richmond, Virginia`,
                            `${call.location}, Chesterfield, Virginia`
                        ];
                        
                        for (const query of queries) {
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
                                    break; // Success, stop trying
                                }
                            }
                            
                            // Small delay between attempts
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                    } catch (geoError) {
                        console.log(`Geocode failed for ${call.location}:`, geoError.message);
                    }
                    
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
                    
                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                console.error('Error saving call:', error);
            }
        }
        
        console.log(`💾 Saved ${saved} new calls (${geocoded} geocoded)`);
        
        return Response.json({ success: true, scraped: calls.length, saved, geocoded });
        
    } catch (error) {
        console.error('Scraper error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});