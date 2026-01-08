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
                const tableStart = html.indexOf('<table');
                const tableEnd = html.indexOf('</table>', tableStart);
                
                if (tableStart !== -1) {
                    const tableHtml = html.substring(tableStart, tableEnd + 8);
                    const rows = tableHtml.split(/<tr[^>]*>/i);
                    
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row.includes('<td')) continue;
                        
                        const cells = [];
                        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                        
                        for (const match of cellMatches) {
                            cells.push(match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
                        }
                        
                        if (cells.length >= 5 && cells[2] && cells[1]) {
                            const time = cells[0];
                            const incident = cells[1].trim();
                            const location = cells[2].trim();
                            const agency = cells[3]?.trim() || 'Unknown';
                            const status = cells[4]?.trim() || 'Dispatched';
                            
                            if (location && !/^\d{1,2}:\d{2}/.test(location)) {
                                calls.push({ time, incident, location, agency, status, source: 'gractivecalls' });
                            }
                        }
                    }
                }
                console.log(`✅ gractivecalls: ${calls.length} calls`);
            }
        } catch (error) {
            console.error('❌ gractivecalls error:', error.message);
        }
        
        // Source 2: Henrico County
        try {
            console.log('📡 Scraping Henrico...');
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
                    const rows = tableHtml.split(/<tr[^>]*>/i);
                    
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row.includes('<td')) continue;
                        
                        const cells = [];
                        const cellMatches = row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                        
                        for (const match of cellMatches) {
                            cells.push(match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
                        }
                        
                        if (cells.length >= 4 && cells[1] && cells[2]) {
                            const time = cells[0];
                            const incident = cells[1].trim();
                            const location = cells[2].trim();
                            const status = cells[3]?.trim() || 'Dispatched';
                            
                            if (location && !/^\d{1,2}:\d{2}/.test(location)) {
                                const incidentLower = incident.toLowerCase();
                                let agency = 'Henrico Police';
                                
                                if (incidentLower.includes('fire') || incidentLower.includes('medical') || 
                                    incidentLower.includes('rescue') || incidentLower.includes('ems')) {
                                    agency = 'Henrico Fire';
                                }
                                
                                calls.push({ time, incident, location, agency, status, source: 'henrico' });
                            }
                        }
                    }
                }
                console.log(`✅ Henrico: Total ${calls.filter(c => c.source === 'henrico').length} calls`);
            }
        } catch (error) {
            console.error('❌ Henrico error:', error.message);
        }
        
        console.log(`✅ Total scraped: ${calls.length} calls`);
        
        // Geocode and save using AI for better accuracy
        let saved = 0;
        let geocoded = 0;
        
        for (const call of calls) {
            try {
                const callId = `${call.time}-${call.incident}-${call.location}`.replace(/[^a-zA-Z0-9-]/g, '_').substring(0, 100);
                
                const existing = await base44.asServiceRole.entities.DispatchCall.filter({ call_id: callId });
                
                if (!existing || existing.length === 0) {
                    // Skip highway/interstate locations
                    if (call.location.match(/\bI-?\d+\b/) || call.location.match(/\bEN \d+[A-Z]?\b/)) {
                        console.log(`⏭️ Skipping highway: ${call.location}`);
                        continue;
                    }
                    
                    let latitude = null;
                    let longitude = null;
                    
                    try {
                        // Use AI to intelligently geocode the address
                        const aiResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
                            prompt: `Find the exact geocoded coordinates for this dispatch address in Virginia:
Address: "${call.location}"
Agency: ${call.agency}

Rules for address cleanup:
- If it has " / " (slash), replace with " AND " (it's an intersection)
- If it says "Block" like "200 Block N LABURNUM AVE", remove "Block" and use just "200 N LABURNUM AVE"
- Add the correct city: Henrico Police/Fire = Henrico County, Richmond Police/Fire = Richmond City, Chesterfield = Chesterfield County

Return the cleaned full address with city and state that will work for geocoding.`,
                            add_context_from_internet: true,
                            response_json_schema: {
                                type: "object",
                                properties: {
                                    cleaned_address: { type: "string" }
                                }
                            }
                        });
                        
                        const cleanedAddress = aiResult?.cleaned_address;
                        
                        if (cleanedAddress) {
                            console.log(`🧹 Cleaned: "${call.location}" -> "${cleanedAddress}"`);
                            
                            // Geocode the cleaned address
                            const geoResponse = await fetch(
                                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanedAddress)}&limit=1`,
                                { 
                                    headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' },
                                    signal: AbortSignal.timeout(4000)
                                }
                            );
                            
                            if (geoResponse.ok) {
                                const geoData = await geoResponse.json();
                                if (geoData && geoData.length > 0) {
                                    latitude = parseFloat(geoData[0].lat);
                                    longitude = parseFloat(geoData[0].lon);
                                    geocoded++;
                                    console.log(`✅ Geocoded: ${latitude}, ${longitude}`);
                                }
                            }
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (geoError) {
                        console.log(`⚠️ Geocode failed for ${call.location}: ${geoError.message}`);
                    }
                    
                    // Save call
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