import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
const require=createRequire(import.meta.url);
globalThis.window={location:{search:''}};
const result=await build({entryPoints:['src/pages/ProfessionalStandards.jsx'],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',jsx:'automatic',alias:{'@':process.cwd()+'/src'},plugins:[{name:'isolate-render',setup(b){
 b.onResolve({filter:/AuthContext|lazyPages|base44Client|PublicProfessionalStandards|\.css$|react-router-dom/},args=>({path:args.path,namespace:'fixture'}));
 b.onResolve({filter:/^\.\/(Admin|Supervisor|Officer|ConfidentialReport)/},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>{
 let contents='export default function Tool(){return null}';
 if(args.path.includes('AuthContext'))contents='export const useAuth=()=>({user:globalThis.__iaRenderUser});';
 if(args.path.includes('lazyPages'))contents='export const getPreparedTool=()=>null;';
 if(args.path.includes('base44Client'))contents='export const base44={};';
 if(args.path.includes('PublicProfessionalStandards'))contents='export const psCall=async()=>({});export const EvidenceInput=()=>null;';
 if(args.path==='react-router-dom')contents="import React from 'react';export const Link=({to,children,...rest})=>React.createElement('a',{href:to,...rest},children);export const useLocation=()=>globalThis.__iaRenderLocation||({pathname:'/ProfessionalStandards',search:''});export const useNavigate=()=>()=>{};";
 return {contents,loader:'js',resolveDir:process.cwd()};
 });
}}]});
const module={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);
const Page=module.exports.default;
globalThis.__iaRenderUser={id:'ia-staff',role:'user',additional_roles:['ia'],ps_role:'reviewer'};
let html='';
for(const [area,section] of [['intake','inbox'],['investigations','cases'],['personnel','approvals'],['insights','reports'],['resources','resources']]){
 globalThis.__iaRenderLocation={pathname:'/ProfessionalStandards',search:'?ps_area='+area+'&section='+section};
 html+=renderToStaticMarkup(React.createElement(Page));
}
for(const heading of ['Complaint inbox','Case management','Evidence library','Interviews &amp; notes','Deadlines &amp; tasks','Findings &amp; approvals','Corrective actions','Reports &amp; trends','Audit history','Use of force','Write-ups','Inspections','Performance reviews','Confidential reports'])assert.ok(html.includes(heading),heading);
assert.ok(html.includes('bps-command-theme'));
assert.equal(html.includes('portal-shell'),false);
assert.equal(html.includes('bp-ia'),false);
assert.equal(html.includes('Verify your staff access'),false);
assert.equal(html.includes('Email my verification code'),false);
globalThis.__iaRenderUser={id:'ordinary-staff',role:'user',additional_roles:['officer']};
html=renderToStaticMarkup(React.createElement(Page));
assert.ok(html.includes('Internal Affairs access required'));
assert.equal(html.includes('Complaint inbox'),false);
console.log('PASS: actual Professional Standards component renders every reviewer tool immediately after IA login; ordinary staff cannot render the workspace; no email-code screen.');
