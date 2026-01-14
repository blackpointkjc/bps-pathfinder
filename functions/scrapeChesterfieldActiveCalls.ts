import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Chesterfield ArcGIS FeatureServer endpoint
const FEATURESERVER_URL = 'https://services3.arcgis.com/TsynfzBSE6sXfoLq/arcgis/rest/services/PSDWIncidents_ProdA/FeatureServer/0/query';

// Active call window: 4 hours (can adjust)
const ACTIVE_WINDOW_MS = 4 * 60 * 60 * 1000;

// Map incident category to priority
const mapPriority = (category) => {
  const cat = (category || '').toUpperCase();
  
  if (cat.includes('VIOLENT') || cat.includes('ASSAULT') || cat.includes('ROBBERY') || cat.includes('RAPE')) {
    return 'critical';
  }
  if (cat.includes('PROPERTY') || cat.includes('THEFT') || cat.includes('BURGLARY')) {
    return 'high';
  }
  if (cat.includes('TRAFFIC') || cat.includes('ACCIDENT')) {
    return 'medium';
  }
  
  return 'medium';
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    console.log('🔍 Starting Chesterfield ArcGIS scraper...');
    
    // Calculate time window (last 4 hours)
    const now = Date.now();
    const windowStart = now - ACTIVE_WINDOW_MS;
    
    console.log(`📅 Querying records from ${new Date(windowStart).toISOString()} to now`);
    
    // Build ArcGIS query - use UNIX time (seconds) not milliseconds for ArcGIS
    const params = new URLSearchParams({
      where: `RecordDate >= ${Math.floor(windowStart / 1000)} AND DimLocationLatitude IS NOT NULL AND DimLocationLongitude IS NOT NULL`,
      outFields: '*',
      returnGeometry: 'false',
      orderByFields: 'RecordDate DESC',
      resultRecordCount: '1000',
      f: 'json'
    });
    
    const queryUrl = `${FEATURESERVER_URL}?${params}`;
    console.log(`🔗 Querying: ${queryUrl}`);
    
    const response = await fetch(queryUrl, {
      headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    
    if (!response.ok) {
      throw new Error(`ArcGIS query failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.features || !Array.isArray(data.features)) {
      console.warn('⚠️ No features returned from ArcGIS');
      return Response.json({ success: true, scraped: 0, saved: 0, skipped: 0 });
    }
    
    console.log(`✅ Retrieved ${data.features.length} records from ArcGIS`);
    
    let saved = 0;
    let skipped = 0;
    let failed = 0;
    
    // Process each record
    for (const feature of data.features) {
      try {
        const attrs = feature.attributes || {};
        
        const callId = attrs.CADEventNumber;
        if (!callId) {
          console.warn('⚠️ Record missing CADEventNumber, skipping');
          skipped++;
          continue;
        }
        
        // Check if call already exists
        const existing = await base44.asServiceRole.entities.DispatchCall.filter({
          call_id: callId
        });
        
        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }
        
        // Validate coordinates
        const latitude = attrs.DimLocationLatitude;
        const longitude = attrs.DimLocationLongitude;
        
        if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
          console.warn(`⚠️ Invalid coordinates for ${callId}, skipping`);
          failed++;
          continue;
        }
        
        // Parse timestamp (RecordDate is epoch ms)
        const recordDate = new Date(attrs.RecordDate);
        
        // Build location text
        const location = attrs.DimLocationAddress || attrs.LocationName || 'Unknown Location';
        
        // Map incident
        const incident = attrs.IncidentorOffenseTypeDesc || 'Unknown Incident';
        
        // Determine priority
        const priority = mapPriority(attrs.IncidentorOffenseGenCategory);
        
        // Map agency code to name
        const agencyCode = attrs.CADAgency || 'CC';
        const agencyMap = {
          'AS': 'Animal Services',
          'CC': 'Chesterfield County',
          'CCPD': 'Chesterfield Police',
          'CCFD': 'Chesterfield Fire'
        };
        const agency = agencyMap[agencyCode] || `Chesterfield (${agencyCode})`;
        
        // Save to DispatchCall
        await base44.asServiceRole.entities.DispatchCall.create({
          call_id: callId,
          incident: incident,
          location: location,
          latitude: latitude,
          longitude: longitude,
          agency: agency,
          priority: priority,
          status: 'Dispatched',
          time_received: recordDate.toISOString(),
          description: `${incident} at ${location}`,
          source: 'chesterfield'
        });
        
        saved++;
        console.log(`✅ Saved: ${callId} - ${incident} at ${location}`);
        
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error processing record:`, error.message);
        failed++;
      }
    }
    
    console.log(`💾 FINAL: Retrieved ${data.features.length}, Saved ${saved}, Skipped ${skipped}, Failed ${failed}`);
    
    return Response.json({
      success: true,
      scraped: data.features.length,
      saved,
      skipped,
      failed,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});