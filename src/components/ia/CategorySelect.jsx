import {IA_CATEGORIES} from '@/lib/iaPolicy';
export default function CategorySelect({value='unclassified',detail='',onChange}){
 const known=IA_CATEGORIES.some(([id])=>id===value),selected=known?value:'other';
 return <div><label>Category<select required value={selected} onChange={e=>onChange({category:e.target.value,category_detail:''})}>{IA_CATEGORIES.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>{selected==='other'&&<label>Other category / IA classification<input required minLength={3} maxLength={300} value={detail||(!known?value:'')} onChange={e=>onChange({category:'other',category_detail:e.target.value})} placeholder="Describe the category for IA review"/></label>}</div>;
}
