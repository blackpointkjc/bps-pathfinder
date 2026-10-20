from pathlib import Path
import re,json
ID='6a72bbee2842d6338cbae513'
def change(p,fn):
 p=Path(p);s=p.read_text();t=fn(s)
 if t!=s:p.write_text(t)
Path('src/lib/accountingAccess.js').write_text("export const ACCOUNTING_OWNER_ID = '"+ID+"';\nexport const canAccessAccounting = user => String(user?.id || '') === ACCOUNTING_OWNER_ID;\n")
# Financial service authorization uses immutable owner identity; scheduled trusted execution stays intact.
for name,var in [('getAccountingData','me'),('manageAccountingExpenses','me'),('manageAccountingRecords','user'),('manageAccountingPayroll','actor'),('updatePayrollConfig','user'),('maintainRollingPayrollPeriods','user'),('getPayrollPTOUsage','user')]:
 p=Path('base44/functions')/name/'entry.ts';s=p.read_text()
 if name=='maintainRollingPayrollPeriods':
  s=re.sub(r"const allowed = [^;]+;",f"const allowed = String(user.id) === '{ID}';",s,count=1)
 else:
  # These explicit gate conditions precede every privileged read/write.
  pattern=r"if\s*\("+var+r"\.role\s*!==\s*'admin'[^)]*(?:\([^)]*\)[^)]*)*\)\s*(?=\{|return)"
  # Avoid broad parser regex: exact conditions captured line-wise.
  lines=s.splitlines()
  for i,line in enumerate(lines):
   if 'if' in line and var+".role" in line and ("Accounting" in line or name in ['getAccountingData','manageAccountingRecords','updatePayrollConfig','getPayrollPTOUsage']):
    begin=line.find('if');end=line.find('return') if 'return' in line else line.rfind('{')
    lines[i]=line[:begin]+f"if (String({var}.id) !== '{ID}') "+line[end:]
    break
  s='\n'.join(lines)+'\n'
 p.write_text(s)
for name in ['generateScheduledPayroll','generateWeeklyInvoices','applyInvoiceLateFees']:
 p=Path('base44/functions')/name/'entry.ts';s=p.read_text()
 s=s.replace("caller.role !== 'admin' && !callerRoles.has('full_access') && !callerRoles.has('accounting')",f"String(caller.id) !== '{ID}'")
 s=s.replace("(caller.role!=='admin'&&!roles.has('accounting')&&!roles.has('full_access'))",f"String(caller.id)!=='{ID}'")
 s=s.replace("(user.role!=='admin'&&!roles.has('accounting')&&!roles.has('full_access'))",f"String(user.id)!=='{ID}'")
 s=s.replace("(actor.role!=='admin'&&!roles.has('accounting')&&!roles.has('full_access'))",f"String(actor.id)!=='{ID}'")
 s=s.replace("user.role === 'admin' || roles.includes('accounting') || roles.includes('full_access')",f"String(user.id) === '{ID}'")
 p.write_text(s)
for p in Path('src/pages').glob('Accounting*.jsx'):
 s=p.read_text()
 s=re.sub(r"const (isAccountingRole|allowed) = [^;]+;",r"const \1 = canAccessAccounting(user);",s)
 if 'canAccessAccounting(user)' in s:s="import { canAccessAccounting } from '@/lib/accountingAccess';\n"+s
 p.write_text(s)
p=Path('src/Layout.jsx');s=p.read_text();s="import { canAccessAccounting } from '@/lib/accountingAccess';\n"+s
s=s.replace("roles.has('accounting') ? ['accounting']", "canAccessAccounting(user) ? ['accounting']")
s=s.replace("if (roles.has('accounting')) centers.push('accounting');","if (canAccessAccounting(user)) centers.push('accounting');")
s=s.replace("function canAccessPage(user, pageName) {","function canAccessPage(user, pageName) {\n  if (pageName.startsWith('Accounting') || pageName === 'PayrollDates') return canAccessAccounting(user);")
p.write_text(s)
# Do not offer the Accounting role on other accounts.
for name in ['ManageCompanyEmployees','AdminUsers']:
 p=Path('src/pages')/(name+'.jsx');s=p.read_text()
 s="import { canAccessAccounting } from '@/lib/accountingAccess';\n"+s
 if name=='ManageCompanyEmployees':
  s=s.replace("].map(({ id, label, desc, color })", "].filter(item => item.id !== 'accounting' || canAccessAccounting(selectedUser)).map(({ id, label, desc, color })")
  s=s.replace("Access to every internal operations center","Internal operations access; accounting is restricted to Colonel Hiers")
 else:
  anchor="  const assignUserCategory ="
  pos=s.index(anchor);before=s[:pos];idx=before.rfind('  });')
  before=before[:idx]+before[idx:].replace('  });',"  }).sort((a,b) => (Number.parseInt(a.unit_number,10) || Infinity) - (Number.parseInt(b.unit_number,10) || Infinity) || String(a.last_name || a.email).localeCompare(String(b.last_name || b.email)));",1)
  s=before+s[pos:]
 p.write_text(s)
# Prevent granting the legacy role to another account through the profile API.
p=Path('base44/functions/updateUser/entry.ts');s=p.read_text();anchor="        const targetRoles ="
s=s.replace(anchor,f"""        if (Array.isArray(updates.additional_roles) && userId !== '{ID}') {{
            updates.additional_roles = updates.additional_roles.filter((role:any) => String(role).toLowerCase() !== 'accounting');
        }}
"""+anchor);p.write_text(s)
# Protect direct SDK financial records too. Personal payroll/W2 reads remain.
for name in ['PayrollEntry','W2Form','PayrollConfig','CompanyExpense','RecurringCompanyBill','Invoice']:
 p=Path('base44/entities')/(name+'.jsonc');s=p.read_text();data=json.loads(s)
 owner={'user_condition':{'id':ID}}
 if name in ['PayrollEntry','W2Form']:
  data['rls']={action:owner for action in ['create','update','delete']}
  data['rls']['read']={'$or':[{'data.officer_email':'{{user.email}}'},owner]}
 elif name=='Invoice':
  data['rls']={action:owner for action in ['create','update','delete']}
  data['rls']['read']={'$or':[{'data.client_email':'{{user.email}}'},owner]}
 else:data['rls']={action:owner for action in ['create','read','update','delete']}
 p.write_text(json.dumps(data,indent=2)+'\n')
