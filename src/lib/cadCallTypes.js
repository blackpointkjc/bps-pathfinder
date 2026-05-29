// CAD Call Type Classifications (15 Critical Types)
export const CALL_TYPES = [
  {
    code: "01",
    label: "Active Shooter",
    priority: "critical",
    keywords: ["active shooter", "shooter", "shooting spree", "multiple shots", "gunfire"],
  },
  {
    code: "02",
    label: "Officer Down",
    priority: "critical",
    keywords: ["officer down", "cop down", "officer injured", "officer shot", "officer stabbed"],
  },
  {
    code: "03",
    label: "Structure Fire",
    priority: "critical",
    keywords: ["structure fire", "house fire", "building fire", "fire", "house burning", "burning"],
  },
  {
    code: "04",
    label: "Cardiac Arrest",
    priority: "critical",
    keywords: ["cardiac arrest", "heart attack", "not breathing", "chest pain", "unconscious", "unresponsive"],
  },
  {
    code: "05",
    label: "Shooting / Gunshot Wound",
    priority: "critical",
    keywords: ["shots fired", "gunshot", "shooting", "shot", "gun", "firearm", "shotgun", "rifle"],
  },
  {
    code: "06",
    label: "Domestic Violence (In Progress)",
    priority: "critical",
    keywords: ["domestic violence", "domestic", "domestic dispute", "family violence", "spouse assault"],
  },
  {
    code: "07",
    label: "Armed Robbery",
    priority: "critical",
    keywords: ["armed robbery", "robbery", "armed", "theft", "armed theft", "gun robbery"],
  },
  {
    code: "08",
    label: "Vehicle Pursuit",
    priority: "critical",
    keywords: ["vehicle pursuit", "pursuit", "car chase", "fleeing", "pursuit in progress"],
  },
  {
    code: "09",
    label: "Overdose / Poisoning",
    priority: "critical",
    keywords: ["overdose", "overdosed", "poisoning", "drug overdose", "od", "poisoned"],
  },
  {
    code: "10",
    label: "Unconscious Person",
    priority: "critical",
    keywords: ["unconscious", "passed out", "unresponsive", "not awake", "down"],
  },
  {
    code: "11",
    label: "Assault (Physical Fight)",
    priority: "high",
    keywords: ["assault", "fight", "physical fight", "beating", "attacked", "punch"],
  },
  {
    code: "12",
    label: "Burglary In Progress",
    priority: "high",
    keywords: ["burglary", "break-in", "home invasion", "burglary in progress", "breaking and entering"],
  },
  {
    code: "13",
    label: "Suspicious Person / Activity",
    priority: "medium",
    keywords: ["suspicious", "suspicious person", "suspicious activity", "weird", "strange"],
  },
  {
    code: "14",
    label: "Missing Person",
    priority: "high",
    keywords: ["missing", "missing person", "lost", "child missing", "runaway"],
  },
  {
    code: "15",
    label: "Traffic Accident (Injury)",
    priority: "high",
    keywords: ["accident", "traffic accident", "car accident", "crash", "collision", "wreck"],
  },
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

// Calculate confidence score between input and keywords
function keywordMatchScore(input, keywords) {
  if (!keywords || keywords.length === 0) return 0;
  const normalizedInput = normalize(input);
  let bestScore = 0;
  keywords.forEach((keyword) => {
    const normalizedKeyword = normalize(keyword);
    if (normalizedInput === normalizedKeyword) {
      bestScore = 1.0;
    } else if (normalizedInput.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedInput)) {
      bestScore = Math.max(bestScore, 0.9);
    } else {
      const score = similarity(input, keyword);
      bestScore = Math.max(bestScore, score);
    }
  });
  return bestScore;
}

// Main CAD call classification function
// Returns: { matched_code, matched_label, confidence, matched_type }
export function classifyCall(inputText) {
  if (!inputText || inputText.trim().length === 0) {
    return {
      matched_code: null,
      matched_label: null,
      confidence: 0,
      matched_type: null,
    };
  }

  let bestMatch = null;
  let highestScore = 0;

  CALL_TYPES.forEach((callType) => {
    // Score from label matching
    const labelScore = similarity(inputText, callType.label);
    // Score from keyword matching
    const keywordScore = keywordMatchScore(inputText, callType.keywords);
    // Combined score (favor keyword matches slightly)
    const combinedScore = keywordScore > 0 ? keywordScore * 0.7 + labelScore * 0.3 : labelScore;

    if (combinedScore > highestScore) {
      highestScore = combinedScore;
      bestMatch = callType;
    }
  });

  // Only return match if confidence exceeds threshold
  const threshold = 0.35;
  if (bestMatch && highestScore >= threshold) {
    return {
      matched_code: bestMatch.code,
      matched_label: bestMatch.label,
      confidence: Math.round(highestScore * 100) / 100,
      matched_type: bestMatch,
    };
  }

  // No confident match
  return {
    matched_code: null,
    matched_label: null,
    confidence: 0,
    matched_type: null,
  };
}