import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BROWSER_CATEGORY_OPTIONS, BROWSER_PROFILE_OPTIONS, defaultPolicyFor, splitDomainList } from '@/lib/browserProfiles';
import { accessLabel } from '@/utils/accountLabels';

export const ASSIGNABLE_ROLES = ['admin', 'officer', 'supervisor', 'dispatch', 'cad_access', 'hr', 'accounting', 'trainer', 'support', 'support_staff', 'fleet_manager'];

const EMPTY = {
  name: '',
  profile: 'strict_search',
  description: '',
  is_default: false,
  assigned_roles: [],
  assigned_emails: [],
  blocked_categories: defaultPolicyFor('strict_search').blocked_categories,
  allowed_domains: '',
  blocked_domains: '',
  strict_search_only: true,
  safe_search: true,
  allow_downloads: false,
  allow_print: false,
  allow_clipboard: false,
  allow_devtools: false,
  session_timeout_minutes: 15,
  active: true,
};

export default function BrowserPolicyEditor({ open, policy, onOpenChange, onSave, saving }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!open) return;
    if (policy) {
      setForm({
        ...EMPTY,
        ...policy,
        allowed_domains: (policy.allowed_domains || []).join(', '),
        blocked_domains: (policy.blocked_domains || []).join(', '),
      });
    } else {
      setForm({ ...EMPTY });
    }
  }, [open, policy]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const toggleIn = (key, value) => setForm(current => {
    const list = current[key] || [];
    return { ...current, [key]: list.includes(value) ? list.filter(item => item !== value) : [...list, value] };
  });

  const applyDefaults = () => {
    const defaults = defaultPolicyFor(form.profile);
    setForm(current => ({ ...current, ...defaults }));
  };

  const submit = event => {
    event.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      name: form.name.trim(),
      profile: form.profile,
      description: form.description.trim(),
      is_default: Boolean(form.is_default),
      assigned_roles: form.assigned_roles || [],
      assigned_emails: form.assigned_emails || [],
      blocked_categories: form.blocked_categories || [],
      allowed_domains: splitDomainList(form.allowed_domains),
      blocked_domains: splitDomainList(form.blocked_domains),
      strict_search_only: Boolean(form.strict_search_only),
      safe_search: Boolean(form.safe_search),
      allow_downloads: Boolean(form.allow_downloads),
      allow_print: Boolean(form.allow_print),
      allow_clipboard: Boolean(form.allow_clipboard),
      allow_devtools: Boolean(form.allow_devtools),
      session_timeout_minutes: Number(form.session_timeout_minutes) || 15,
      active: form.active !== false,
    });
  };

  const field = 'h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{policy ? 'Edit browsing profile' : 'New browsing profile'}</DialogTitle>
          <DialogDescription>Profiles decide which websites and categories an assigned employee can reach.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-300">
              Profile name
              <Input value={form.name} onChange={event => set('name', event.target.value)} className="mt-1" placeholder="Officer work research" />
            </label>
            <label className="block text-xs font-semibold text-slate-300">
              Restriction profile
              <select value={form.profile} onChange={event => set('profile', event.target.value)} className={`mt-1 ${field}`}>
                {BROWSER_PROFILE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <p className="rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-[11px] leading-5 text-slate-400">
            {BROWSER_PROFILE_OPTIONS.find(option => option.value === form.profile)?.summary}
          </p>

          <Textarea value={form.description} onChange={event => set('description', event.target.value)} rows={2} placeholder="What this profile permits" />

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Applies to access roles</span>
              <button type="button" onClick={applyDefaults} className="text-[11px] font-semibold text-cyan-300 hover:underline">
                Apply profile defaults
              </button>
            </div>
            <div className="mt-1 grid gap-1 sm:grid-cols-3">
              {ASSIGNABLE_ROLES.map(role => (
                <label key={role} className="flex min-h-9 items-center gap-2 rounded border border-slate-700 px-2 text-[11px] text-slate-300">
                  <input type="checkbox" checked={(form.assigned_roles || []).includes(role)} onChange={() => toggleIn('assigned_roles', role)} />
                  {accessLabel(role)}
                </label>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-slate-300">Blocked website categories</span>
            <div className="mt-1 grid gap-1 sm:grid-cols-3">
              {BROWSER_CATEGORY_OPTIONS.map(category => (
                <label key={category.key} className="flex min-h-9 items-center gap-2 rounded border border-slate-700 px-2 text-[11px] text-slate-300">
                  <input type="checkbox" checked={(form.blocked_categories || []).includes(category.key)} onChange={() => toggleIn('blocked_categories', category.key)} />
                  {category.label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-300">
              Extra approved domains
              <Textarea value={form.allowed_domains} onChange={event => set('allowed_domains', event.target.value)} rows={2} className="mt-1" placeholder="vb.gov, example.org" />
            </label>
            <label className="block text-xs font-semibold text-slate-300">
              Domains blocked for this profile
              <Textarea value={form.blocked_domains} onChange={event => set('blocked_domains', event.target.value)} rows={2} className="mt-1" placeholder="mail.yahoo.com" />
            </label>
          </div>

          <div className="grid gap-1 sm:grid-cols-2">
            {[
              ['strict_search_only', 'Strict search-only (results visible, no website opening)'],
              ['safe_search', 'Force safe search'],
              ['allow_downloads', 'Allow downloads'],
              ['allow_print', 'Allow printing'],
              ['allow_clipboard', 'Allow clipboard copy'],
              ['allow_devtools', 'Allow developer tools'],
              ['is_default', 'Default profile for unassigned employees'],
            ].map(([key, label]) => (
              <label key={key} className="flex min-h-9 items-center gap-2 rounded border border-slate-700 px-2 text-[11px] text-slate-300">
                <input type="checkbox" checked={Boolean(form[key])} onChange={() => set(key, !form[key])} />
                {label}
              </label>
            ))}
            <label className="block text-xs font-semibold text-slate-300">
              Idle lock (minutes)
              <Input type="number" min={1} max={240} value={form.session_timeout_minutes} onChange={event => set('session_timeout_minutes', event.target.value)} className="mt-1" />
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Save profile'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}