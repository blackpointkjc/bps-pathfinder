import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { formatEasternDateTime } from '@/lib/easternTime';
import { MessageSquare, Send } from 'lucide-react';
import './cad-upgrade.css';

/**
 * Live incident comments. Reuses the existing shared CAD timeline function and
 * CallNote records, so a dispatcher, a supervisor and the assigned unit all read
 * and post to the same incident record — no separate comment store.
 */
export default function CadIncidentComments({ call }) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const callId = call?.id;

  const query = useQuery({
    queryKey: ['cadIncidentComments', callId],
    enabled: Boolean(callId),
    queryFn: async () => {
      const response = await base44.functions.invoke('sharedCadTimeline', { action: 'read', call_id: callId });
      const data = response?.data || {};
      if (data.error || !data.success) throw new Error(data.error || 'CAD did not confirm the request.');
      return data;
    },
    staleTime: 15000,
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  // Notes posted by another workstation appear immediately, before the next poll.
  useEffect(() => {
    if (!callId) return undefined;
    const subscriptions=[];
    const refresh=event=>{if(String(event?.data?.call_id||'')===String(callId))void query.refetch();};
    for(const entity of [base44.entities.CallNote,base44.entities.CallStatusLog]){try{subscriptions.push(entity.subscribe(refresh));}catch{/* Polling remains active. */}}
    return()=>subscriptions.forEach(unsubscribe=>{try{unsubscribe?.();}catch{/* ignore */}});
  }, [callId]);

  const post = async () => {
    const note = text.trim();
    if (!note || posting || !callId) return;
    setPosting(true);
    setError('');
    try {
      const response = await base44.functions.invoke('sharedCadTimeline', { action: 'post', call_id: callId, note });
      const data = response?.data || {};
      if (data.error || !data.success) throw new Error(data.error || 'CAD did not confirm the request.');
      setText('');
      await query.refetch();
    } catch (requestError) {
      setError(requestError?.response?.data?.error || requestError?.message || 'The comment could not be posted.');
    } finally {
      setPosting(false);
    }
  };

  const notes = query.data?.notes || [];

  return (
    <div className="cad-comments">
      {query.isError && (
        <p className="cad-comments-warning" role="alert">
          Incident comments could not be loaded. {query.error?.message || 'Use refresh to retry.'}
        </p>
      )}
      <div className="cad-comments-scroll">
        {notes.length ? notes.map(entry => (
          <article key={entry.id} data-kind={entry.kind}>
            <header>
              <b>{entry.author_name || 'Dispatch'}</b>
              <time>{entry.created_date ? `${formatEasternDateTime(entry.created_date)} ET` : 'Time not recorded'}</time>
            </header>
            <p>{entry.note}</p>
          </article>
        )) : (
          <p className="cad-comments-empty">
            <MessageSquare size={14} />
            {query.isLoading ? 'Loading the incident timeline…' : 'No comments recorded on this incident yet.'}
          </p>
        )}
      </div>
      <div className="cad-comments-compose">
        <textarea
          value={text}
          onChange={event => setText(event.target.value)}
          placeholder="Add a live comment for dispatch and the assigned unit"
          aria-label="Incident comment"
          rows={2}
          maxLength={1500}
        />
        <button type="button" onClick={post} disabled={posting || !text.trim()}>
          <Send size={14} /> {posting ? 'Posting…' : 'Post'}
        </button>
      </div>
      {error && <p className="cad-comments-warning" role="alert">{error}</p>}
    </div>
  );
}