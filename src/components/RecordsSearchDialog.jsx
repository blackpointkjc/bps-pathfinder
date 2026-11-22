import {lazy,Suspense} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
const RecordsAssistant=lazy(()=>import('@/pages/RecordsAssistant'));
export default function RecordsSearchDialog({open,onOpenChange}){
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="h-[90dvh] max-w-6xl overflow-hidden border-slate-700 bg-[#08111e] p-0 text-white"><DialogHeader className="border-b border-slate-700 px-5 py-3 pr-16"><DialogTitle>Search Records</DialogTitle><DialogDescription>Search authorized app records without leaving your current page.</DialogDescription></DialogHeader><div className="min-h-0 overflow-y-auto"><Suspense fallback={<p role="status" className="p-6">Loading records search…</p>}><RecordsAssistant embedded/></Suspense></div></DialogContent></Dialog>;
}
