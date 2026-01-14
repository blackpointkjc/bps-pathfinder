import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }
    
    const allCalls = await base44.asServiceRole.entities.DispatchCall.filter({ source: 'chesterfield' });
    
    console.log(`Starting deletion of ${allCalls.length} Chesterfield calls...`);
    
    let deleted = 0;
    for (const call of allCalls) {
      await base44.asServiceRole.entities.DispatchCall.delete(call.id);
      deleted++;
      
      // Rate limiting - wait 500ms between deletes
      if (deleted % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`✅ Deleted ${deleted} Chesterfield calls`);
    
    return Response.json({ deleted, message: `Deleted ${deleted} Chesterfield calls` });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});