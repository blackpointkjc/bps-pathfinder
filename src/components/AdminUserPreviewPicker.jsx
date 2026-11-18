import { useState } from 'react';
import { previewAccountType, previewDisplayName, PREVIEW_ROLE_FILTERS, filterPreviewUsers } from '@/utils/previewIdentity';
import { Eye, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export default function AdminUserPreviewPicker({ users, selectedId, loading, error, onSelect, onRetry }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const matches = filterPreviewUsers(users, role, search);

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" className="flex min-h-10 items-center gap-2 rounded-lg border border-cyan-700 bg-cyan-950/40 px-3 text-sm font-bold text-cyan-100"><Eye className="h-4 w-4"/>Preview as user</button></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(440px,calc(100vw-24px))] bg-[#0b1725] text-white" aria-label="Choose a user to preview">
      <h2 className="mb-3 font-bold">Choose a user</h2>
      <label className="flex items-center gap-2 rounded-lg border border-slate-600 px-3"><Search className="h-4 w-4"/><input aria-label="Search users by name, email, rank or unit" placeholder="Search name, email, rank or unit" value={search} onChange={e=>setSearch(e.target.value)} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"/></label>
      <div className="mt-3 flex items-center gap-2">
        <label htmlFor="preview-role-filter" className="shrink-0 text-sm text-slate-300">Role</label>
        <select id="preview-role-filter" value={role} onChange={event => setRole(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-600 bg-[#0b1725] px-2 text-sm text-white">
          {PREVIEW_ROLE_FILTERS.map(([value,label]) => <option key={value} value={value}>{label} ({filterPreviewUsers(users,value).length})</option>)}
        </select>
        {(role !== 'all' || search) && <button type="button" onClick={() => { setRole('all'); setSearch(''); }} className="min-h-11 px-2 text-sm text-cyan-300 hover:underline">Clear</button>}
      </div>
      {!loading && !error && <p className="mt-2 text-xs text-slate-400" role="status">{matches.length} of {users.length} users</p>}
      <div className="mt-3 max-h-[min(360px,50dvh)] space-y-1 overflow-y-auto" aria-live="polite">
        {loading ? <p className="p-3 text-sm">Loading users…</p> : error ? <div className="p-3 text-sm"><p>{error}</p><button type="button" onClick={onRetry} className="mt-2 rounded border px-3 py-2">Retry</button></div> : matches.length ? matches.map(person=><button type="button" key={person.id} aria-pressed={String(person.id)===String(selectedId)} onClick={()=>{onSelect(person.id);setOpen(false);setSearch('');}} className="block min-h-12 w-full rounded-lg border border-transparent px-3 py-2 text-left text-sm hover:border-cyan-600 hover:bg-cyan-950/50 aria-pressed:border-cyan-400"><span className="block font-bold">{previewDisplayName(person)}</span><span className="block break-words text-xs text-slate-300">{previewAccountType(person)} · {person.email}</span></button>) : <p className="p-3 text-sm text-slate-300">No matching users.</p>}
      </div>
    </PopoverContent>
  </Popover>;
}
