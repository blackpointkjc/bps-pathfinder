import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }
    
    const allCalls = await base44.asServiceRole.entities.DispatchCall.filter({ source: 'chesterfield' });
    
    for (const call of allCalls) {
      await base44.asServiceRole.entities.DispatchCall.delete(call.id);
    }
    
    console.log(`🗑️ Deleted ${allCalls.length} Chesterfield calls`);
    
    return Response.json({ deleted: allCalls.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});