import * as React from 'react';
import {cn} from '@/lib/utils';
import AIRewriteField from '@/components/AIRewriteField';
const Input=React.forwardRef(({className,type,aiRewrite,...props},ref)=>{
 const inner=React.useRef(null),[narrative,setNarrative]=React.useState(aiRewrite===true);
 React.useEffect(()=>{
  if(aiRewrite===false||type&&type!=='text')return;
  const label=inner.current?.closest('label')?.textContent|| (props.id?document.querySelector('label[for="'+CSS.escape(props.id)+'"]')?.textContent:'')||'';
  const context=[props.name,props.id,props.placeholder,props['aria-label'],label].join(' ');
  if(!/search|filter|lookup|find |password|token|badge|tracking|reference|api.?key/i.test(context)&&/description|summary|notes?|message|reason|statement|findings?|instructions?|comments?|subject|title|details/i.test(context))setNarrative(true);
 },[props.id,props.name,props.placeholder,type,aiRewrite]);
 const attach=node=>{inner.current=node;if(typeof ref==='function')ref(node);else if(ref)ref.current=node;};
 const style=cn('flex h-9 w-full rounded-md border border-input bg-background/70 px-3 py-1.5 text-base shadow-sm transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',className);
 return narrative?<AIRewriteField asInput type={type} className={style} ref={attach} {...props}/>:<input type={type} className={style} ref={attach} {...props}/>;
});
Input.displayName='Input';export {Input};
