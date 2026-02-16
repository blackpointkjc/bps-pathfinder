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
        
        // Parse active calls from the page
        const callRows = doc.querySelectorAll('tr.call-row, tbody tr');
        console.log(`📋 Found ${callRows.length} potential call rows`);
        
        const allowedJurisdictions = ['richmond', 'henrico', 'chesterfield'];
        const newCalls = [];
        const errors = [];
        
        for (let i = 0; i < callRows.length; i++) {
            try {
                const row = callRows[i];
                const cells = row.querySelectorAll('td');
                
                if (cells.length < 4) continue;
                
                // Extract data from table cells
                const timeReceived = cells[0]?.textContent?.trim() || '';
                const incident = cells[1]?.textContent?.trim() || '';
                const location = cells[2]?.textContent?.trim() || '';
                const agency = cells[3]?.textContent?.trim() || '';
                const status = cells[4]?.textContent?.trim() || 'Active';
                
                if (!incident || !location) continue;
                
                // Filter jurisdictions
                const jurisdictionText = `${agency} ${location}`.toLowerCase();
                const matchedJurisdiction = allowedJurisdictions.find(j => 
                    jurisdictionText.includes(j)
                );
                
                if (!matchedJurisdiction) continue;
                
                // Geocode location
                let latitude = null;
                let longitude = null;
                
                try {
                    const geocodeQuery = `${location}, ${matchedJurisdiction}, Virginia, USA`;
                    const geocodeResponse = await fetch(
                        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geocodeQuery)}&limit=1`,
                        { headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' } }
                    );
                    const geocodeData = await geocodeResponse.json();
                    
                    if (geocodeData && geocodeData.length > 0) {
                        latitude = parseFloat(geocodeData[0].lat);
                        longitude = parseFloat(geocodeData[0].lon);
                    }
                } catch (geocodeError) {
                    console.error(`Geocoding failed for ${location}:`, geocodeError.message);
                }
                
                // Create call object matching DispatchCall schema
                const callData = {
                    call_id: `grac-${Date.now()}-${i}`,
                    incident: incident,
                    location: location,
                    agency: agency,
                    status: status || 'New',
                    priority: 'medium',
                    time_received: timeReceived || new Date().toISOString(),
                    latitude: latitude,
                    longitude: longitude,
                    source: 'gractivecalls',
                    description: `${incident} reported at ${location}`
                };
                
                newCalls.push(callData);
                
            } catch (rowError) {
                errors.push(`Row ${i}: ${rowError.message}`);
            }
        }
        
        console.log(`✅ Parsed ${newCalls.length} valid calls`);
        console.log(`📍 Geocoded: ${newCalls.filter(c => c.latitude && c.longitude).length}`);
        
        // Clear old gractivecalls data
        const existingCalls = await base44.asServiceRole.entities.DispatchCall.filter({ source: 'gractivecalls' });
        for (const call of existingCalls) {
            await base44.asServiceRole.entities.DispatchCall.delete(call.id);
        }
        console.log(`🗑️ Cleared ${existingCalls.length} old calls`);
        
        // Insert new calls
        let inserted = 0;
        for (const callData of newCalls) {
            try {
                await base44.asServiceRole.entities.DispatchCall.create(callData);
                inserted++;
            } catch (insertError) {
                errors.push(`Insert failed: ${insertError.message}`);
            }
        }
        
        console.log(`💾 Inserted ${inserted} new calls`);
        
        return Response.json({
            success: true,
            timestamp: new Date().toISOString(),
            source: 'gractivecalls.com',
            total_parsed: newCalls.length,
            total_inserted: inserted,
            geocoded: newCalls.filter(c => c.latitude && c.longitude).length,
            errors: errors.length > 0 ? errors : undefined
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