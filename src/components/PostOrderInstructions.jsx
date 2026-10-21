import { postOrderSections } from '@/lib/postOrderContent';
export default function PostOrderInstructions({order}){
 const sections=postOrderSections(order);
 return <div className="space-y-3">{sections.map((section,index)=><details key={section.title+'-'+index} open={index===0} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900"><summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-white hover:bg-slate-800">{section.title}</summary><div className="border-t border-slate-700 px-5 py-5"><p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">{section.content}</p></div></details>)}{!sections.length&&<p className="p-5 text-sm text-slate-400">No operating instructions have been published for this property.</p>}</div>;
}
