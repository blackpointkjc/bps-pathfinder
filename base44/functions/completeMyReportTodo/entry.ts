import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { todo_id } = await req.json().catch(() => ({}));
    if (!todo_id) return Response.json({ error: 'todo_id is required' }, { status: 400 });

    const todo = await base44.asServiceRole.entities.ReportTodo.get(todo_id);
    if (!todo) return Response.json({ error: 'Revision task not found' }, { status: 404 });
    const roles = new Set((user.additional_roles || []).map((r: string) => String(r).toLowerCase()));
    const privileged = user.role === 'admin' || roles.has('full_access');
    const assignedToUser = String(todo.officer_email || '').toLowerCase() === String(user.email || '').toLowerCase();
    if (!privileged && !assignedToUser) return Response.json({ error: 'This revision task is not assigned to you' }, { status: 403 });

    const updated = await base44.asServiceRole.entities.ReportTodo.update(todo_id, { completed: true });
    return Response.json({ success: true, todo: updated });
  } catch (error) {
    console.error('completeMyReportTodo failed', error);
    return Response.json({ error: error?.message || 'Unable to complete revision task' }, { status: 500 });
  }
});