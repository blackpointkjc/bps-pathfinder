import {useAuth} from '@/lib/AuthContext';
import {hasIAAccess} from '@/lib/portalAccess';
export default function IAEntryLinks({publicOnly=false}){
 const {user}=useAuth();
 return <div className="flex flex-wrap items-center gap-2"><a href={!publicOnly&&hasIAAccess(user)?'/ProfessionalStandards':'/IAFORM?type=complaint'} className="inline-flex min-h-9 items-center rounded-md border border-cyan-700 bg-cyan-950/40 px-3 text-xs font-bold text-cyan-100">{!publicOnly&&hasIAAccess(user)?'Professional Standards':'File an IA complaint'}</a><a href="/IAFORM?type=commendation" className="inline-flex min-h-9 items-center rounded-md border border-slate-600 bg-slate-900 px-3 text-xs font-bold text-slate-200">Commend an officer</a></div>;
}
