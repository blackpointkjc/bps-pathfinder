import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        // Get all dispatch calls
        const calls = await base44.asServiceRole.entities.DispatchCall.list();
        
        console.log(`🗑️ Deleting ${calls.length} calls...`);
        
        // Delete each call
        for (const call of calls) {
            await base44.asServiceRole.entities.DispatchCall.delete(call.id);
        }
        
        console.log(`✅ Deleted ${calls.length} calls`);
        
        return Response.json({
            success: true,
            deletedCount: calls.length,
            message: `Deleted ${calls.length} dispatch calls`
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});