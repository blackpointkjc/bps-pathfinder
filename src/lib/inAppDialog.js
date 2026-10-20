import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

let activeDialog=null;
function closeActiveDialog(value){
 if(!activeDialog)return;
 const current=activeDialog;activeDialog=null;
 // Finish outside the React event/commit that requested dismissal.
 queueMicrotask(()=>{current.root.unmount();current.host.remove();current.resolve(value);});
}
function Confirmation({title,message,confirmLabel,cancelLabel,destructive,inputValue}){
 const [value,setValue]=useState(String(inputValue??''));
 const finish=accepted=>closeActiveDialog(inputValue!==undefined?(accepted?value:null):Boolean(accepted));
 return h(AlertDialog.Root,{open:true,onOpenChange:open=>{if(!open)finish(false);}},
  h(AlertDialog.Portal,null,
   h(AlertDialog.Overlay,{'data-pathfinder-confirm-overlay':'',style:{zIndex:2147483647,pointerEvents:'auto'},className:'fixed inset-0 bg-black/75 backdrop-blur-sm'}),
   h(AlertDialog.Content,{'data-pathfinder-confirm':'',style:{zIndex:2147483647,pointerEvents:'auto'},className:'fixed left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-600 bg-[#0b1725] text-slate-100 shadow-2xl',
    onEscapeKeyDown:event=>{event.preventDefault();finish(false);}},
    h('header',{className:'border-b border-slate-700 bg-[#101f30] px-5 py-4'},
     h('p',{className:'text-[10px] font-black uppercase tracking-[.2em] text-blue-300'},'Pathfinder'),
     h(AlertDialog.Title,{className:'mt-1 text-lg font-black text-white'},title||'Confirm action')),
    h('div',{className:'px-5 py-5'},
     h(AlertDialog.Description,{className:'whitespace-pre-wrap text-sm leading-6 text-slate-300'},String(message||'')),
     inputValue!==undefined&&h('input',{'aria-label':title||'Enter a value',value,onChange:event=>setValue(event.target.value),onKeyDown:event=>{if(event.key==='Enter'){event.preventDefault();finish(true);}},className:'mt-4 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 text-sm text-white'})),
    h('footer',{className:'flex flex-wrap justify-end gap-2 border-t border-slate-700 bg-[#08111f] px-5 py-4'},
     h(AlertDialog.Cancel,{asChild:true},h('button',{type:'button',onClick:()=>finish(false),className:'min-h-11 rounded-xl border border-slate-600 bg-slate-800 px-5 text-sm font-bold'},cancelLabel||'Cancel')),
     h('button',{type:'button',onClick:()=>finish(true),className:'min-h-11 rounded-xl border px-5 text-sm font-bold text-white '+(destructive?'border-red-400 bg-red-600':'border-blue-400 bg-blue-600')},confirmLabel||'Confirm')))));
}
function showDialog(options){
 if(activeDialog)closeActiveDialog(null);
 return new Promise(resolve=>{
  const host=document.createElement('div');host.setAttribute('data-pathfinder-dialog-host','');document.body.append(host);
  const root=createRoot(host);activeDialog={host,root,resolve};
  root.render(h(Confirmation,options));
 });
}
export function confirmInApp(message,options={}){
 return showDialog({title:options.title||'Confirm action',message,confirmLabel:options.confirmLabel||'Confirm',cancelLabel:options.cancelLabel||'Cancel',destructive:options.destructive??/delete|remove|clear|inactive|terminate/i.test(String(message||''))});
}
export function promptInApp(message,defaultValue='',options={}){
 return showDialog({title:options.title||'Enter information',message,confirmLabel:options.confirmLabel||'Save',cancelLabel:options.cancelLabel||'Cancel',inputValue:defaultValue});
}
