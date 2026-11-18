"""Migrate non-operational blue/violet Tailwind surface accents to BlackPoint gold/cream.
Does not touch traffic maps, colored safety priorities, chart data, or logic.
"""
from pathlib import Path
import re
paths=list(Path('src/pages').rglob('*.jsx'))+list(Path('src/components').rglob('*.jsx'))
pat=re.compile(r'(?<![\w-])(?P<prefix>bg|from|via|to)-(?P<name>blue|cyan|sky|indigo|violet)-(?P<shade>50|100|200|300|400|500|600|700|800|900|950)(?P<opacity>/\d+)?')
count=0;changed=[]
for path in paths:
 if '/map/' in str(path) or path.name in ('Navigation.jsx','AdminLocationTracker.jsx','OfficerDistressButton.jsx','CadCriticalIncidentBanner.jsx'):continue
 src=path.read_text()
 def replace(m):
  global count
  shade=int(m.group('shade'));op=m.group('opacity') or '';prefix=m.group('prefix')
  if shade<=100:new='amber-50' if shade==50 else 'amber-100'
  elif shade<=300:new='amber-200' if shade==200 else 'amber-300'
  elif shade<=500:new='amber-400'
  elif shade<=700:new='amber-600' if shade==600 else 'amber-700'
  else:new='stone-900' if shade>=900 else 'stone-800'
  count+=1
  return f'{prefix}-{new}{op}'
 s=pat.sub(replace,src)
 if s!=src:path.write_text(s);changed.append(str(path))
print('Modified',len(changed),'components, updated',count,'blue/violet surface utilities')
