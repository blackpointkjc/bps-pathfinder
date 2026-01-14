import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const FEATURESERVER_URL = 'https://services3.arcgis.com/TsynfzBSE6sXfoLq/arcgis/rest/services/PSDWIncidents_ProdA/FeatureServer/0/query';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const report = {
      timestamp: new Date().toISOString(),
      chesterfield: {},
      richmond: {},
      database: {}
    };

    // TEST 1: Chesterfield ArcGIS with no date filter (pure data test)
    console.log('🧪 TEST 1: Chesterfield ArcGIS (no date filter)...');
    try {
      const params1 = new URLSearchParams({
        where: '1=1',
        orderByFields: 'RecordDate DESC',
        resultRecordCount: '10',
        outFields: '*',
        f: 'json'
      });
      const url1 = `${FEATURESERVER_URL}?${params1}`;
      console.log(`URL: ${url1}`);
      
      const resp1 = await fetch(url1, {
        headers: { 'User-Agent': 'Diagnostic' },
        signal: AbortSignal.timeout(15000)
      });
      
      report.chesterfield.noFilterStatus = resp1.status;
      const data1 = await resp1.json();
      report.chesterfield.noFilterFeaturesCount = data1.features?.length || 0;
      
      if (data1.features && data1.features[0]) {
        const attrs = data1.features[0].attributes;
        report.chesterfield.sampleRecord = {
          CADEventNumber: attrs.CADEventNumber,
          RecordDate: attrs.RecordDate,
          IncidentorOffenseTypeDesc: attrs.IncidentorOffenseTypeDesc,
          DimLocationAddress: attrs.DimLocationAddress,
          DimLocationLatitude: attrs.DimLocationLatitude,
          DimLocationLongitude: attrs.DimLocationLongitude
        };
      }
      console.log(`✅ No-filter query: ${report.chesterfield.noFilterFeaturesCount} records`);
    } catch (e) {
      report.chesterfield.noFilterError = e.message;
      console.error(`❌ No-filter error: ${e.message}`);
    }

    // TEST 2: Chesterfield ArcGIS with date filter (as in production)
    console.log('\n🧪 TEST 2: Chesterfield ArcGIS (with 4-hour date filter)...');
    try {
      const now = Date.now();
      const windowStart = now - (4 * 60 * 60 * 1000);
      const params2 = new URLSearchParams({
        where: `RecordDate >= ${windowStart} AND DimLocationLatitude IS NOT NULL AND DimLocationLongitude IS NOT NULL`,
        orderByFields: 'RecordDate DESC',
        resultRecordCount: '1000',
        outFields: '*',
        f: 'json'
      });
      const url2 = `${FEATURESERVER_URL}?${params2}`;
      console.log(`Window: ${new Date(windowStart).toISOString()} to now`);
      
      const resp2 = await fetch(url2, {
        headers: { 'User-Agent': 'Diagnostic' },
        signal: AbortSignal.timeout(15000)
      });
      
      report.chesterfield.dateFilterStatus = resp2.status;
      const data2 = await resp2.json();
      report.chesterfield.dateFilterFeaturesCount = data2.features?.length || 0;
      console.log(`✅ Date-filter query: ${report.chesterfield.dateFilterFeaturesCount} records`);
    } catch (e) {
      report.chesterfield.dateFilterError = e.message;
      console.error(`❌ Date-filter error: ${e.message}`);
    }

    // TEST 3: Richmond HTML scrape test
    console.log('\n🧪 TEST 3: Richmond HTML fetch...');
    try {
      const respRichmond = await fetch('https://apps.richmondgov.com/applications/activecalls', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000)
      });
      
      report.richmond.status = respRichmond.status;
      const htmlRichmond = await respRichmond.text();
      report.richmond.htmlLength = htmlRichmond.length;
      
      // Check for table patterns
      const patterns = [
        { name: 'tblActiveCallsListing', pattern: /<table[^>]*id="tblActiveCallsListing"[\s\S]*?<tbody>/i },
        { name: 'ctl00_MainContent_gvCalls', pattern: /<table[^>]*id="ctl00_MainContent_gvCalls"[\s\S]*?<tbody>/i },
        { name: 'generic tbody', pattern: /<tbody>/i }
      ];
      
      report.richmond.tablesFound = [];
      for (const p of patterns) {
        if (p.pattern.test(htmlRichmond)) {
          report.richmond.tablesFound.push(p.name);
        }
      }
      console.log(`✅ Richmond: ${report.richmond.tablesFound.join(', ')}`);
    } catch (e) {
      report.richmond.error = e.message;
      console.error(`❌ Richmond error: ${e.message}`);
    }

    // TEST 4: Database state
    console.log('\n🧪 TEST 4: Database query...');
    try {
      const allCalls = await base44.asServiceRole.entities.DispatchCall.list();
      
      const bySource = {};
      for (const call of allCalls) {
        if (!bySource[call.source]) bySource[call.source] = 0;
        bySource[call.source]++;
      }
      
      report.database.totalCalls = allCalls.length;
      report.database.callsBySource = bySource;
      
      // Sample 3 records from each source
      report.database.samples = {};
      for (const source of ['richmond', 'henrico', 'chesterfield']) {
        const sourceCalls = allCalls.filter(c => c.source === source).slice(0, 3);
        report.database.samples[source] = sourceCalls.map(c => ({
          call_id: c.call_id,
          incident: c.incident,
          location: c.location,
          latitude: c.latitude,
          longitude: c.longitude,
          source: c.source,
          time_received: c.time_received
        }));
      }
      
      console.log(`✅ Total calls in DB: ${allCalls.length}`);
      console.log(`   By source: ${JSON.stringify(bySource)}`);
    } catch (e) {
      report.database.error = e.message;
      console.error(`❌ DB query error: ${e.message}`);
    }

    console.log('\n📊 DIAGNOSTIC REPORT:');
    console.log(JSON.stringify(report, null, 2));
    
    return Response.json(report);
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});