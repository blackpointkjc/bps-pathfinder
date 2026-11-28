const STORAGE_KEY = 'bps:cad-display-settings';

/**
 * CommandCentral-style display scaling. Dispatchers run Pathfinder on
 * everything from a laptop to a wall-mounted multi-monitor console, so the
 * workspace scale and layout choices are personal and persisted per browser.
 */
export const CAD_SCALES = [
  { id: 'compact', label: 'Compact', value: 0.9, note: 'Fits more rows on a small screen' },
  { id: 'standard', label: 'Standard', value: 1, note: 'Default CAD sizing' },
  { id: 'large', label: 'Large', value: 1.12, note: 'Larger labels and controls' },
  { id: 'xlarge', label: 'Extra large', value: 1.24, note: 'Larger display' },
  { id: '150', label: '150%', value: 1.5, note: 'High readability' },
  { id: '175', label: '175%', value: 1.75, note: 'Very large controls' },
  { id: '200', label: '200%', value: 2, note: 'Maximum enlargement' },
];

const DEFAULTS = { scale: 'standard', monitor: true, showMap: true };

export function readCadDisplaySettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      scale: CAD_SCALES.some(option => option.id === parsed?.scale) ? parsed.scale : DEFAULTS.scale,
      monitor: typeof parsed?.monitor === 'boolean' ? parsed.monitor : DEFAULTS.monitor,
      showMap: typeof parsed?.showMap === 'boolean' ? parsed.showMap : DEFAULTS.showMap,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeCadDisplaySettings(next) {
  const value = {
    scale: CAD_SCALES.some(option => option.id === next?.scale) ? next.scale : DEFAULTS.scale,
    monitor: typeof next?.monitor === 'boolean' ? next.monitor : DEFAULTS.monitor,
    showMap: typeof next?.showMap === 'boolean' ? next.showMap : DEFAULTS.showMap,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // A locked-down browser can refuse storage; the in-memory choice still applies.
  }
  return value;
}

export const cadScaleValue = id => CAD_SCALES.find(option => option.id === id)?.value ?? 1;
export function stepCadScale(id,direction){const index=CAD_SCALES.findIndex(x=>x.id===id);return CAD_SCALES[Math.max(0,Math.min(CAD_SCALES.length-1,(index<0?1:index)+Math.sign(direction)))].id;}
