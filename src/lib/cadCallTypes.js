// CAD Call Type Classifications (15 Critical Types)
export const CALL_TYPES = [
  // Critical / immediate threat
  { code: "01", label: "Active Shooter", category: "Critical", priority: "critical", keywords: ["active shooter", "shooter", "shooting spree", "multiple shots", "active threat"] },
  { code: "02", label: "Officer Down / Officer Needs Help", category: "Critical", priority: "critical", keywords: ["officer down", "officer needs help", "officer injured", "officer shot", "officer stabbed"] },
  { code: "03", label: "Structure Fire", category: "Fire / Medical", priority: "critical", keywords: ["structure fire", "house fire", "building fire", "fire", "burning building"] },
  { code: "04", label: "Cardiac Arrest / Not Breathing", category: "Fire / Medical", priority: "critical", keywords: ["cardiac arrest", "not breathing", "cpr", "heart attack"] },
  { code: "05", label: "Shooting / Gunshot Wound", category: "Weapons / Violence", priority: "critical", keywords: ["shots fired", "gunshot", "shooting", "shot", "gunshot wound"] },
  { code: "06", label: "Domestic Violence In Progress", category: "Violence", priority: "critical", keywords: ["domestic violence", "domestic", "family fight", "spouse assault"] },
  { code: "07", label: "Armed Robbery", category: "Robbery / Theft", priority: "critical", keywords: ["armed robbery", "robbery with gun", "robbery with weapon"] },
  { code: "08", label: "Vehicle Pursuit", category: "Traffic", priority: "critical", keywords: ["vehicle pursuit", "pursuit", "car chase", "fleeing vehicle"] },
  { code: "09", label: "Overdose / Poisoning", category: "Fire / Medical", priority: "critical", keywords: ["overdose", "poisoning", "drug overdose", "od"] },
  { code: "10", label: "Unconscious / Unresponsive Person", category: "Fire / Medical", priority: "critical", keywords: ["unconscious", "passed out", "unresponsive", "not awake"] },

  // Violence / weapons
  { code: "11", label: "Assault / Physical Fight", category: "Violence", priority: "high", keywords: ["assault", "fight", "physical fight", "beating", "altercation", "brawl"] },
  { code: "12", label: "Burglary In Progress", category: "Property Crime", priority: "high", keywords: ["burglary in progress", "break in now", "breaking into building", "home invasion"] },
  { code: "13", label: "Suspicious Person / Activity", category: "Suspicious Activity", priority: "medium", keywords: ["suspicious", "suspicious person", "suspicious activity", "prowler", "loitering"] },
  { code: "14", label: "Missing Person / Runaway", category: "Person / Welfare", priority: "high", keywords: ["missing", "missing person", "runaway", "lost person", "missing child"] },
  { code: "15", label: "Traffic Crash With Injury", category: "Traffic", priority: "high", keywords: ["accident injury", "traffic accident injury", "car crash injury", "wreck injury"] },
  { code: "16", label: "Person With a Weapon", category: "Weapons / Violence", priority: "critical", keywords: ["person with gun", "person with weapon", "armed person", "knife", "firearm"] },
  { code: "17", label: "Shots Fired / Shots Heard", category: "Weapons / Violence", priority: "critical", keywords: ["shots fired", "shots heard", "gunfire", "heard gunshots"] },
  { code: "18", label: "Stabbing / Cutting", category: "Weapons / Violence", priority: "critical", keywords: ["stabbing", "stabbed", "cutting", "knife wound"] },
  { code: "19", label: "Threats / Intimidation", category: "Violence", priority: "high", keywords: ["threats", "threatened", "intimidation", "threatening"] },
  { code: "20", label: "Disorderly Conduct / Disturbance", category: "Public Order", priority: "medium", keywords: ["disorderly", "disturbance", "causing a scene", "disruptive"] },

  // Property / theft / trespass
  { code: "21", label: "Trespassing / Refusing to Leave", category: "Property / Trespass", priority: "medium", keywords: ["trespass", "trespassing", "refusing to leave", "banned person"] },
  { code: "22", label: "Burglary / Break-In Report", category: "Property Crime", priority: "medium", keywords: ["burglary report", "break in", "broken into", "building entered"] },
  { code: "23", label: "Larceny / Theft", category: "Robbery / Theft", priority: "medium", keywords: ["larceny", "theft", "stolen property", "stole"] },
  { code: "24", label: "Shoplifting / Retail Theft", category: "Robbery / Theft", priority: "medium", keywords: ["shoplifting", "retail theft", "conceal merchandise"] },
  { code: "25", label: "Robbery", category: "Robbery / Theft", priority: "high", keywords: ["robbery", "strong arm robbery", "snatch robbery"] },
  { code: "26", label: "Vandalism / Property Damage", category: "Property Crime", priority: "medium", keywords: ["vandalism", "property damage", "damaged property", "graffiti"] },
  { code: "27", label: "Stolen Vehicle", category: "Vehicle / Property", priority: "high", keywords: ["stolen vehicle", "stolen car", "auto theft"] },
  { code: "28", label: "Vehicle Tampering / Break-In", category: "Vehicle / Property", priority: "medium", keywords: ["vehicle break in", "car break in", "vehicle tampering", "rifled through car"] },
  { code: "29", label: "Found Property", category: "Property", priority: "low", keywords: ["found property", "found item", "lost property found"] },
  { code: "30", label: "Lost Property", category: "Property", priority: "low", keywords: ["lost property", "lost item", "missing belongings"] },

  // Alarms / property checks
  { code: "31", label: "Burglary Alarm", category: "Alarm", priority: "high", keywords: ["burglary alarm", "intrusion alarm", "alarm activation"] },
  { code: "32", label: "Panic / Hold-Up Alarm", category: "Alarm", priority: "critical", keywords: ["panic alarm", "hold up alarm", "duress alarm"] },
  { code: "33", label: "Fire Alarm", category: "Alarm", priority: "high", keywords: ["fire alarm", "smoke alarm", "alarm sounding"] },
  { code: "34", label: "Door / Access Alarm", category: "Alarm", priority: "medium", keywords: ["door alarm", "access alarm", "forced door", "door propped"] },
  { code: "35", label: "Open Door / Unsecured Property", category: "Property Check", priority: "medium", keywords: ["open door", "unsecured door", "door open", "property unsecured"] },
  { code: "36", label: "Property Check / Extra Patrol Request", category: "Property Check", priority: "low", keywords: ["property check", "extra patrol", "check property", "vacation check"] },

  // Welfare / persons / public order
  { code: "37", label: "Welfare Check", category: "Person / Welfare", priority: "medium", keywords: ["welfare check", "check welfare", "well being check"] },
  { code: "38", label: "Mental Health / Crisis", category: "Person / Welfare", priority: "high", keywords: ["mental health", "crisis", "behavioral crisis", "emotionally disturbed"] },
  { code: "39", label: "Intoxicated Person", category: "Public Order", priority: "medium", keywords: ["intoxicated", "drunk person", "public intoxication"] },
  { code: "40", label: "Noise Complaint / Loud Party", category: "Public Order", priority: "low", keywords: ["noise complaint", "loud party", "loud music", "noise"] },
  { code: "41", label: "Loitering", category: "Public Order", priority: "low", keywords: ["loitering", "hanging around", "loiterers"] },
  { code: "42", label: "Harassment / Unwanted Contact", category: "Person / Welfare", priority: "medium", keywords: ["harassment", "unwanted contact", "harassing"] },
  { code: "43", label: "Civil Dispute / Landlord-Tenant", category: "Civil / Service", priority: "low", keywords: ["civil dispute", "landlord tenant", "property dispute", "civil matter"] },
  { code: "44", label: "Escort / Standby", category: "Civil / Service", priority: "low", keywords: ["escort", "standby", "civil standby", "employee escort"] },

  // Traffic / vehicles
  { code: "45", label: "Traffic Crash No Injury", category: "Traffic", priority: "medium", keywords: ["traffic crash", "accident no injury", "fender bender", "collision no injury"] },
  { code: "46", label: "Hit and Run", category: "Traffic", priority: "high", keywords: ["hit and run", "vehicle fled crash", "left scene"] },
  { code: "47", label: "Reckless / Dangerous Driver", category: "Traffic", priority: "high", keywords: ["reckless driver", "dangerous driver", "erratic driver"] },
  { code: "48", label: "Suspicious Vehicle", category: "Suspicious Activity", priority: "medium", keywords: ["suspicious vehicle", "unknown vehicle", "vehicle circling"] },
  { code: "49", label: "Disabled / Abandoned Vehicle", category: "Traffic", priority: "low", keywords: ["disabled vehicle", "abandoned vehicle", "broken down car"] },
  { code: "50", label: "Parking Complaint / Tow Request", category: "Traffic", priority: "low", keywords: ["parking complaint", "tow request", "illegal parking", "blocked driveway"] },

  // Fire / medical / environmental
  { code: "51", label: "Medical Emergency", category: "Fire / Medical", priority: "high", keywords: ["medical emergency", "medical", "sick person", "injured person"] },
  { code: "52", label: "Fall / Injury", category: "Fire / Medical", priority: "high", keywords: ["fall", "injury", "fell", "injured"] },
  { code: "53", label: "Breathing Difficulty", category: "Fire / Medical", priority: "critical", keywords: ["breathing difficulty", "trouble breathing", "shortness of breath"] },
  { code: "54", label: "Seizure", category: "Fire / Medical", priority: "critical", keywords: ["seizure", "convulsions", "seizing"] },
  { code: "55", label: "Smoke / Odor Investigation", category: "Fire / Medical", priority: "high", keywords: ["smoke", "odor of smoke", "burning smell", "smoke investigation"] },
  { code: "56", label: "Gas Leak / Hazardous Odor", category: "Fire / Medical", priority: "critical", keywords: ["gas leak", "natural gas", "hazardous odor", "chemical smell"] },

  // Security / officer initiated / service
  { code: "57", label: "Officer-Initiated Activity", category: "Officer Activity", priority: "low", keywords: ["officer initiated", "self initiated", "on view"] },
  { code: "58", label: "Citizen / Resident Assist", category: "Service", priority: "low", keywords: ["citizen assist", "resident assist", "assist person", "customer assist"] },
  { code: "59", label: "Lockout / Access Assistance", category: "Service", priority: "low", keywords: ["lockout", "locked out", "access assistance", "key issue"] },
  { code: "60", label: "Other / Information", category: "Service", priority: "low", keywords: ["other", "information", "information only", "miscellaneous"] },
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

// External incident type mappings (police dispatch terminology)
const EXTERNAL_INCIDENT_MAPPINGS = {
  "traffic stop": "15",
  "welfare check": "13",
  "check the welfare": "13",
  "officer initiated": "13",
  "activesubject stop": "13",
  "suspicious vehicle": "13",
  "person with gun": "05",
  "shots heard": "05",
  "disorderly conduct": "11",
  "loud party": "11",
  "trespassing": "13",
  "prowler": "13",
  "shoplifting": "12",
  "alarm": "12",
  "vandalism": "12",
  "hit and run": "15",
  "traffic accident": "15",
  "motor vehicle accident": "15",
  "mva": "15",
  "medical emergency": "04",
  "unconscious": "10",
  "welfare": "13",
  "animal complaint": "13",
  "noise complaint": "13",
};

// Normalize external incident data to CAD code (Option 2 - Pre-processing)
export function normalizeExternalIncident(externalIncidentText) {
  if (!externalIncidentText) return null;
  const normalized = normalize(externalIncidentText);
  for (const [pattern, cadCode] of Object.entries(EXTERNAL_INCIDENT_MAPPINGS)) {
    if (normalized.includes(normalize(pattern))) {
      return cadCode;
    }
  }
  return null;
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

// Main CAD call classification function with fallback normalization
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

  // Fallback: Try external incident mapping (Option 2)
  const normalizedCode = normalizeExternalIncident(inputText);
  if (normalizedCode) {
    const fallbackMatch = CALL_TYPES.find((t) => t.code === normalizedCode);
    if (fallbackMatch) {
      return {
        matched_code: fallbackMatch.code,
        matched_label: fallbackMatch.label,
        confidence: 0.65,
        matched_type: fallbackMatch,
      };
    }
  }

  // No match found
  return {
    matched_code: null,
    matched_label: null,
    confidence: 0,
    matched_type: null,
  };
}