"""One-time design-token migration of dark navy surfaces across Pathfinder.
Does not touch route behavior, emergency status colors, or map renderers.
"""
from pathlib import Path
import colorsys,re
paths=[Path('src/Layout.jsx')]+list(Path('src/pages').rglob('*.jsx'))+list(Path('src/components').rglob('*.jsx'))
pattern=re.compile(r'(?<![\w-])(?P<prefix>bg|from|via|to|border|text)-\[#(?P<rgb>[0-9a-fA-F]{6})\]')
counts={k:0 for k in ('bg','from','via','to','border','text')};files=[]
def convert(prefix,r,g,b):
 hue,sat,val=colorsys.rgb_to_hsv(r/255,g/255,b/255)
 if not (.48<hue<.76 and sat>.14):return None
 if prefix in ('bg','from','via','to'):
  if val<.105:return '090a0c'
  if val<.155:return '111316'
  if val<.215:return '191a1b'
  if val<.295:return '222321'
  if val<.40:return '302c25'
  if val<.55:return '4c4030'
  if val<.75:return '9b8047'
  return 'd8b761'
 if prefix=='border':return '413a2e' if val<.24 else '635336' if val<.44 else '967a47' if val<.7 else 'c5a259'
 if prefix=='text':return 'a99b7f' if val<.5 else 'd5c092' if val<.8 else 'f0dba8'
for path in paths:
 if '/map/' in str(path) or path.name in ('Navigation.jsx','AdminLocationTracker.jsx'):continue
 src=path.read_text()
 def replace(m):
  rgb=m.group('rgb');rgbv=[int(rgb[i:i+2],16) for i in (0,2,4)];color=convert(m.group('prefix'),*rgbv)
  if not color or color.lower()==rgb.lower():return m.group(0)
  counts[m.group('prefix')]+=1
  return m.group('prefix')+'-[#'+color+']'
 changed=pattern.sub(replace,src)
 if changed!=src:path.write_text(changed);files.append(str(path))
print('Updated files:',len(files),'color classes:',counts)
print('By area:',{name:sum('/'+name+'/' in p for p in files) for name in ['pages','components']})
