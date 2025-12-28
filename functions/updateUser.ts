import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
        }

        const { userId, updates } = await req.json();
        
        if (!userId || !updates) {
            return Response.json({ error: 'userId and updates required' }, { status: 400 });
        }

        console.log('📝 Updating user:', userId);
        console.log('📝 Updates:', JSON.stringify(updates, null, 2));

        // Update user via Supabase Admin API to ensure metadata persists
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseKey) {
            return Response.json({ error: 'Missing Supabase credentials' }, { status: 500 });
        }

        const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
                'apikey': supabaseKey
            },
            body: JSON.stringify({
                user_metadata: {
                    rank: updates.rank,
                    last_name: updates.last_name,
                    unit_number: updates.unit_number,
                    dispatch_role: updates.dispatch_role === true,
                    is_supervisor: updates.is_supervisor === true,
                    show_on_map: updates.show_on_map !== false
                },
                app_metadata: {
                    role: updates.role || 'user'
                }
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('❌ Update failed:', response.status, error);
            return Response.json({ error: 'Failed to update user', details: error }, { status: response.status });
        }

        const result = await response.json();
        console.log('✅ User updated successfully:', result.id);
        
        return Response.json({
            success: true,
            message: 'User updated successfully'
        });
        
    } catch (error) {
        console.error('Error updating user:', error);
        return Response.json({ 
            error: 'Failed to update user',
            details: error.message 
        }, { status: 500 });
    }
});