import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canAccessDispatchCenter} from '../src/lib/dispatchPermissions.js';
const read=p=>readFileSync(p,'utf8');
test('dispatch is a first-class center with independent page, not a nested CAD tool',()=>{
 const layout=read('src/Layout.jsx'),shell=read('src/pages/CADCenter.jsx'),nav=read('src/lib/cadNavigation.js');
 assert.ok(layout.includes("dispatch: {label:'Dispatch Center'"));
 assert.ok(layout.includes("dispatch:'DispatchCenter'"));
 assert.ok(!layout.includes("DispatchCenter: ['cad','live','dispatch']"));
 assert.ok(!shell.includes('component: DispatchCenter'));
 assert.ok(shell.includes("requestedTool==='dispatch'&&dispatchAllowed"));
 assert.ok(nav.includes("if(page==='DispatchCenter'||page==='DispatcherShiftReports')"));
});
test('center visibility follows explicit dispatch permission even for full-access or administrator accounts',()=>{
 const layout=read('src/Layout.jsx');
 const body=layout.slice(layout.indexOf('function allowedCenters(user)'),layout.indexOf('const CENTER_DEFAULT_PAGE'));
 const allowed=new Function('normalizedRoles','hasWholeAppAccess','hasIAAccess','canAccessAccounting','getRoleHome','canAccessDispatchCenter',body+';return allowedCenters;')(
 user=>new Set([user?.role,...(user?.additional_roles||[])]),user=>user?.additional_roles?.includes('full_access'),()=>false,()=>false,()=>({center:'dispatch'}),canAccessDispatchCenter);
 for(const u of [{role:'user',additional_roles:['dispatch']},{role:'admin',additional_roles:['dispatch']},{role:'dispatcher'},{dispatch_role:true,additional_roles:['officer']}])assert.ok(allowed(u).includes('dispatch'));
 for(const u of [{role:'admin'},{additional_roles:['full_access']},{additional_roles:['officer','cad_access']},{additional_roles:['supervisor']},{additional_roles:['dispatch','student']},{additional_roles:['dispatch'],disabled:true}])assert.ok(!allowed(u).includes('dispatch'));
});
test('dispatch role assignment and revocation use audited owner-only permission service',()=>{
 const editor=read('src/components/admin/AdditionalRolesEditor.jsx'),backend=read('base44/functions/updateUser/entry.ts'),reports=read('src/pages/DispatcherShiftReports.jsx');
 assert.ok(editor.includes("['dispatch','Dispatch'"));assert.ok(editor.includes('dispatch_role:checked'));
 assert.ok(backend.includes("const permissionFields = ['role','additional_roles','ps_role','portal_approved','dispatch_role']"));
 assert.ok(backend.includes("const verifiedFields = ['role','ps_role','additional_roles','dispatch_role'"));
 assert.ok(reports.indexOf('if(!canAccessDispatchCenter(user))')<reports.indexOf('return <DispatchReportsWorkspace'));
});
