import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const FEATURESERVER_URL = 'https://services3.arcgis.com/TsynfzBSE6sXfoLq/arcgis/rest/services/PSDWIncidents_ProdA/FeatureServer/0/query';

Deno.serve(async (req) => {
  try {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      returnGeometry: 'true',
      resultRecordCount: '5',
      f: 'json'
    });
    
    const queryUrl = `${FEATURESERVER_URL}?${params}`;
    console.log(`Testing: ${queryUrl}`);
    
    const response = await fetch(queryUrl, {
      headers: { 'User-Agent': 'BPS-Dispatch-CAD/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    
    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      const firstRecord = data.features[0];
      console.log('=== FIRST RECORD ATTRIBUTES ===');
      console.log(JSON.stringify(firstRecord.attributes, null, 2));
      console.log('\n=== GEOMETRY ===');
      console.log(JSON.stringify(firstRecord.geometry, null, 2));
      
      return Response.json({
        status: 'success',
        attributeKeys: Object.keys(firstRecord.attributes || {}),
        hasGeometry: !!firstRecord.geometry,
        geometry: firstRecord.geometry,
        sampleRecord: firstRecord.attributes
      });
    }
    
    return Response.json({ error: 'No records returned' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});