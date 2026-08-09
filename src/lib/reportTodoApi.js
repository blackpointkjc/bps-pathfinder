import { base44 } from '@/api/base44Client';

export async function completeReportTodo(todoId) {
  if (!todoId) return null;
  const result = await base44.functions.invoke('completeMyReportTodo', { todo_id: todoId });
  const payload = result?.data || result || {};
  if (payload.error) throw new Error(payload.error);
  return payload.todo || null;
}
