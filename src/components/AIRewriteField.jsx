import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {rewriteOnDevice} from '@/lib/localRewrite';
export const AIRewriteField=React.forwardRef(function AIRewriteField({asInput=false,value,defaultValue,onChange,onKeyDown,readOnly,disabled,className='',...props},forwardedRef){
 const inner=useRef(null),[local,setLocal]=useState(defaultValue||''),[reviewed,setReviewed]=useState(null),[busy,setBusy]=useState(false),[candidate,setCandidate]=useState(null),[error,setError]=useState(''),[progress,setProgress]=useState('');
 const current=String(value??local),literal=/password|secret|token|api.?key|json|sql|raw.payload/i.test([props.name,props.id,props.placeholder,className.includes('font-mono')?'json':''].join(' '));
 const enabled=!readOnly&&!disabled&&!literal,needsReview=enabled&&current.trim().length>0&&reviewed!==current;
 useEffect(()=>{const field=inner.current;if(!field)return;field.dataset.aiReviewRequired=needsReview?'true':'false';field.setCustomValidity(needsReview?'Use AI rewrite and review this wording before sending or saving.':'');},[needsReview,current]);
 const attach=node=>{inner.current=node;if(typeof forwardedRef==='function')forwardedRef(node);else if(forwardedRef)forwardedRef.current=node;};
 const changed=e=>{setLocal(e.target.value);setReviewed(null);setError('');onChange?.(e);};
 const rewrite=async()=>{if(!current.trim()||busy)return;setBusy(true);setError('');try{
  const text=await rewriteOnDevice(current,setProgress);
  if(inner.current?.value!==current)throw new Error('Your draft changed while rewriting. It is preserved; rewrite the updated draft again.');
  setCandidate({original:current,text});
 }catch(e){setError(e?.data?.error||e?.response?.data?.error||e.message||'AI rewrite is unavailable. Your draft is preserved.');}finally{setBusy(false);}};
 const accept=()=>{if(!candidate)return;if(inner.current?.value!==candidate.original){setCandidate(null);setError('Your draft changed. Please rewrite the current version.');return;}const text=candidate.text;setLocal(text);setReviewed(text);setCandidate(null);onChange?.({type:'change',target:{value:text,name:props.name,id:props.id,type:asInput?'text':'textarea'},currentTarget:{value:text},preventDefault(){},stopPropagation(){}});};
 const Field=asInput?'input':'textarea';
 return <div className="min-w-0 w-full" data-ai-review-scope="field"><Field {...props} value={current} readOnly={readOnly} disabled={disabled} className={className} ref={attach} onChange={changed} onKeyDown={e=>{if(needsReview&&onKeyDown&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();inner.current?.reportValidity();return;}onKeyDown?.(e);}}/>
  {enabled&&<div className="mt-1 flex flex-wrap items-center gap-2 text-xs"><button type="button" disabled={busy||!current.trim()} onClick={rewrite} className="rounded border border-cyan-600/60 bg-slate-900 px-3 py-1.5 font-semibold text-cyan-200">{busy?'Rewriting…':'AI rewrite & review'}</button><span className={needsReview?'text-amber-600':'text-emerald-600'}>{!current.trim()?'Rewrite required after entering text':needsReview?'Review required before sending':'Rewrite reviewed ✓'}</span></div>}
  {enabled&&<small className="mt-1 block text-slate-500">Runs on this device without app AI credits. First use downloads a local model (about 1 GB), which the browser caches for later use.</small>}{busy&&<p role="status" className="mt-2 text-xs text-slate-500">{progress}</p>}
  {error&&<p role="alert" className="mt-2 rounded border border-red-600 bg-red-950 p-2 text-xs text-red-100">{error}</p>}
  {candidate&&typeof document!=='undefined'&&createPortal(<div role="dialog" aria-modal="true" aria-label="Review professional rewrite" className="fixed inset-0 z-[100000] overflow-y-auto bg-black/80 p-4"><section className="mx-auto my-10 max-w-4xl rounded-xl border border-slate-600 bg-slate-950 p-6 text-white"><h2 className="text-xl font-bold">Review the professional rewrite</h2><p className="my-3 text-sm text-slate-300">Check that names, dates, facts and meaning are accurate before using this wording.</p><div className="grid gap-4 md:grid-cols-2"><div><h3 className="font-semibold">Your draft</h3><pre className="mt-2 whitespace-pre-wrap rounded bg-slate-900 p-4 font-sans text-sm">{candidate.original}</pre></div><div><h3 className="font-semibold">Proposed wording</h3><pre className="mt-2 whitespace-pre-wrap rounded bg-slate-900 p-4 font-sans text-sm">{candidate.text}</pre></div></div><div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={accept} className="rounded bg-cyan-400 px-4 py-2 font-bold text-slate-950">Use this rewrite</button><button type="button" onClick={()=>setCandidate(null)} className="rounded border border-slate-600 px-4 py-2">Keep editing draft</button></div></section></div>,document.body)}
 </div>;
});
export default AIRewriteField;
export function AIReviewGuard(){
 useEffect(()=>{
  const guard=event=>{
   const button=event.target.closest?.('button,input[type=submit]');if(!button||button.disabled||!/(^|\s)(send|submit|save|create|post|publish|approve|issue|assign|apply|update|complete|finish)\b/i.test(button.textContent||button.value||''))return;
   const scope=button.closest('form')||button.closest('section,.portal-card,.portal-record')||button.parentElement;
   const fields=[...(scope?.querySelectorAll('[data-ai-review-required="true"]')||[])];
   const outer=button.closest('section.portal-record');if(outer&&outer!==scope)fields.push(...outer.querySelectorAll('[data-ai-review-required="true"]'));
   const first=fields.find(field=>!field.disabled&&!field.readOnly);
   if(first){event.preventDefault();event.stopPropagation();first.focus();first.reportValidity();}
  };
  document.addEventListener('click',guard,true);return()=>document.removeEventListener('click',guard,true);
 },[]);return null;
}
