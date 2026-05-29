// CAD Call Type Classifications (15 Critical Types)
export const CALL_TYPES = [
  { code: "01", label: "Active Shooter", priority: "critical" },
  { code: "02", label: "Officer Down", priority: "critical" },
  { code: "03", label: "Structure Fire", priority: "critical" },
  { code: "04", label: "Cardiac Arrest", priority: "critical" },
  { code: "05", label: "Shooting / Gunshot Wound", priority: "critical" },
  { code: "06", label: "Domestic Violence (In Progress)", priority: "critical" },
  { code: "07", label: "Armed Robbery", priority: "critical" },
  { code: "08", label: "Vehicle Pursuit", priority: "critical" },
  { code: "09", label: "Overdose / Poisoning", priority: "critical" },
  { code: "10", label: "Unconscious Person", priority: "critical" },
  { code: "11", label: "Assault (Physical Fight)", priority: "high" },
  { code: "12", label: "Burglary In Progress", priority: "high" },
  { code: "13", label: "Suspicious Person / Activity", priority: "medium" },
  { code: "14", label: "Missing Person", priority: "high" },
  { code: "15", label: "Traffic Accident (Injury)", priority: "high" },
];

// Normalize string for comparison
const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9 ]/g, "");

// Simple word-based similarity score
export function similarity(a, b) {
  a = normalize(a);
  b = normalize(b);
  let matches = 0;
  a.split(" ").forEach((word) => {
    if (word.length > 2 && b.includes(word)) matches++;
  });
  return matches / Math.max(a.split(" ").length, 1);
}

// Find best matching call type from user input
export function findCallType(input) {
  if (!input || input.trim().length === 0) return null;
  let bestMatch = null;
  let highestScore = 0;
  CALL_TYPES.forEach((type) => {
    const score = similarity(input, type.label);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = type;
    }
  });
  return highestScore > 0.3 ? bestMatch : null;
}

// Get call type by code
export function getCallTypeByCode(code) {
  return CALL_TYPES.find((t) => t.code === code);
}

// Get all call types grouped by priority
export function getCallTypesByPriority(priority) {
  return CALL_TYPES.filter((t) => t.priority === priority);
}

// Map call type code to priority
export function getCallTypePriority(code) {
  const type = getCallTypeByCode(code);
  return type?.priority || "low";
}