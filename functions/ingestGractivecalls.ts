import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as cheerio from 'npm:cheerio@1.0.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('🚨 Starting active calls ingestion from gractivecalls.com...');
        
        // Fetch live data from gractivecalls.com
        const response = await fetch('https://gractivecalls.com');
        if (!response.ok) {
            throw new Error(`Failed to fetch gractivecalls.com: ${response.status}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        const allCalls = [];
        
        // Parse each table row
        $('table tbody tr').each((_, row) => {
            const $row = $(row);
            const cells = $row.find('td');
            
            if (cells.length >= 5) {
                const timeReceived = $(cells[0]).text().trim();
                const incident = $(cells[1]).text().trim();
                const location = $(cells[2]).text().trim();
                const agency = $(cells[3]).text().trim();
                const status = $(cells[4]).text().trim();
                
                if (incident && location && agency) {
                    const stableId = `${agency.toLowerCase()}-${location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
                    
                    allCalls.push({
                        call_id: stableId,
                        incident: incident,
                        location: location,
                        agency: agency,
                        status: status || 'Active',
                        priority: 'medium',
                        time_received: timeReceived || new Date().toISOString(),
                        source: 'gractivecalls',
                        description: `${incident} at ${location}`
                    });
                }
            }
        });
        
        console.log(`✅ Scraped ${allCalls.length} calls from gractivecalls.com`);
        
        // Fetch existing calls from this source
        const existingCalls = await base44.asServiceRole.entities.DispatchCall.filter({ source: 'gractivecalls' });
        console.log(`📊 Found ${existingCalls.length} existing calls in database`);
        
        // Remove expired calls (older than 60 minutes) and track what's not expired
        const now = new Date();
        const expirationThreshold = 60 * 60 * 1000;
        let expired = 0;
        const activeExisting = [];
        
        for (const call of existingCalls) {
            if (call.time_received) {
                const ageMs = now - new Date(call.time_received);
                if (ageMs > expirationThreshold) {
                    await base44.asServiceRole.entities.DispatchCall.delete(call.id);
                    expired++;
                    continue;
                }
            }
            activeExisting.push(call);
        }
        
        console.log(`🗑️ Expired ${expired} calls older than 60 minutes`);
        
        let inserted = 0;
        let updated = 0;
        
        for (const callData of allCalls) {
            const existing = activeExisting.find(c => c.call_id === callData.call_id);
            if (existing) {
                await base44.asServiceRole.entities.DispatchCall.update(existing.id, callData);
                updated++;
            } else {
                await base44.asServiceRole.entities.DispatchCall.create(callData);
                inserted++;
            }
        }
        
        const newCallIds = new Set(allCalls.map(c => c.call_id));
        let deleted = 0;
        for (const existing of activeExisting) {
            if (!newCallIds.has(existing.call_id)) {
                await base44.asServiceRole.entities.DispatchCall.delete(existing.id);
                deleted++;
            }
        }
        
        console.log(`💾 Database: ${inserted} created, ${updated} updated, ${deleted} deleted`);
        
        return Response.json({
            success: true,
            timestamp: new Date().toISOString(),
            source: 'gractivecalls.com',
            total_parsed: allCalls.length,
            inserted: inserted,
            updated: updated,
            deleted: deleted,
            expired: expired
        });
        
    } catch (error) {
        console.error('❌ Ingestion failed:', error);
        return Response.json({
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});