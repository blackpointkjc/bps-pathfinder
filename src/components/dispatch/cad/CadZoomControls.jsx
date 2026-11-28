import {CAD_SCALES,cadScaleValue,stepCadScale} from '@/lib/cadDisplaySettings';
export default function CadZoomControls({value='standard',onChange}){
 const index=CAD_SCALES.findIndex(s=>s.id===value);
 return <div className="cad-zoom-controls" role="group" aria-label="CAD workstation zoom"><button type="button" aria-label="Zoom out CAD workstation" disabled={index===0} onClick={()=>onChange(stepCadScale(value,-1))}>−</button><button type="button" title="Reset to 100%" aria-label="Reset CAD zoom to 100 percent" onClick={()=>onChange('standard')}>{Math.round(cadScaleValue(value)*100)}%</button><button type="button" aria-label="Zoom in CAD workstation" disabled={index===CAD_SCALES.length-1} onClick={()=>onChange(stepCadScale(value,1))}>+</button></div>;
}
