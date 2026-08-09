import { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { BookOpen, Bot, ExternalLink, Search, ShieldCheck, Scale, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const CODES = [
  { category:'Confrontation / Assault', name:'Assault & Battery', code:'Va. Code § 18.2-57', level:'Class 1 misdemeanor (basic offense)', elements:'Simple assault or assault and battery. Document observable acts, statements, contact, injuries, witnesses, and evidence.', keywords:['assault','battery','hit','punch','fight','struck'], url:'https://law.lis.virginia.gov/vacode/title18.2/chapter4/section18.2-57/' },
  { category:'Confrontation / Assault', name:'Domestic Assault', code:'Va. Code § 18.2-57.2', level:'Class 1 misdemeanor (basic offense)', elements:'Assault and battery involving a qualifying family or household member. Relationship and prior qualifying convictions can matter.', keywords:['domestic','family','household','spouse'], url:'https://law.lis.virginia.gov/vacode/title18.2/chapter4/section18.2-57.2/' },
  { category:'Confrontation / Assault', name:'Malicious / Unlawful Wounding', code:'Va. Code § 18.2-51', level:'Felony; classification depends on facts', elements:'Serious bodily-injury offense requiring the statutory intent and circumstances. Preserve injury, witness, video, and statement evidence and involve law enforcement.', keywords:['wounding','serious injury','stabbed','shot','maim'], url:'https://law.lis.virginia.gov/vacode/title18.2/chapter4/section18.2-51/' },
  { category:'Threats / Harassment', name:'Stalking', code:'Va. Code § 18.2-60.3', level:'Class 1 misdemeanor (basic offense)', elements:'Repeated directed conduct and the statutory fear requirement. Document each known occasion, dates, communications, witnesses, and reported fear.', keywords:['stalking','followed','following','repeated','fear'], url:'https://law.lis.virginia.gov/vacode/title18.2/chapter4/section18.2-60.3/' },
  { category:'Threats / Harassment', name:'Threatening / Harassing Communications', code:'Va. Code § 18.2-427', level:'Class 1 misdemeanor', elements:'Certain communications made with the intent required by the statute. Preserve exact messages, sender information, dates, and platform/device evidence.', keywords:['threatening message','harassing message','phone threat','text threat','electronic threat'], url:'https://law.lis.virginia.gov/vacode/title18.2/chapter9/section18.2-427/' },
  { category:'Property / Trespass', name:'Trespass After Forbidden', code:'Va. Code § 18.2-119', level:'Class 1 misdemeanor', elements:'Entering or remaining after qualifying notice from an authorized person, posted notice, or qualifying court order. Record exactly who gave notice, how, where, and when.', keywords:['trespass','refused to leave','banned','no trespassing','returned after warning'], url:'https://law.lis.virginia.gov/vacode/title18.2/chapter5/section18.2-119/' },
  { category:'Property / Trespass', name:'Entering to Damage / Interfere', code:'Va. Code § 18.2-121', level:'Class 1 misdemeanor; enhanced circumstances may apply', elements:'Entry onto another’s property for the statutory damage/interference purpose. Document conduct, intent evidence, damage, and property authority.', keywords:['damage property','interfere','entered to damage','vandal'], url:'https://law.lis.virginia.gov/vacode/title18.2/chapter5/section18.2-121/' },
  { category:'Theft / Property', name:'Petit Larceny', code:'Va. Code § 18.2-96', level:'Class 1 misdemeanor', elements:'Larceny below the statutory grand-larceny thresholds. Document ownership, value and basis for value, possession, video, witnesses, and statements.', keywords:['petit larceny','theft','stole','shoplift','missing property'], url:'https://law.lis.virginia.gov/vacode/title18.2/chapter5/section18.2-96/' },
  { category:'Theft / Property', name:'Grand Larceny', code:'Va. Code § 18.2-95', level:'Felony', elements:'Larceny meeting a statutory grand-larceny category or threshold. Confirm current threshold and document value and supporting evidence.', keywords:['grand larceny','theft','stole','high value','firearm theft'], url:'https://law.lis.virginia.gov/vacode/title18.2/chapter5/section18.2-95/' },
  { category:'Property Damage', name:'Property Destruction / Damage', code:'Va. Code § 18.2-137', level:'Classification varies by intent and value', elements:'Unlawful or intentional damage to property. Photograph damage and document ownership, repair/replacement value, witnesses, video, and statements.', keywords:['property damage','destruction','vandalism','broke window','damaged car'], url:'https://law.lis.virginia.gov/vacode/title18.2/chapter5/section18.2-137/' },
  { category:'Vehicle / Property', name:'Unauthorized Use of Vehicle', code:'Va. Code § 18.2-102', level:'Classification depends on value and facts', elements:'Use of another’s vehicle without consent under the statutory intent. Document ownership, lack of consent, possession/use, statements, and vehicle value.', keywords:['unauthorized vehicle','took car','used car without permission','joyride'], url:'https://law.lis.virginia.gov/vacode/title18.2/chapter5/section18.2-102/' },
  { category:'Public Order', name:'Disorderly Conduct', code:'Va. Code § 18.2-415', level:'Class 1 misdemeanor', elements:'Apply the actual statutory public-conduct elements. Loud, annoying, or unpopular conduct alone is not automatically disorderly conduct.', keywords:['disorderly','disturbance','public disturbance','causing scene'], url:'https://law.lis.virginia.gov/vacode/title18.2/chapter9/section18.2-415/' },
  { category:'Public Order', name:'Intoxicated in Public', code:'Va. Code § 18.2-388', level:'Class 4 misdemeanor', elements:'Public intoxication under the statute. Document objective observations and request law-enforcement/medical assistance when appropriate.', keywords:['intoxicated','drunk in public','public intoxication'], url:'https://law.lis.virginia.gov/vacode/title18.2/chapter7/section18.2-388/' },
  { category:'Public Order', name:'Obstruction of Justice', code:'Va. Code § 18.2-460', level:'Subsection controls', elements:'Do not treat refusal to cooperate or flight from private security as automatic obstruction. Match the conduct to the current statutory subsection and covered official.', keywords:['obstruction','interfere with officer','resisting'], url:'https://law.lis.virginia.gov/vacode/title18.2/chapter10/section18.2-460/' },
  { category:'Authority / Procedure', name:'Conservator Powers & Duties', code:'Va. Code § 19.2-18', level:'Authority provision', elements:'Conservator warrantless-arrest authority exists only in the instances incorporated by the statute. Appointment order, jurisdiction, limitations, and policy still control.', keywords:['arrest authority','scop authority','conservator','can i arrest'], url:'https://law.lis.virginia.gov/vacode/title19.2/chapter2/section19.2-18/' },
  { category:'Authority / Procedure', name:'Summons in Place of Arrest', code:'Va. Code § 19.2-74', level:'Procedure provision', elements:'Virginia summons procedure, including provisions concerning special conservators of the peace. Confirm that the specific offense and circumstances qualify.', keywords:['summons','release on summons','misdemeanor summons'], url:'https://law.lis.virginia.gov/vacode/title19.2/chapter7/section19.2-74/' },
  { category:'Authority / Procedure', name:'Arrest Without Warrant', code:'Va. Code § 19.2-81', level:'Procedure / authority provision', elements:'Warrantless arrest authority is circumstance-specific. Do not reduce it to a blanket rule for all misdemeanors or reported offenses.', keywords:['warrantless arrest','arrest without warrant','probable cause arrest'], url:'https://law.lis.virginia.gov/vacode/title19.2/chapter7/section19.2-81/' },
];

const CHECKLIST = [
  'Identify the suspected offense and each required element before selecting a code.',
  'Separate what you personally observed from what a victim or witness reported.',
  'Document value when value changes the offense classification.',
  'For trespass, record who had authority to forbid entry/remain and exactly how notice was given.',
  'Confirm the conduct is within your appointment order, property/geographic jurisdiction, and employer policy.',
  'Determine whether Virginia law authorizes the enforcement action under the actual facts; do not assume.',
  'Preserve video, photographs, witnesses, statements, damage, injury, and other evidence.',
  'Use law enforcement or a magistrate when offense severity, jurisdiction, evidence, transport, or policy requires it.',
];

function localMatch(text) {
  const hay = String(text || '').toLowerCase();
  return CODES.map(item => ({ item, score: item.keywords.reduce((n,k) => n + (hay.includes(k) ? 2 : 0), 0) + (hay.includes(item.name.toLowerCase()) ? 3 : 0) }))
    .filter(x => x.score > 0).sort((a,b)=>b.score-a.score).slice(0,5).map(x=>x.item);
}

export default function VirginiaFieldLawAssistant() {
  const [search, setSearch] = useState('');
  const [issue, setIssue] = useState('');
  const [aiResults, setAiResults] = useState([]);
  const [aiSummary, setAiSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CODES;
    return CODES.filter(x => [x.name,x.code,x.category,x.level,x.elements].join(' ').toLowerCase().includes(q));
  }, [search]);

  const analyzeIssue = async () => {
    if (!issue.trim()) return;
    setLoading(true);
    const fallback = localMatch(issue);
    try {
      const allowed = CODES.map(x => ({ code:x.code,name:x.name,category:x.category,elements:x.elements })).map(x=>JSON.stringify(x)).join('\n');
      const result = await base44.integrations.Core.InvokeLLM({
        prompt:`You are a Virginia field-law reference assistant for security officers. Analyze the incident description and identify only potentially relevant references from the APPROVED LIST below. Do not invent statutes, do not decide probable cause, do not direct an arrest, do not give tactical or weapon-use instructions, and do not state that a person is guilty. Emphasize missing facts and documentation needed. Return up to 5 exact code strings from the approved list.\n\nINCIDENT:\n${issue}\n\nAPPROVED LIST:\n${allowed}`,
        response_json_schema:{type:'object',properties:{summary:{type:'string'},codes:{type:'array',items:{type:'string'}},missing_facts:{type:'array',items:{type:'string'}}},required:['summary','codes','missing_facts']}
      });
      const selected = (result?.codes || []).map(code => CODES.find(x=>x.code===code)).filter(Boolean);
      setAiResults(selected.length ? selected : fallback);
      setAiSummary([result?.summary, result?.missing_facts?.length ? `Missing facts to verify: ${result.missing_facts.join('; ')}` : ''].filter(Boolean).join('\n'));
    } catch {
      setAiResults(fallback);
      setAiSummary(fallback.length ? 'AI service was unavailable, so the app used its local Virginia field-reference matcher. Verify every suggested section against the current official statute.' : 'No clear code match was found. Gather more facts and consult a supervisor, magistrate, or law enforcement as appropriate.');
    } finally { setLoading(false); }
  };

  return <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-7">
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="rounded-2xl border border-blue-500/25 bg-gradient-to-br from-slate-900 to-slate-950 p-6">
        <div className="flex items-start gap-4"><div className="rounded-xl bg-blue-500/15 p-3"><Scale className="h-7 w-7 text-blue-300"/></div><div><div className="text-xs font-bold uppercase tracking-[.22em] text-blue-300">Virginia Officer Reference</div><h1 className="mt-1 text-3xl font-black">Virginia Field Law Assistant</h1><p className="mt-2 max-w-3xl text-sm text-slate-300">Search common Virginia field statutes or describe an incident for AI-assisted code references. This is a field reference, not legal advice, a charging decision, or independent arrest authority.</p></div></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center gap-2 text-lg font-bold"><Bot className="h-5 w-5 text-violet-300"/>AI Issue-to-Code Assistant</div>
          <p className="mt-1 text-xs text-slate-400">Describe observable facts. The AI is restricted to the approved Virginia references on this page.</p>
          <Textarea className="mt-4 min-h-36 bg-slate-950 border-slate-700" value={issue} onChange={e=>setIssue(e.target.value)} placeholder="Example: A person who was previously told by the property manager not to return came back and refused to leave..."/>
          <Button className="mt-3" onClick={analyzeIssue} disabled={loading || !issue.trim()}>{loading ? 'Checking references…' : 'Find Potential Code References'}</Button>
          {(aiSummary || aiResults.length>0) && <div className="mt-4 rounded-xl border border-violet-500/25 bg-violet-950/20 p-4"><div className="whitespace-pre-wrap text-sm text-slate-200">{aiSummary}</div><div className="mt-3 space-y-2">{aiResults.map(x=><div key={x.code} className="rounded-lg border border-slate-700 bg-slate-950/70 p-3"><div className="font-bold text-violet-200">{x.name} · {x.code}</div><div className="mt-1 text-xs text-slate-400">{x.elements}</div></div>)}</div></div>}
        </section>

        <section className="rounded-2xl border border-amber-500/25 bg-amber-950/10 p-5">
          <div className="flex items-center gap-2 text-lg font-bold text-amber-200"><ShieldCheck className="h-5 w-5"/>Virginia Authority & Documentation Check</div>
          <div className="mt-4 space-y-2">{CHECKLIST.map(item=><div key={item} className="flex gap-2 text-sm text-slate-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"/><span>{item}</span></div>)}</div>
          <div className="mt-5 rounded-lg border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-100"><AlertTriangle className="mr-2 inline h-4 w-4"/>Never use an AI suggestion by itself as probable cause, authority to arrest, or a substitute for the current statute, appointment order, supervisor, magistrate, or law-enforcement guidance.</div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2 text-lg font-bold"><BookOpen className="h-5 w-5 text-blue-300"/>Virginia Criminal Code Field Reference</div><p className="text-xs text-slate-400">Common field references. Always open the current official statute before relying on a section.</p></div><div className="relative w-full md:w-96"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><Input className="pl-9 bg-slate-950 border-slate-700" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search code, offense, category…"/></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map(x=><article key={x.code} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-blue-400">{x.category}</div><div className="mt-1 font-bold">{x.name}</div><div className="mt-1 font-mono text-sm text-amber-200">{x.code}</div><div className="mt-2 text-xs font-semibold text-slate-300">{x.level}</div><p className="mt-2 text-xs leading-relaxed text-slate-400">{x.elements}</p><button className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-300 hover:text-blue-200" onClick={()=>window.open(x.url,'_blank','noopener,noreferrer')}>Current Virginia statute <ExternalLink className="h-3 w-3"/></button></article>)}</div>
      </section>
    </div>
  </div>;
}
