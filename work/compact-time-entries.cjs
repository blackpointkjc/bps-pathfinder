const fs=require('fs'),ts=require('typescript');
const path='src/pages/ManageTimeEntries.jsx';let s=fs.readFileSync(path,'utf8'),edits=[];
const tree=ts.createSourceFile(path,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
function visit(node){
 if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(tree)==='div'&&node.openingElement.attributes.getText(tree).includes('time-entry-')){
  const a=node.openingElement.getStart(tree),b=node.openingElement.end;
  const attrs=node.openingElement.attributes.getText(tree).replace(/className=[\s\S]*/,'');
  const opening='<details '+attrs+' open={editingEntry===entry.id||payrollEntryId===entry.id||String(entry.id)===String(requestedEntryId)} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950"><summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4 hover:bg-slate-800"><div><strong className="text-sm text-white">{entry.location||"Location unavailable"}</strong><p className="mt-1 text-xs text-slate-400">{format(parseISO(entry.clock_in),"MMM d, yyyy h:mm a")} · {entry.clock_out?format(parseISO(entry.clock_out),"h:mm a"):"Still clocked in"}</p></div><div className="text-right"><strong className="text-sm text-cyan-200">{entry.clock_out?calculatePaidHours(entry).toFixed(2)+" paid h":"Active shift"}</strong><p className="mt-1 text-xs text-slate-400">Open record / edit</p></div></summary><div className="border-t border-slate-700 p-3">';
  edits.push([a,b,opening],[node.closingElement.getStart(tree),node.closingElement.end,'</div></details>']);
 }
 ts.forEachChild(node,visit);
}
visit(tree);if(edits.length!==2)throw Error('Expected one time-entry container, found '+edits.length);
for(const [a,b,text]of edits.sort((x,y)=>y[0]-x[0]))s=s.slice(0,a)+text+s.slice(b);
fs.writeFileSync(path,s);
