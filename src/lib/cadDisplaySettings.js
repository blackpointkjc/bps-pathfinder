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
  { id: 'xlarge', label: 'Extra large', value: 1.24, note: 'Maximum readability at a distance' },
];

const DEFAULTS = { scale: 'standard', monitor: true };

export function readCadDisplaySettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      scale: CAD_SCALES.some(option => option.id === parsed?.scale) ? parsed.scale : DEFAULTS.scale,
      monitor: typeof parsed?.monitor === 'boolean' ? parsed.monitor : DEFAULTS.monitor,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeCadDisplaySettings(next) {
  const value = {
    scale: CAD_SCALES.some(option => option.id === next?.scale) ? next.scale : DEFAULTS.scale,
    monitor: typeof next?.monitor === 'boolean' ? next.monitor : DEFAULTS.monitor,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // A locked-down browser can refuse storage; the in-memory choice still applies.
  }
  return value;
}

export const cadScaleValue = id => CAD_SCALES.find(option => option.id === id)?.value ?? 1;