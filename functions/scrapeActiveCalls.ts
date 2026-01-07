import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('🔍 Scraping calls from active call websites...');
        
        const calls = [];
        
        // Source 1: gractivecalls.com (Richmond + Chesterfield)
        try {
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
                        
                        if (cells.length >= 3 && cells[1] && cells[2]) {
                            calls.push({
                                time: cells[0] || 'Unknown',
                                incident: cells[1].trim(),
                                location: cells[2].trim(),
                                agency: cells[3]?.trim() || 'Unknown',
                                status: cells[4]?.trim() || 'Dispatched'
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error scraping gractivecalls:', error);
        }
        
        // Source 2: Henrico County
        try {
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
                        
                        if (cells.length >= 2 && cells[1] && cells[2]) {
                            const incidentLower = cells[1].toLowerCase();
                            let agency = 'Henrico Police';
                            
                            if (incidentLower.includes('fire') || incidentLower.includes('medical') || 
                                incidentLower.includes('rescue') || incidentLower.includes('ems')) {
                                agency = 'Henrico Fire';
                            }
                            
                            calls.push({
                                time: cells[0] || 'Unknown',
                                incident: cells[1].trim(),
                                location: cells[2].trim(),
                                agency: agency,
                                status: cells[3]?.trim() || 'Dispatched'
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error scraping Henrico:', error);
        }
        
        console.log(`✅ Scraped ${calls.length} calls`);
        
        // Save to database
        let saved = 0;
        for (const call of calls) {
            try {
                const callId = `${call.time}-${call.incident}-${call.location}`.replace(/[^a-zA-Z0-9-]/g, '_');
                
                const existing = await base44.asServiceRole.entities.DispatchCall.filter({ call_id: callId });
                
                if (!existing || existing.length === 0) {
                    await base44.asServiceRole.entities.DispatchCall.create({
                        call_id: callId,
                        incident: call.incident,
                        location: call.location,
                        agency: call.agency,
                        status: call.status,
                        time_received: new Date().toISOString(),
                        description: `${call.incident} at ${call.location}`
                    });
                    saved++;
                }
            } catch (error) {
                console.error('Error saving call:', error);
            }
        }
        
        console.log(`💾 Saved ${saved} new calls`);
        
        return Response.json({ success: true, scraped: calls.length, saved });
        
    } catch (error) {
        console.error('Scraper error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});