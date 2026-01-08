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
        
        // Smart address cleaning function
        const cleanAddress = (location, agency) => {
            let cleaned = location;
            
            // Remove "Block" pattern
            cleaned = cleaned.replace(/(\d+)\s+Block\s+/gi, '$1 ');
            
            // Replace " / " with " AND " for intersections
            cleaned = cleaned.replace(/\s+\/\s+/g, ' AND ');
            
            // Determine city based on agency
            let city = 'Virginia';
            if (agency.toLowerCase().includes('henrico')) {
                city = 'Henrico County, Virginia';
            } else if (agency.toLowerCase().includes('richmond') || agency.toLowerCase().includes('rpd') || agency.toLowerCase().includes('rfd')) {
                city = 'Richmond, Virginia';
            } else if (agency.toLowerCase().includes('chesterfield') || agency.toLowerCase().includes('ccpd') || agency.toLowerCase().includes('ccfd')) {
                city = 'Chesterfield County, Virginia';
            }
            
            return `${cleaned}, ${city}`;
        };
        
        // Geocode and save
        let saved = 0;
        let geocoded = 0;
        const batchSize = 10;
        
        for (let i = 0; i < calls.length; i += batchSize) {
            const batch = calls.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (call) => {
                try {
                    const callId = `${call.time}-${call.incident}-${call.location}`.replace(/[^a-zA-Z0-9-]/g, '_').substring(0, 100);
                    
                    const existing = await base44.asServiceRole.entities.DispatchCall.filter({ call_id: callId });
                    
                    if (!existing || existing.length === 0) {
                        // Skip highways
                        if (call.location.match(/\bI-?\d+\b/) || call.location.match(/\bEN \d+[A-Z]?\b/)) {
                            return;
                        }
                        
                        let latitude = null;
                        let longitude = null;
                        
                        try {
                            const cleanedAddress = cleanAddress(call.location, call.agency);
                            
                            const geoResponse = await fetch(
                                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanedAddress)}&limit=1`,
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
                                }
                            }
                            
                            await new Promise(resolve => setTimeout(resolve, 100));
                        } catch (geoError) {
                            // Silent fail
                        }
                        
                        // Save call even without coords
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
                    }
                } catch (error) {
                    console.error('❌ Error saving call:', error.message);
                }
            }));
            
            await new Promise(resolve => setTimeout(resolve, 1000));
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