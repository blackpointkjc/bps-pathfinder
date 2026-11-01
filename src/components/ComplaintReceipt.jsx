import {useState} from 'react';

let pdfModule;
export function preloadReceiptPdf(){pdfModule||=import('jspdf');return pdfModule;}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function createReceiptPdf(receipt){
 const {jsPDF}=await preloadReceiptPdf(),pdf=new jsPDF({unit:'mm',format:'a4',compress:false});
 pdf.setFillColor(8,8,8);pdf.rect(0,0,210,48,'F');
 pdf.setFont('helvetica','bold');pdf.setFontSize(23);pdf.setTextColor(255,255,255);pdf.text('BLACK',18,23);pdf.setTextColor(219,188,81);pdf.text('POINT',50,23);
 pdf.setFontSize(10);pdf.text('PROFESSIONAL STANDARDS | SUBMISSION RECEIPT',18,36);
 pdf.setTextColor(25,25,25);pdf.setFontSize(22);pdf.text('Your submission was received.',18,68);
 pdf.setFont('helvetica','normal');pdf.setFontSize(11);pdf.text('Save this receipt somewhere private. You need both details below to check status.',18,80,{maxWidth:174});
 pdf.setFillColor(246,243,233);pdf.roundedRect(18,95,174,67,4,4,'F');
 pdf.setFontSize(10);pdf.setTextColor(100,83,35);pdf.text('COMPLAINT / COMMENDATION REFERENCE',25,108);
 pdf.setTextColor(15,15,15);pdf.setFont('helvetica','bold');pdf.setFontSize(17);pdf.text(String(receipt.reference),25,119);
 pdf.setFont('helvetica','normal');pdf.setFontSize(10);pdf.setTextColor(100,83,35);pdf.text('PRIVATE TRACKING CODE',25,136);
 pdf.setTextColor(15,15,15);pdf.setFont('courier','bold');pdf.setFontSize(20);pdf.text(String(receipt.tracking_code),25,148);
 pdf.setFont('helvetica','normal');pdf.setFontSize(11);pdf.text('Check your status or add evidence:',18,178);pdf.setTextColor(116,86,21);pdf.textWithLink('https://bpspf.blackpointkjc.com/IAFORM',18,187,{url:'https://bpspf.blackpointkjc.com/IAFORM'});
 pdf.setTextColor(45,45,45);pdf.text('Internal Affairs: IA@blackpointkjc.com',18,207);pdf.text('855-8BPS911 ext. 707',18,215);pdf.text('Monday-Friday, 8 AM-6 PM Eastern',18,223);
 pdf.setFontSize(10);pdf.text('Anyone with this reference and code can view your approved status updates.',18,245,{maxWidth:174});pdf.text('Anonymous tracking details cannot be recovered by email.',18,256);
 if(receipt.submitted_at)pdf.text('Submitted: '+new Date(receipt.submitted_at).toLocaleString(),18,277);
 pdf.setProperties({title:'BlackPoint Professional Standards Receipt '+receipt.reference,author:'BlackPoint'});
 return pdf;
}
export function saveReceiptBlob(blob,filename){
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');
 anchor.href=url;anchor.download=filename;anchor.hidden=true;document.body.appendChild(anchor);anchor.click();
 // Give browsers and embedded download handlers time to consume the blob.
 setTimeout(()=>{anchor.remove();URL.revokeObjectURL(url);},60000);
}
export function openPrintableReceipt(receipt){
 const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>BlackPoint submission receipt</title><style>body{font:16px Arial,sans-serif;max-width:720px;margin:50px auto;padding:24px;color:#171717}h1{border-bottom:4px solid #c5a447;padding-bottom:20px}small{color:#666}.code{background:#f4f0e4;padding:20px;font:24px monospace;overflow-wrap:anywhere}button{padding:14px;background:#171717;color:white;border:0;border-radius:8px;cursor:pointer}@media print{button{display:none}body{margin:0}}</style><h1>BLACKPOINT<br><small>Professional Standards receipt</small></h1><p>Reference</p><div class="code">'+esc(receipt.reference)+'</div><p>Private tracking code</p><div class="code">'+esc(receipt.tracking_code)+'</div><p>Check status: https://bpspf.blackpointkjc.com/IAFORM</p><p>IA@blackpointkjc.com<br>855-8BPS911 ext. 707<br>Monday-Friday, 8 AM-6 PM Eastern</p><p>Keep these details private. Anonymous tracking details cannot be recovered.</p><button onclick="window.print()">Print / Save as PDF</button></html>';
 const url=URL.createObjectURL(new Blob([html],{type:'text/html'})),anchor=document.createElement('a');anchor.href=url;anchor.target='_blank';anchor.rel='noopener noreferrer';document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export default function ComplaintReceipt({receipt,onTrack,onNew}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 return <section className="portal-card" aria-live="polite"><p className="portal-eyebrow">Submission received</p><h2>Keep your receipt.</h2><p>You need the reference number and private code to check status or add evidence.</p><label>Reference number<div className="portal-code">{receipt.reference}</div></label><label>Private tracking code<div className="portal-code" style={{fontSize:28,fontWeight:800,letterSpacing:'.2em'}}>{receipt.tracking_code}</div></label>{receipt.evidence_error&&<p className="portal-message portal-error">{receipt.evidence_error}</p>}{error&&<p role="alert" className="portal-message portal-error">{error}</p>}{message&&<p role="status" className="portal-message">{message}</p>}<div className="portal-actions"><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const pdf=await createReceiptPdf(receipt);saveReceiptBlob(pdf.output('blob'),receipt.reference+'-receipt.pdf');setMessage('Your PDF download was requested. If your browser blocks downloads, use View / Print receipt.');}catch{setError('The PDF could not be downloaded. Use View / Print receipt to save a copy.');}finally{setBusy(false);}}}>{busy?'Preparing PDF…':'Download PDF receipt'}</button><button className="portal-secondary" onClick={()=>openPrintableReceipt(receipt)}>View / Print receipt</button><button className="portal-secondary" onClick={onTrack}>Check status or add evidence</button><button className="portal-secondary" onClick={onNew}>New submission</button></div><small>Keep this code private. Anonymous tracking details cannot be recovered by email.</small></section>;
}
