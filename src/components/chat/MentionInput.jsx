import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';

const displayName = user => (
  user?.label
  || [user?.rank, user?.first_name, user?.last_name].filter(Boolean).join(' ')
  || user?.full_name
  || user?.email
  || 'User'
);

export default function MentionInput({ value, onChange, users = [], currentEmail, onMentionsChange, placeholder, disabled, className = '' }) {
  const [query, setQuery] = useState(null);
  const [mentions, setMentions] = useState([]);

  const suggestions = useMemo(() => {
    if (query === null) return [];
    const needle = query.toLowerCase();
    return users
      .filter(user => String(user?.email || '').toLowerCase() !== String(currentEmail || '').toLowerCase())
      .filter(user => {
        const haystack = `${displayName(user)} ${user?.email || ''}`.toLowerCase();
        return !needle || haystack.includes(needle);
      })
      .slice(0, 8);
  }, [users, query, currentEmail]);

  const handleChange = event => {
    const next = event.target.value;
    onChange(next);
    const match = next.match(/(?:^|\s)@([^@\s]*)$/);
    setQuery(match ? match[1] : null);
    const remaining = mentions.filter(item => next.includes(`@${item.label}`));
    if (remaining.length !== mentions.length) {
      setMentions(remaining);
      onMentionsChange(remaining);
    }
  };

  const choose = user => {
    const label = displayName(user);
    const next = value.replace(/(?:^|\s)@[^@\s]*$/, match => `${match.startsWith(' ') ? ' ' : ''}@${label} `);
    const emails = user.emails?.length ? user.emails : [user.email];
    const items = emails.filter(Boolean).map(email => ({ email, label }));
    const selectedEmails = new Set(items.map(item => item.email));
    const updated = [...mentions.filter(existing => !selectedEmails.has(existing.email)), ...items];
    setMentions(updated);
    onMentionsChange(updated);
    onChange(next);
    setQuery(null);
  };

  return (
    <div className="relative min-w-0 flex-1">
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 z-50 mb-2 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-300 bg-white p-1 shadow-2xl">
          {suggestions.map(user => (
            <button key={user.id || user.email} type="button" onMouseDown={event => event.preventDefault()} onClick={() => choose(user)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-blue-50">
              <span className="text-sm font-bold text-slate-900">{displayName(user)}</span>
              <span className="ml-3 truncate text-xs text-slate-500">{user.email}</span>
            </button>
          ))}
        </div>
      )}
      <Input
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        className={className}
        disabled={disabled}
        autoComplete="off"
      />
    </div>
  );
}
