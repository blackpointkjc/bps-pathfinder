const fs=require('fs'),vm=require('vm'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),assert=require('assert/strict');
const library=fs.readFileSync('node_modules/leaflet/dist/leaflet-src.js','utf8');
const body=library.match(/_getSubdomain:\s*function\s*\(tilePoint\)\s*\{([\s\S]*?)\n\s*\},/)[1];
const getSubdomain=new Function('tilePoint',body);
assert.throws(()=>getSubdomain.call({options:{subdomains:undefined}},{x:1,y:2}),TypeError,'reproduce actual Leaflet failure');
for(const [theme,satellite,index] of [['day',false,0],['day',false,1],['night',false,0],['night',false,1],['day',true,0],['day',true,1]]){
 let numeric=0,captured;
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/map/PathfinderTileLayer.jsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports,Date,window:{},require:name=>name==='react'?{...React,useState:value=>typeof value==='number'&&numeric++===0?React.useState(index):React.useState(value)}:name==='react/jsx-runtime'?require(name):{TileLayer:props=>{captured=props;return null;}}
 });
 renderToStaticMarkup(React.createElement(exports.default,{theme,satellite}));
 assert(captured.subdomains.length>0);
 assert.equal(typeof getSubdomain.call({options:captured},{x:3,y:4}),'string');
}
console.log('PASS: actual Leaflet subdomain method no longer crashes for all street/night/satellite primary and fallback providers.');
