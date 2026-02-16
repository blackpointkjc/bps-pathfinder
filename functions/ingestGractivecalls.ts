import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { DOMParser } from 'npm:linkedom';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        console.log('🚨 Starting gractivecalls.com ingestion...');
        
        // Fetch the live page
        const response = await fetch('https://gractivecalls.com/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch gractivecalls.com: ${response.status}`);
        }
        
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        // Parse active calls - gractivecalls uses a simple table structure
        const allRows = Array.from(doc.querySelectorAll('table tr'));
        console.log(`📋 Found ${allRows.length} total table rows`);
        
        const allowedJurisdictions = ['richmond', 'henrico', 'chesterfield'];
        const newCalls = [];
        const errors = [];
        
        // Skip header row, process data rows
        for (let i = 1; i < allRows.length; i++) {
            try {
                const row = allRows[i];
                const cells = Array.from(row.querySelectorAll('td'));
                
                if (cells.length < 3) continue;
                
                // gractivecalls.com table structure: Time | Type | Location | Agency | Status
                const timeReceived = cells[0]?.textContent?.trim() || '';
                const incident = cells[1]?.textContent?.trim() || '';
                const location = cells[2]?.textContent?.trim() || '';
                const agency = cells[3]?.textContent?.trim() || '';
                const status = cells[4]?.textContent?.trim() || 'New';
                
                console.log(`Row ${i}: ${incident} @ ${location} [${agency}]`);
                
                if (!incident || !location || incident.length < 2) {
                    console.log(`  ❌ Skipped - invalid data`);
                    continue;
                }
                
                // Filter jurisdictions
                const jurisdictionText = `${agency} ${location}`.toLowerCase();
                const matchedJurisdiction = allowedJurisdictions.find(j => 
                    jurisdictionText.includes(j)
                );
                
                if (!matchedJurisdiction) {
                    console.log(`  ❌ Skipped - not in allowed jurisdictions`);
                    continue;
                }
                
                console.log(`  ✅ Matched jurisdiction: ${matchedJurisdiction}`);
                
                // Geocode location with delay to avoid rate limiting
                let latitude = null;
                let longitude = null;
                
                try {
                    await new Promise(resolve => setTimeout(resolve, 200)); // Rate limit
                    const geocodeQuery = `${location}, ${matchedJurisdiction}, Virginia, USA`;
                    const geocodeResponse = await fetch(
                        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geocodeQuery)}&limit=1`,
                        { headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' } }
                    );
                    const geocodeData = await geocodeResponse.json();
                    
                    if (geocodeData && geocodeData.length > 0) {
                        latitude = parseFloat(geocodeData[0].lat);
                        longitude = parseFloat(geocodeData[0].lon);
                        console.log(`  📍 Geocoded: ${latitude}, ${longitude}`);
                    } else {
                        console.log(`  ⚠️ No geocode results`);
                    }
                } catch (geocodeError) {
                    console.error(`  ❌ Geocoding failed:`, geocodeError.message);
                }
                
                // Generate stable ID from location + time
                const stableId = `grac-${matchedJurisdiction}-${location.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`;
                
                // Parse time or use current
                let parsedTime = new Date().toISOString();
                if (timeReceived && timeReceived.includes(':')) {
                    const today = new Date();
                    const [time, period] = timeReceived.split(' ');
                    let [hours, minutes] = time.split(':').map(Number);
                    if (period && period.toLowerCase() === 'pm' && hours !== 12) hours += 12;
                    if (period && period.toLowerCase() === 'am' && hours === 12) hours = 0;
                    today.setHours(hours || 0, minutes || 0, 0, 0);
                    parsedTime = today.toISOString();
                }
                
                // Create call object matching DispatchCall schema EXACTLY
                const callData = {
                    call_id: stableId,
                    incident: incident,
                    location: location,
                    agency: agency,
                    status: status || 'New',
                    priority: 'medium',
                    time_received: parsedTime,
                    latitude: latitude,
                    longitude: longitude,
                    source: 'gractivecalls',
                    description: `${incident} at ${location}`
                };
                
                newCalls.push(callData);
                console.log(`  💾 Added to queue: ${stableId}`);
                
            } catch (rowError) {
                errors.push(`Row ${i}: ${rowError.message}`);
            }
        }
        
        console.log(`✅ Parsed ${newCalls.length} valid calls`);
        console.log(`📍 Geocoded: ${newCalls.filter(c => c.latitude && c.longitude).length}`);
        
        // UPSERT logic: check if call exists, update or create
        const existingCalls = await base44.asServiceRole.entities.DispatchCall.filter({ source: 'gractivecalls' });
        const existingCallIds = new Set(existingCalls.map(c => c.call_id));
        
        console.log(`📊 Found ${existingCalls.length} existing gractivecalls in DB`);
        
        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        
        for (const callData of newCalls) {
            try {
                // Find existing call by call_id
                const existing = existingCalls.find(c => c.call_id === callData.call_id);
                
                if (existing) {
                    // Update existing call
                    await base44.asServiceRole.entities.DispatchCall.update(existing.id, callData);
                    updated++;
                    console.log(`  🔄 Updated: ${callData.call_id}`);
                } else {
                    // Create new call
                    await base44.asServiceRole.entities.DispatchCall.create(callData);
                    inserted++;
                    console.log(`  ➕ Created: ${callData.call_id}`);
                }
            } catch (upsertError) {
                errors.push(`Upsert failed for ${callData.call_id}: ${upsertError.message}`);
                skipped++;
                console.error(`  ❌ Failed: ${callData.call_id} - ${upsertError.message}`);
            }
        }
        
        // Delete calls that are no longer in the feed
        const newCallIds = new Set(newCalls.map(c => c.call_id));
        let deleted = 0;
        for (const existing of existingCalls) {
            if (!newCallIds.has(existing.call_id)) {
                await base44.asServiceRole.entities.DispatchCall.delete(existing.id);
                deleted++;
                console.log(`  🗑️ Deleted stale: ${existing.call_id}`);
            }
        }
        
        console.log(`💾 Database changes: ${inserted} created, ${updated} updated, ${deleted} deleted, ${skipped} failed`);
        
        return Response.json({
            success: true,
            timestamp: new Date().toISOString(),
            source: 'gractivecalls.com',
            total_parsed: newCalls.length,
            inserted: inserted,
            updated: updated,
            deleted: deleted,
            geocoded: newCalls.filter(c => c.latitude && c.longitude).length,
            errors: errors.length > 0 ? errors.slice(0, 10) : undefined
        });
        
    } catch (error) {
        console.error('❌ Ingestion failed:', error);
        return Response.json({
            success: false,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
});