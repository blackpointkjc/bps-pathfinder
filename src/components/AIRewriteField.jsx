import React,{useState} from 'react';
export const AIRewriteField=React.forwardRef(function AIRewriteField(props,forwardedRef){
 const {asInput=false,value,defaultValue,onChange,onKeyDown,readOnly,disabled,className='',...fieldProps}=/** @type {any} */ (props);
 const [local,setLocal]=useState(defaultValue||'');
 const current=String(value??local);
 const attach=node=>{if(typeof forwardedRef==='function')forwardedRef(node);else if(forwardedRef)forwardedRef.current=node;};
 const changed=e=>{if(value===undefined)setLocal(e.target.value);onChange?.(e);};
 const Field=asInput?'input':'textarea';
 return <Field {...fieldProps} value={current} readOnly={readOnly} disabled={disabled} className={className} ref={attach} onChange={changed} onKeyDown={e=>onKeyDown?.(e)}/>;
});
export default AIRewriteField;
// Rewrites are optional. Do not prevent legitimate case reporting, evidence
// entries, or urgent incident documentation when a browser AI model fails.
export function AIReviewGuard(){return null;}
