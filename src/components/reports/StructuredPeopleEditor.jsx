import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Camera, Plus, Trash2, UserRound } from 'lucide-react';
import IDScanner from '@/components/IDScanner';

const blankPerson = (role = 'Other') => ({ role, first_name:'', middle_name:'', last_name:'', dob:'', race:'', sex:'unknown', height_ft:'', height_in:'', weight:'', eyes:'', hair:'', id_number:'', id_state:'', id_expiration:'', address:'', city:'', state:'', zip:'', phone:'', description:'', id_photo:'' });
const tc = v => String(v || '').toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());

export { blankPerson };

export default function StructuredPeopleEditor({ value = [], onChange, title = 'People / Parties', allowedRoles = ['Suspect','Victim','Witness','Complainant','Subject','Other'], defaultRole = 'Other', enableScanner = true }) {
  const [scannerIndex, setScannerIndex] = useState(null);
  const people = Array.isArray(value) ? value : [];
  const update = (index, field, next) => onChange(people.map((p,i) => i === index ? { ...p, [field]: next } : p));
  const remove = index => onChange(people.filter((_,i) => i !== index));
  const add = () => onChange([...people, blankPerson(defaultRole)]);

  const applyScan = (index, data) => {
    const rawHeight = String(data.height || '');
    const heightMatch = rawHeight.match(/(\d+)['\-]?(\d+)?/);
    const scanned = {
      first_name: tc(data.first_name), middle_name: tc(data.middle_name), last_name: tc(data.last_name),
      dob: data.date_of_birth || '', race: tc(data.race), sex: String(data.sex || 'unknown').toLowerCase(),
      height_ft: heightMatch?.[1] || '', height_in: heightMatch?.[2] || '', weight: String(data.weight || '').replace(/[^\d]/g,''),
      eyes: tc(data.eyes), hair: tc(data.hair), id_number: data.id_number || '', id_state: String(data.state || '').toUpperCase(),
      id_expiration: data.expiration_date || '', address: tc(data.address), city: tc(data.city), state: String(data.state || '').toUpperCase(), zip: data.zip_code || '',
      id_photo: data.id_photo || '', id_scanned_in_person: true, scan_type: data.scan_type || data.scan_source || 'id_scan', scan_raw: data.raw_scan || '', scan_parsed_json: JSON.stringify(data), scanned_at: data.scanned_at || new Date().toISOString(), device_id: data.device_id || navigator.userAgent,
    };
    onChange(people.map((p,i) => i === index ? { ...p, ...scanned } : p));
    setScannerIndex(null);
  };

  return <div className="space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-4">
    <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-blue-700"/><div><h3 className="font-semibold text-slate-900">{title}</h3><p className="text-xs text-slate-500">Enter each person separately. Do not combine multiple people into one narrative field.</p></div><Button type="button" size="sm" variant="outline" onClick={add} className="ml-auto"><Plus className="mr-1 h-3.5 w-3.5"/>Add Person</Button></div>
    {people.length === 0 && <div className="rounded border border-dashed p-4 text-center text-xs text-slate-500">No people entered.</div>}
    {people.map((p,index) => <div key={index} className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2"><strong className="text-sm text-slate-800">Person {index + 1}</strong><Select value={p.role || defaultRole} onValueChange={v => update(index,'role',v)}><SelectTrigger className="h-8 w-40"><SelectValue/></SelectTrigger><SelectContent>{allowedRoles.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent></Select><Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} className="ml-auto text-red-600"><Trash2 className="h-4 w-4"/></Button></div>
      {enableScanner && <><Button type="button" variant="outline" className="mb-3 w-full border-blue-300 bg-blue-50 text-blue-700" onClick={() => setScannerIndex(scannerIndex === index ? null : index)}><Camera className="mr-2 h-4 w-4"/>{scannerIndex === index ? 'Close ID Scanner' : `Scan ${p.role || 'Person'} ID / Driver's License`}</Button>{scannerIndex === index && <IDScanner onDataExtracted={data => applyScan(index,data)} onClose={() => setScannerIndex(null)}/>}</>}
      <div className="grid gap-3 md:grid-cols-3"><div><Label>First Name</Label><Input value={p.first_name || ''} onChange={e => update(index,'first_name',tc(e.target.value))}/></div><div><Label>Middle Name</Label><Input value={p.middle_name || ''} onChange={e => update(index,'middle_name',tc(e.target.value))}/></div><div><Label>Last Name</Label><Input value={p.last_name || ''} onChange={e => update(index,'last_name',tc(e.target.value))}/></div></div>
      <div className="mt-3 grid gap-3 md:grid-cols-4"><div><Label>DOB</Label><Input type="date" value={p.dob || ''} onChange={e => update(index,'dob',e.target.value)}/></div><div><Label>Race</Label><Input value={p.race || ''} onChange={e => update(index,'race',tc(e.target.value))}/></div><div><Label>Sex</Label><Select value={p.sex || 'unknown'} onValueChange={v => update(index,'sex',v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem><SelectItem value="unknown">Unknown</SelectItem></SelectContent></Select></div><div><Label>Phone</Label><Input value={p.phone || ''} onChange={e => update(index,'phone',e.target.value)}/></div></div>
      <div className="mt-3 grid gap-3 md:grid-cols-5"><div><Label>Height Ft</Label><Input type="number" value={p.height_ft || ''} onChange={e => update(index,'height_ft',e.target.value)}/></div><div><Label>Height In</Label><Input type="number" value={p.height_in || ''} onChange={e => update(index,'height_in',e.target.value)}/></div><div><Label>Weight</Label><Input type="number" value={p.weight || ''} onChange={e => update(index,'weight',e.target.value)}/></div><div><Label>Eyes</Label><Input value={p.eyes || ''} onChange={e => update(index,'eyes',tc(e.target.value))}/></div><div><Label>Hair</Label><Input value={p.hair || ''} onChange={e => update(index,'hair',tc(e.target.value))}/></div></div>
      <div className="mt-3 grid gap-3 md:grid-cols-3"><div><Label>ID / Driver License #</Label><Input value={p.id_number || ''} onChange={e => update(index,'id_number',e.target.value.toUpperCase())}/></div><div><Label>ID State</Label><Input maxLength={2} value={p.id_state || ''} onChange={e => update(index,'id_state',e.target.value.toUpperCase())}/></div><div><Label>ID Expiration</Label><Input type="date" value={p.id_expiration || ''} onChange={e => update(index,'id_expiration',e.target.value)}/></div></div>
      <div className="mt-3 grid gap-3 md:grid-cols-4"><div className="md:col-span-2"><Label>Street Address</Label><Input value={p.address || ''} onChange={e => update(index,'address',tc(e.target.value))}/></div><div><Label>City</Label><Input value={p.city || ''} onChange={e => update(index,'city',tc(e.target.value))}/></div><div className="grid grid-cols-2 gap-2"><div><Label>State</Label><Input maxLength={2} value={p.state || ''} onChange={e => update(index,'state',e.target.value.toUpperCase())}/></div><div><Label>ZIP</Label><Input value={p.zip || ''} onChange={e => update(index,'zip',e.target.value)}/></div></div></div>
      <div className="mt-3"><Label>Physical Description / Notes</Label><Textarea rows={2} value={p.description || ''} onChange={e => update(index,'description',e.target.value)}/></div>
      {p.id_photo && <img src={p.id_photo} alt="Scanned ID" className="mt-3 h-24 rounded border object-cover"/>}
    </div>)}
  </div>;
}
