export const isCadReference = value => {
 const text=String(value||'').trim();
 return !!text&&!/^[a-f0-9]{24}$/i.test(text)&&!/^property-alert-|^web-|^https?:|^[a-f0-9]{48,}$/i.test(text)&&/^(?:BPS-\d{6}-\d{1,8}|CAD[- ]|[A-Z]{0,6}[- ]?\d{3,})/i.test(text);
};
export const cadReference = row => [row?.agency_cad_number,row?.bps_reference,row?.cadNumber,row?.call_number,row?.call_id,row?._propertyAlert?.cadNumber,row?._propertyAlert?.bps_reference].find(isCadReference)||'';
