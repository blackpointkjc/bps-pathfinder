import {pipeline,env} from '@huggingface/transformers';
import {LOCAL_REWRITE_MODEL,rewriteMessages,rewriteChunks,validateRewrite} from './rewritePolicy';
env.allowLocalModels=false;env.useBrowserCache=true;env.backends.onnx.wasm.numThreads=1;
let generator,queue=Promise.resolve();
async function model(id){
 if(!generator){generator=(async()=>{
  const progress_callback=event=>{if(event.status==='progress')self.postMessage({id,type:'progress',message:'Downloading local rewrite model… '+Math.round(event.progress||0)+'%'});else if(event.status==='initiate')self.postMessage({id,type:'progress',message:'Preparing the local rewrite model…'});};
  let gpu=false;try{gpu=!!(self.navigator.gpu&&await self.navigator.gpu.requestAdapter());}catch{}
  try{return await pipeline('text-generation',LOCAL_REWRITE_MODEL,{dtype:'q4',device:gpu?'webgpu':'wasm',progress_callback});}
  catch(error){if(!gpu)throw error;self.postMessage({id,type:'progress',message:'Preparing the browser CPU model…'});return await pipeline('text-generation',LOCAL_REWRITE_MODEL,{dtype:'q4',device:'wasm',progress_callback});}
 })().catch(error=>{generator=null;throw error;});}
 return generator;
}
self.onmessage=event=>{const {id,text}=event.data;queue=queue.catch(()=>{}).then(async()=>{
 try{
  const generate=await model(id),chunks=rewriteChunks(text),output=[];
  for(let index=0;index<chunks.length;index++){
   self.postMessage({id,type:'progress',message:'Rewriting on this device… '+(index+1)+'/'+chunks.length});
   const result=await generate(rewriteMessages(chunks[index]),{max_new_tokens:Math.min(850,Math.max(160,Math.ceil(chunks[index].length/2))),do_sample:false,repetition_penalty:1.05});
   const generated=result[0]?.generated_text;const candidate=Array.isArray(generated)?generated.at(-1)?.content:generated;
   output.push(validateRewrite(chunks[index],candidate));
  }
  self.postMessage({id,type:'result',text:output.join('\n\n')});
 }catch(error){self.postMessage({id,type:'error',message:String(error?.message||'The local AI model could not start. Your draft is preserved.').slice(0,400)});}
});};
