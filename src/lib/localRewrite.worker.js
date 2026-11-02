import wasmURL from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import wasmModuleURL from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url';
import {pipeline,env} from '@huggingface/transformers';
import {LOCAL_REWRITE_MODEL,rewriteChunks,validateRewrite} from './rewritePolicy';
env.backends.onnx.wasm.wasmPaths={wasm:wasmURL,mjs:wasmModuleURL};
env.allowLocalModels=false;env.useBrowserCache=true;env.backends.onnx.wasm.numThreads=1;
let generator,queue=Promise.resolve();
async function model(id){
 if(!generator){generator=(async()=>{
  const progress_callback=event=>{if(event.status==='progress')self.postMessage({id,type:'progress',message:'Downloading local rewrite model… '+Math.round(event.progress||0)+'%'});else if(event.status==='initiate')self.postMessage({id,type:'progress',message:'Preparing the local rewrite model…'});};
  return await pipeline('text2text-generation',LOCAL_REWRITE_MODEL,{dtype:'q8',device:'wasm',progress_callback});
 })().catch(error=>{generator=null;throw error;});}
 return generator;
}
self.onmessage=event=>{const {id,text}=event.data;queue=queue.catch(()=>{}).then(async()=>{
 try{
  const generate=await model(id),chunks=rewriteChunks(text),output=[];
  for(let index=0;index<chunks.length;index++){
   self.postMessage({id,type:'progress',message:'Rewriting on this device… '+(index+1)+'/'+chunks.length});
   const instruction='Correct all spelling, capitalization, punctuation, sentence structure, grammar, and unclear wording in this professional security investigation report. Make it clear and formal. Do not add, remove, or change facts, names, dates, numbers, direct quotes, or conclusions. Return only the corrected report: '; 
   const result=await generate(instruction+chunks[index],{max_new_tokens:Math.min(900,Math.max(140,Math.ceil(chunks[index].length*0.85))),do_sample:false,num_beams:3,repetition_penalty:1.12});
   const generated=result[0]?.generated_text;const candidate=Array.isArray(generated)?generated.at(-1)?.content:generated;
   // Never label the original or a few word substitutions as an AI rewrite.
   // A failed model attempt must be visible, with the original preserved.
   output.push(validateRewrite(chunks[index],candidate));
  }
  self.postMessage({id,type:'result',text:output.join('\n\n')});
 }catch(error){self.postMessage({id,type:'error',message:String(error?.message||error||'The local AI model could not start. Your draft is preserved.').slice(0,400)});}
});};
