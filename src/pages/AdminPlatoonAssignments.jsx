import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Users, RefreshCw, Save, Network } from 'lucide-react';
import { toast } from 'sonner';
import { isOperationalOfficer } from '@/lib/directoryUtils';

const RANKS = ['Colonel','Lt Colonel','Major','Captain','Lieutenant','First Sergeant','Sergeant','Corporal','Senior officer','Officer','Unarmed Officer'];
const COMMAND_RANKS = new Set(['Colonel','Lt Colonel','Major']);
const rankIndex = rank => { const i = RANKS.indexOf(rank); return i < 0 ? 999 : i; };
const rolesOf = user => new Set((user?.additional_roles || []).map(r => String(r).toLowerCase()));
const isOperational = user => isOperationalOfficer(user) && RANKS.includes(user?.rank);
const displayName = user => `${user?.rank || 'Officer'} ${user?.last_name || user?.first_name || user?.email || ''}`.trim();

function eligibleSupervisors(person, users, platoon) {
  const personRank = rankIndex(person.rank);
  if (personRank <= 0 || personRank >= 999) return [];
  // A reporting supervisor must be higher in the chain. Prefer the nearest
  // populated rank above the person, but do not make the dropdown unusable
  // when an intermediate rank (for example Captain or Sergeant) is vacant.
  const higher = users.filter(candidate => {
    if (candidate.id === person.id || !isOperational(candidate)) return false;
    const candidateRank = rankIndex(candidate.rank);
    if (candidateRank >= personRank) return false;
    if (COMMAND_RANKS.has(candidate.rank)) return true;
    return platoon && candidate.platoon === platoon;
  });
  if (!higher.length) return [];
  const nearestAvailableRank = Math.max(...higher.map(candidate => rankIndex(candidate.rank)));
  return higher
    .filter(candidate => rankIndex(candidate.rank) === nearestAvailableRank)
    .sort((a,b) => Number(a.unit_number || 9999) - Number(b.unit_number || 9999));
}

function nearestSupervisor(person, users, platoon) {
  const eligible = eligibleSupervisors(person, users, platoon);
  return eligible[0] || null;
}

function nextSupervisor(supervisor, users, platoon) {
  if (!supervisor) return null;
  return nearestSupervisor(supervisor, users, platoon);
}

export default function AdminPlatoonAssignments() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState({});
  const { data: me } = useQuery({ queryKey:['currentUser'], queryFn:()=>base44.auth.me() });
  const { data: users = [], isLoading } = useQuery({
    queryKey:['platoonUsers'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getAppDirectory', {});
      const payload = result?.data || result || {};
      if (payload.error) throw new Error(payload.error);
      return payload.users || [];
    },
    enabled:!!me,
  });
  const allowed = me?.role === 'admin' || rolesOf(me).has('full_access');
  const operational = useMemo(() => users.filter(isOperational).sort((a,b)=>rankIndex(a.rank)-rankIndex(b.rank)||(Number(a.unit_number)||9999)-(Number(b.unit_number)||9999)), [users]);
  const effective = user => ({
    platoon: drafts[user.id]?.platoon ?? user.platoon ?? (COMMAND_RANKS.has(user.rank) ? 'Command' : ''),
    supervisor_id: drafts[user.id]?.supervisor_id ?? user.supervisor_id ?? '',
  });

  const saveOne = async (user, override = {}) => {
    const state = { ...effective(user), ...override };
    const supervisor = users.find(u => u.id === state.supervisor_id) || null;
    const next = nextSupervisor(supervisor, users, state.platoon);
    const updates = {
      platoon: COMMAND_RANKS.has(user.rank) ? 'Command' : state.platoon,
      supervisor_id: supervisor?.id || '',
      supervisor_email: supervisor?.email || '',
      supervisor_name: supervisor ? displayName(supervisor) : '',
      next_level_supervisor_id: next?.id || '',
      next_level_supervisor_email: next?.email || '',
      next_level_supervisor_name: next ? displayName(next) : '',
    };
    const response = await base44.functions.invoke('updateUser', { userId:user.id, updates });
    const payload = response?.data || response || {};
    if (payload.error) throw new Error(payload.error);
  };

  const saveMutation = useMutation({
    mutationFn: async user => saveOne(user),
    onSuccess: async (_, user) => {
      setDrafts(prev => { const n={...prev}; delete n[user.id]; return n; });
      await queryClient.invalidateQueries({ queryKey:['platoonUsers'] });
      await queryClient.invalidateQueries({ queryKey:['allUsersRank'] });
      toast.success('Platoon assignment saved');
    },
    onError: error => toast.error(error.message || 'Unable to save assignment'),
  });

  const autoBalanceMutation = useMutation({
    mutationFn: async () => {
      const belowCommand = operational.filter(u => !COMMAND_RANKS.has(u.rank));
      const assignment = new Map();
      for (const rank of RANKS.filter(r => !COMMAND_RANKS.has(r))) {
        const sameRank = belowCommand.filter(u => u.rank === rank);
        sameRank.forEach((u, idx) => assignment.set(u.id, idx % 2 === 0 ? 'A' : 'B'));
      }
      const projected = operational.map(u => ({ ...u, platoon: COMMAND_RANKS.has(u.rank) ? 'Command' : (assignment.get(u.id) || u.platoon || 'A') }));
      const supervisorLoads = new Map();
      for (const person of operational) {
        const platoon = COMMAND_RANKS.has(person.rank) ? 'Command' : (assignment.get(person.id) || 'A');
        const candidates = eligibleSupervisors({ ...person, platoon }, projected, platoon);
        let supervisor = null;
        if (candidates.length) {
          supervisor = [...candidates].sort((a,b) => (supervisorLoads.get(a.id) || 0) - (supervisorLoads.get(b.id) || 0) || Number(a.unit_number || 9999) - Number(b.unit_number || 9999))[0];
          supervisorLoads.set(supervisor.id, (supervisorLoads.get(supervisor.id) || 0) + 1);
        }
        await saveOne(person, { platoon, supervisor_id: supervisor?.id || '' });
      }
    },
    onSuccess: async () => {
      setDrafts({});
      await queryClient.invalidateQueries({ queryKey:['platoonUsers'] });
      await queryClient.invalidateQueries({ queryKey:['allUsersRank'] });
      toast.success('Platoons balanced and chain of command rebuilt');
    },
    onError: error => toast.error(error.message || 'Unable to auto-balance platoons'),
  });

  if (!allowed) return <div className="p-8 text-center text-slate-300"><Shield className="mx-auto mb-3 h-12 w-12"/><h2 className="text-xl font-bold">Admin Access Required</h2></div>;
  if (isLoading) return <div className="p-8 text-slate-400">Loading platoon assignments…</div>;

  const command = operational.filter(u => COMMAND_RANKS.has(u.rank));
  const platoonUsers = letter => operational.filter(u => !COMMAND_RANKS.has(u.rank) && effective(u).platoon === letter);

  return <div className="min-h-screen bg-slate-950 p-4 text-white md:p-7"><div className="mx-auto max-w-7xl space-y-5">
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-amber-500/10 p-3"><Network className="h-7 w-7 text-amber-400"/></div><div><h1 className="text-2xl font-black">PLATOON & CHAIN ASSIGNMENTS</h1><p className="text-sm text-slate-400">Assign Platoon A/B and reporting supervisors by rank. Colonel, Lt Colonel, and Major oversee both branches.</p></div></div>
      <Button onClick={()=>autoBalanceMutation.mutate()} disabled={autoBalanceMutation.isPending} className="bg-amber-500 text-black hover:bg-amber-400"><RefreshCw className={`mr-2 h-4 w-4 ${autoBalanceMutation.isPending?'animate-spin':''}`}/>Auto Balance Platoons</Button>
    </div>

    <section className="rounded-xl border border-amber-500/30 bg-amber-950/10 p-4"><div className="mb-3 flex items-center gap-2 text-sm font-black text-amber-300"><Shield className="h-4 w-4"/>SHARED COMMAND — OVERSEES PLATOON A & B</div><div className="grid gap-3 md:grid-cols-3">{command.map(user=><div key={user.id} className="rounded-lg border border-slate-700 bg-slate-900 p-3"><div className="font-bold">{displayName(user)}</div><div className="text-xs text-slate-400">Unit {user.unit_number || '—'}</div></div>)}</div></section>

    <div className="grid gap-5 xl:grid-cols-2">{['A','B'].map(letter=><section key={letter} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"><div className="border-b border-slate-800 bg-slate-950 px-4 py-3"><div className="font-black text-blue-300">PLATOON {letter}</div><div className="text-xs text-slate-500">{platoonUsers(letter).length} assigned personnel</div></div><div className="divide-y divide-slate-800">{platoonUsers(letter).map(user=>{const state=effective(user);const supervisors=eligibleSupervisors(user, operational.map(u=>({...u, platoon:effective(u).platoon})),letter);const supervisor=users.find(u=>u.id===state.supervisor_id);return <div key={user.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_150px_1.2fr_auto] lg:items-center"><div><div className="font-bold">{displayName(user)}</div><div className="text-xs text-slate-500">Unit {user.unit_number || '—'} · {user.division || 'No division'}</div></div><Select value={state.platoon || 'none'} onValueChange={value=>setDrafts(prev=>({...prev,[user.id]:{...effective(user),platoon:value==='none'?'':value,supervisor_id:''}}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="A">Platoon A</SelectItem><SelectItem value="B">Platoon B</SelectItem></SelectContent></Select><Select value={state.supervisor_id || 'none'} onValueChange={value=>setDrafts(prev=>({...prev,[user.id]:{...effective(user),supervisor_id:value==='none'?'':value}}))}><SelectTrigger><SelectValue placeholder="Select supervisor"/></SelectTrigger><SelectContent><SelectItem value="none">No supervisor</SelectItem>{supervisors.map(s=><SelectItem key={s.id} value={s.id}>{displayName(s)}</SelectItem>)}</SelectContent></Select><Button size="sm" onClick={()=>saveMutation.mutate(user)} disabled={saveMutation.isPending}><Save className="mr-1 h-4 w-4"/>Save</Button>{supervisor&&<div className="lg:col-span-4 text-xs text-slate-500">Reports to <span className="font-semibold text-slate-300">{displayName(supervisor)}</span>{supervisor.supervisor_name ? ` → ${supervisor.supervisor_name}` : ''}</div>}</div>})}{platoonUsers(letter).length===0&&<div className="p-8 text-center text-sm text-slate-600">No personnel assigned to Platoon {letter}.</div>}</div></section>)}</div>

    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400"><Users className="mr-2 inline h-4 w-4"/>Manual assignments override auto-balance. Running Auto Balance rebuilds Platoon A/B evenly by rank and assigns each person to the nearest higher-ranking supervisor in that platoon.</div>
  </div></div>;
}
