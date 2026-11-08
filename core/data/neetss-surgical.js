// NEET SS Surgical topic areas with past-exam frequency weights (1-10).
// Calibrated 2026-11-08 by scripts/calibrate-yield.js from core/data/yield-evidence.json:
// 2022–2024 surgical-group recall papers (DocTutorials) plus published 2025 paper analyses and
// high-yield topic lists. Each area records its evidence, confidence and the earlier estimate.
// An area with "priority" wins whenever one of its keywords matches (used for textbook-update videos).
// A keyword starting with "~" is a broad word that only counts a little.
export default {
 "exam": "NEET SS — Surgical group",
 "note": "Frequency weights (1–10) are editorial estimates of how often an area appears in past NEET SS Surgical papers. Override them in the app with your own past-paper analysis.",
 "areas": [
  {
   "area": "Gallstones, cholecystitis & cholangitis",
   "subject": "Hepatobiliary",
   "weight": 9,
   "keywords": [
    "gallstone",
    "cholelithiasis",
    "cholecystitis",
    "choledocholithiasis",
    "cholangitis",
    "cholecystectomy",
    "gall bladder",
    "gallbladder",
    "biliary colic",
    "mirizzi",
    "ercp",
    "cbd stone",
    "ascaris",
    "roundworm",
    "round worm",
    "biliary parasit",
    "hydatid of bile"
   ],
   "prior_weight": 9,
   "confidence": "high",
   "evidence": "2022–24 recalls: 12 / 4 / 8 questions (≈8.4 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026"
   ]
  },
  {
   "area": "Gallbladder cancer & cholangiocarcinoma",
   "subject": "Hepatobiliary",
   "weight": 6,
   "keywords": [
    "carcinoma gallbladder",
    "gallbladder cancer",
    "gall bladder cancer",
    "cholangiocarcinoma",
    "klatskin",
    "hilar",
    "perihilar",
    "bile duct cancer"
   ],
   "prior_weight": 8,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 3 / 0 / 1 questions (≈1.4 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "mcqsurgery"
   ]
  },
  {
   "area": "Bile duct injury & benign strictures",
   "subject": "Hepatobiliary",
   "weight": 6,
   "keywords": [
    "bile duct injury",
    "bdi",
    "biliary stricture",
    "strasberg",
    "bismuth",
    "hepaticojejunostomy",
    "critical view",
    "bile leak",
    "biliary leak",
    "tube cholangiogra"
   ],
   "prior_weight": 7,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 1 / 1 questions (≈1 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Choledochal cyst",
   "subject": "Hepatobiliary",
   "weight": 6,
   "keywords": [
    "choledochal",
    "todani",
    "caroli"
   ],
   "prior_weight": 7,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 2 / 1 / 1 questions (≈1.4 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Liver tumours",
   "subject": "Hepatobiliary",
   "weight": 7,
   "keywords": [
    "hepatocellular",
    "hcc",
    "liver tumour",
    "liver tumor",
    "hepatic adenoma",
    "fnh",
    "focal nodular",
    "hemangioma",
    "haemangioma",
    "liver metastas",
    "hepatectomy",
    "liver resection",
    "bclc",
    "~liver",
    "~hepatic"
   ],
   "prior_weight": 8,
   "confidence": "high",
   "evidence": "2022–24 recalls: 8 / 2 / 1 questions (≈3.8 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Liver abscess & hydatid disease",
   "subject": "Hepatobiliary",
   "weight": 5,
   "keywords": [
    "liver abscess",
    "amoebic",
    "pyogenic",
    "hydatid",
    "echinococc"
   ],
   "prior_weight": 7,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper) · named high-yield by 2 sources",
   "sources": [
    "conceptual-2026",
    "diginerve-topics"
   ]
  },
  {
   "area": "Portal hypertension & varices",
   "subject": "Hepatobiliary",
   "weight": 6,
   "keywords": [
    "portal hypertension",
    "varices",
    "variceal",
    "tips",
    "shunt",
    "budd chiari",
    "budd-chiari",
    "child pugh",
    "meld",
    "esophageal varices",
    "oesophageal varices",
    "gastric varic",
    "variceal bleed",
    "segmental portal",
    "sinistral"
   ],
   "prior_weight": 8,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 3 / 1 / 1 questions (≈1.7 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026"
   ]
  },
  {
   "area": "Liver anatomy & physiology",
   "subject": "Hepatobiliary",
   "weight": 5,
   "keywords": [
    "liver anatomy",
    "couinaud",
    "hepatic segment",
    "liver physiology",
    "jaundice",
    "obstructive jaundice"
   ],
   "prior_weight": 6,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 1 / 0 questions (≈0.7 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Acute pancreatitis",
   "subject": "Pancreas",
   "weight": 6,
   "keywords": [
    "acute pancreatitis",
    "necrotizing pancreatitis",
    "necrotising",
    "walled off",
    "pseudocyst",
    "ranson",
    "atlanta",
    "bisap",
    "necrosectomy"
   ],
   "prior_weight": 9,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 2 / 1 / 0 questions (≈1 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Chronic pancreatitis",
   "subject": "Pancreas",
   "weight": 6,
   "keywords": [
    "chronic pancreatitis",
    "frey",
    "puestow",
    "beger",
    "benign pancrea",
    "exocrine",
    "lundh",
    "pancreatic function"
   ],
   "prior_weight": 7,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 1 / 2 questions (≈1.4 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Pancreatic & periampullary cancer",
   "subject": "Pancreas",
   "weight": 8,
   "keywords": [
    "pancreatic cancer",
    "carcinoma pancreas",
    "ca pancreas",
    "periampullary",
    "whipple",
    "pancreaticoduodenectomy",
    "ampulla",
    "pancreatic adenocarcinoma",
    "malignant pancrea",
    "pancreatic tumour",
    "pancreatic tumor",
    "pancreatic carcinoma",
    "pancreatic head",
    "resectab",
    "borderline resectable",
    "neoadjuvant"
   ],
   "prior_weight": 9,
   "confidence": "high",
   "evidence": "2022–24 recalls: 6 / 0 / 0 questions (≈2.1 per paper) · named high-yield by 2 sources",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026",
    "diginerve-topics"
   ]
  },
  {
   "area": "Pancreatic cystic & neuroendocrine tumours",
   "subject": "Pancreas",
   "weight": 5,
   "keywords": [
    "ipmn",
    "mucinous cystic",
    "serous cystadenoma",
    "pancreatic cyst",
    "insulinoma",
    "gastrinoma",
    "zollinger",
    "glucagonoma",
    "pnet",
    "solid pseudopapillary"
   ],
   "prior_weight": 7,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 1 questions (≈0.3 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Achalasia & oesophageal motility",
   "subject": "Upper GI",
   "weight": 5,
   "keywords": [
    "achalasia",
    "heller",
    "poem",
    "motility",
    "diffuse esophageal spasm",
    "manometry",
    "nutcracker"
   ],
   "prior_weight": 8,
   "confidence": "low",
   "evidence": "2022–24 recalls: 1 / 0 / 0 questions (≈0.3 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "GERD, hiatus hernia & Barrett",
   "subject": "Upper GI",
   "weight": 6,
   "keywords": [
    "gerd",
    "reflux",
    "hiatus hernia",
    "hiatal hernia",
    "barrett",
    "fundoplication",
    "nissen",
    "heartburn",
    "regurgitation",
    "ph monitoring",
    "esophagitis",
    "oesophagitis"
   ],
   "prior_weight": 7,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 2 / 0 questions (≈0.7 per paper) · named high-yield by 2 sources",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026",
    "diginerve-topics"
   ]
  },
  {
   "area": "Oesophageal cancer",
   "subject": "Upper GI",
   "weight": 6,
   "keywords": [
    "esophageal cancer",
    "oesophageal cancer",
    "carcinoma esophagus",
    "ca esophagus",
    "esophagectomy",
    "oesophagectomy",
    "ivor lewis",
    "mckeown",
    "esophagus",
    "oesophagus",
    "esophageal",
    "oesophageal"
   ],
   "prior_weight": 8,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 3 / 1 / 0 questions (≈1.4 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Oesophageal perforation & corrosive injury",
   "subject": "Upper GI",
   "weight": 4,
   "keywords": [
    "boerhaave",
    "perforation esophagus",
    "esophageal perforation",
    "corrosive",
    "caustic",
    "zenker",
    "diverticul esoph"
   ],
   "prior_weight": 6,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper)",
   "sources": []
  },
  {
   "area": "Peptic ulcer disease & complications",
   "subject": "Upper GI",
   "weight": 5,
   "keywords": [
    "peptic ulcer",
    "duodenal ulcer",
    "gastric ulcer",
    "perforated ulcer",
    "vagotomy",
    "gastric outlet"
   ],
   "prior_weight": 7,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 1 / 0 questions (≈0.7 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Gastric cancer",
   "subject": "Upper GI",
   "weight": 6,
   "keywords": [
    "gastric cancer",
    "carcinoma stomach",
    "ca stomach",
    "gastrectomy",
    "d2 lymph",
    "linitis",
    "~stomach"
   ],
   "prior_weight": 8,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 1 / 0 questions (≈0.7 per paper) · named high-yield by 2 sources",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026",
    "mcqsurgery"
   ]
  },
  {
   "area": "GIST & gastric lymphoma",
   "subject": "Upper GI",
   "weight": 5,
   "keywords": [
    "gist",
    "gastrointestinal stromal",
    "imatinib",
    "malt",
    "gastric lymphoma"
   ],
   "prior_weight": 7,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 1 / 0 questions (≈0.7 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Bariatric & metabolic surgery",
   "subject": "Upper GI",
   "weight": 5,
   "keywords": [
    "bariatric",
    "obesity",
    "sleeve",
    "gastric bypass",
    "roux en y",
    "metabolic surgery"
   ],
   "prior_weight": 7,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 1 / 0 questions (≈0.7 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Upper GI bleeding",
   "subject": "Upper GI",
   "weight": 5,
   "keywords": [
    "upper gi bleed",
    "hematemesis",
    "haematemesis",
    "forrest",
    "mallory weiss",
    "dieulafoy",
    "upper gi",
    "gi hemorrhage",
    "gi haemorrhage"
   ],
   "prior_weight": 6,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 2 / 0 / 0 questions (≈0.7 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Intestinal obstruction & volvulus",
   "subject": "Small bowel & Colorectal",
   "weight": 6,
   "keywords": [
    "intestinal obstruction",
    "bowel obstruction",
    "volvulus",
    "sigmoid volvulus",
    "adhesive",
    "pseudo obstruction",
    "ogilvie",
    "~bowel",
    "wilkie",
    "superior mesenteric artery syndrome",
    "sma syndrome"
   ],
   "prior_weight": 7,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 3 / 0 questions (≈1.4 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Crohn disease",
   "subject": "Small bowel & Colorectal",
   "weight": 5,
   "keywords": [
    "crohn",
    "strictureplasty"
   ],
   "prior_weight": 6,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 1 / 0 questions (≈0.7 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Ulcerative colitis",
   "subject": "Small bowel & Colorectal",
   "weight": 6,
   "keywords": [
    "ulcerative colitis",
    "ipaa",
    "ileal pouch",
    "toxic megacolon",
    "proctocolectomy"
   ],
   "prior_weight": 7,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 3 / 0 questions (≈1.4 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Colorectal cancer",
   "subject": "Small bowel & Colorectal",
   "weight": 7,
   "keywords": [
    "colorectal",
    "colon cancer",
    "rectal cancer",
    "carcinoma colon",
    "carcinoma rectum",
    "ca rectum",
    "ca colon",
    "tme",
    "total mesorectal",
    "anterior resection",
    "apr",
    "abdominoperineal",
    "hemicolectomy"
   ],
   "prior_weight": 9,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 2 / 3 / 0 questions (≈1.7 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Polyps & polyposis syndromes",
   "subject": "Small bowel & Colorectal",
   "weight": 6,
   "keywords": [
    "polyp",
    "polyposis",
    "fap",
    "lynch",
    "hnpcc",
    "peutz",
    "gardner"
   ],
   "prior_weight": 8,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 2 / 1 / 0 questions (≈1 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Diverticular disease",
   "subject": "Small bowel & Colorectal",
   "weight": 4,
   "keywords": [
    "diverticul",
    "hinchey"
   ],
   "prior_weight": 6,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper)",
   "sources": []
  },
  {
   "area": "Appendix",
   "subject": "Small bowel & Colorectal",
   "weight": 4,
   "keywords": [
    "appendicitis",
    "appendix",
    "appendicectomy",
    "appendectomy",
    "mucocele",
    "alvarado"
   ],
   "prior_weight": 6,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper)",
   "sources": []
  },
  {
   "area": "Haemorrhoids, fissure & fistula-in-ano",
   "subject": "Small bowel & Colorectal",
   "weight": 4,
   "keywords": [
    "hemorrhoid",
    "haemorrhoid",
    "piles",
    "fissure",
    "fistula in ano",
    "fistula-in-ano",
    "anal fistula",
    "perianal abscess",
    "goodsall",
    "seton",
    "rectum",
    "anal canal",
    "anorectal"
   ],
   "prior_weight": 7,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper)",
   "sources": []
  },
  {
   "area": "Rectal prolapse, pilonidal & anal cancer",
   "subject": "Small bowel & Colorectal",
   "weight": 5,
   "keywords": [
    "rectal prolapse",
    "pilonidal",
    "anal cancer",
    "delorme",
    "altemeier"
   ],
   "prior_weight": 5,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 0 / 2 questions (≈1 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "mcqsurgery"
   ]
  },
  {
   "area": "Mesenteric ischaemia",
   "subject": "Small bowel & Colorectal",
   "weight": 5,
   "keywords": [
    "mesenteric ischemia",
    "mesenteric ischaemia",
    "ischemic colitis",
    "smv thrombosis",
    "acute mesenteric",
    "mesenteric vascular"
   ],
   "prior_weight": 6,
   "confidence": "low",
   "evidence": "2022–24 recalls: 1 / 0 / 0 questions (≈0.3 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Lower GI bleeding",
   "subject": "Small bowel & Colorectal",
   "weight": 3,
   "keywords": [
    "lower gi bleed",
    "hematochezia",
    "angiodysplasia",
    "meckel"
   ],
   "prior_weight": 5,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper)",
   "sources": []
  },
  {
   "area": "Stomas & intestinal fistula",
   "subject": "Small bowel & Colorectal",
   "weight": 4,
   "keywords": [
    "stoma",
    "ileostomy",
    "colostomy",
    "enterocutaneous",
    "intestinal fistula",
    "short bowel",
    "terminal ileum",
    "ileal resection",
    "bile acid malabsorption"
   ],
   "prior_weight": 5,
   "confidence": "low",
   "evidence": "2022–24 recalls: 1 / 0 / 0 questions (≈0.3 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Inguinal & femoral hernia",
   "subject": "Abdomen & Hernia",
   "weight": 6,
   "keywords": [
    "inguinal",
    "femoral hernia",
    "hernia",
    "lichtenstein",
    "tep",
    "tapp",
    "hernioplasty",
    "herniorrhaphy",
    "inguinoscrotal",
    "cough impulse",
    "lumbar hernia"
   ],
   "prior_weight": 8,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 2 / 3 / 0 questions (≈1.7 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Ventral, incisional hernia & abdominal wall",
   "subject": "Abdomen & Hernia",
   "weight": 5,
   "keywords": [
    "ventral hernia",
    "incisional",
    "umbilical hernia",
    "abdominal wall",
    "component separation",
    "spigelian",
    "rectus sheath"
   ],
   "prior_weight": 6,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 1 / 0 questions (≈0.3 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Spleen",
   "subject": "Abdomen & Hernia",
   "weight": 5,
   "keywords": [
    "spleen",
    "splenic",
    "splenectomy",
    "opsi",
    "hypersplenism"
   ],
   "prior_weight": 6,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 1 / 1 questions (≈1 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Peritoneum, retroperitoneum & acute abdomen",
   "subject": "Abdomen & Hernia",
   "weight": 5,
   "keywords": [
    "peritonitis",
    "peritoneum",
    "retroperitone",
    "acute abdomen",
    "pseudomyxoma",
    "hipec",
    "intra-abdominal abscess",
    "abdominal lump",
    "abdominal mass",
    "abdominal emergenc"
   ],
   "prior_weight": 6,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 2 / 0 questions (≈0.7 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "collegedunia-2025"
   ]
  },
  {
   "area": "Breast cancer — management",
   "subject": "Breast",
   "weight": 10,
   "keywords": [
    "breast cancer",
    "carcinoma breast",
    "ca breast",
    "mastectomy",
    "breast conserving",
    "bcs",
    "sentinel",
    "axillary",
    "her2",
    "triple negative",
    "dcis",
    "lcis",
    "inflammatory breast",
    "~breast"
   ],
   "prior_weight": 10,
   "confidence": "high",
   "evidence": "2022–24 recalls: 7 / 5 / 15 questions (≈9.4 per paper) · named high-yield by 3 sources",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026",
    "diginerve-topics",
    "collegedunia-2025"
   ]
  },
  {
   "area": "Breast imaging, screening & genetics",
   "subject": "Breast",
   "weight": 4,
   "keywords": [
    "birads",
    "bi-rads",
    "mammogra",
    "brca",
    "breast screening",
    "breast imaging"
   ],
   "prior_weight": 8,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper)",
   "sources": []
  },
  {
   "area": "Benign breast disease",
   "subject": "Breast",
   "weight": 6,
   "keywords": [
    "fibroadenoma",
    "phyllodes",
    "mastitis",
    "breast abscess",
    "nipple discharge",
    "mastalgia",
    "fibrocystic",
    "duct papilloma",
    "benign breast",
    "breast cyst",
    "simple cyst",
    "breast abscess",
    "lactational"
   ],
   "prior_weight": 6,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 0 / 5 questions (≈1.7 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Male breast & gynaecomastia",
   "subject": "Breast",
   "weight": 2,
   "keywords": [
    "gynecomastia",
    "gynaecomastia",
    "male breast"
   ],
   "prior_weight": 3,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper)",
   "sources": []
  },
  {
   "area": "Thyroid nodule & thyroid cancer",
   "subject": "Endocrine",
   "weight": 10,
   "keywords": [
    "thyroid cancer",
    "carcinoma thyroid",
    "papillary",
    "follicular",
    "medullary",
    "anaplastic",
    "thyroid nodule",
    "bethesda",
    "thyroidectomy",
    "tirads",
    "~thyroid",
    "endocrine surgery"
   ],
   "prior_weight": 9,
   "confidence": "high",
   "evidence": "2022–24 recalls: 7 / 7 / 7 questions (≈7.3 per paper) · named high-yield by 2 sources",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026",
    "diginerve-topics"
   ]
  },
  {
   "area": "Goitre & hyperthyroidism",
   "subject": "Endocrine",
   "weight": 6,
   "keywords": [
    "goitre",
    "goiter",
    "thyrotoxicosis",
    "graves",
    "hyperthyroid",
    "thyroid physiology",
    "retrosternal",
    "dalrymple",
    "exophthalmos",
    "thyroid eye",
    "von graefe"
   ],
   "prior_weight": 7,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 3 / 1 questions (≈1.4 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Parathyroid & hyperparathyroidism",
   "subject": "Endocrine",
   "weight": 6,
   "keywords": [
    "parathyroid",
    "hyperparathyroid",
    "pth",
    "hypercalcemia",
    "hypercalcaemia",
    "sestamibi"
   ],
   "prior_weight": 8,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 3 / 0 questions (≈1 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026"
   ]
  },
  {
   "area": "Adrenal surgery",
   "subject": "Endocrine",
   "weight": 7,
   "keywords": [
    "adrenal",
    "pheochromocytoma",
    "phaeochromocytoma",
    "conn",
    "cushing",
    "incidentaloma",
    "adrenalectomy",
    "aldosteron"
   ],
   "prior_weight": 8,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 2 / 0 / 3 questions (≈1.7 per paper) · named high-yield by 2 sources",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026",
    "diginerve-topics"
   ]
  },
  {
   "area": "MEN syndromes & neuroendocrine tumours",
   "subject": "Endocrine",
   "weight": 5,
   "keywords": [
    "men 1",
    "men 2",
    "men1",
    "men2",
    "multiple endocrine",
    "carcinoid",
    "neuroendocrine",
    "net ",
    "men 2b",
    "men2b",
    "men 2a",
    "mucosal neuroma"
   ],
   "prior_weight": 7,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 1 / 0 questions (≈0.3 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Oral cavity cancer",
   "subject": "Head & Neck",
   "weight": 5,
   "keywords": [
    "oral cancer",
    "oral cavity",
    "carcinoma tongue",
    "buccal mucosa",
    "leukoplakia",
    "oral submucous",
    "~oral"
   ],
   "prior_weight": 7,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 1 / 0 questions (≈0.3 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Salivary gland tumours",
   "subject": "Head & Neck",
   "weight": 4,
   "keywords": [
    "salivary",
    "parotid",
    "pleomorphic adenoma",
    "warthin",
    "submandibular",
    "parotidectomy",
    "frey syndrome"
   ],
   "prior_weight": 7,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper) · named high-yield by 1 source",
   "sources": [
    "diginerve-topics"
   ]
  },
  {
   "area": "Neck masses & neck dissection",
   "subject": "Head & Neck",
   "weight": 5,
   "keywords": [
    "neck dissection",
    "neck mass",
    "neck swelling",
    "cervical lymph",
    "branchial",
    "thyroglossal",
    "neck node",
    "head and neck"
   ],
   "prior_weight": 7,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 2 / 0 questions (≈0.7 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Larynx & pharynx cancer",
   "subject": "Head & Neck",
   "weight": 3,
   "keywords": [
    "larynx",
    "laryngeal",
    "pharynx",
    "pharyngeal",
    "hypopharynx",
    "nasopharyn"
   ],
   "prior_weight": 5,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper)",
   "sources": []
  },
  {
   "area": "Cleft lip & palate",
   "subject": "Head & Neck",
   "weight": 5,
   "keywords": [
    "cleft"
   ],
   "prior_weight": 5,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 1 / 1 questions (≈1 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "ATLS — primary survey & airway",
   "subject": "Trauma & Critical Care",
   "weight": 7,
   "keywords": [
    "atls",
    "primary survey",
    "~trauma",
    "polytrauma",
    "~airway",
    "golden hour",
    "triage",
    "disaster",
    "mass casualty",
    "revised trauma score"
   ],
   "prior_weight": 9,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 2 / 1 questions (≈1 per paper) · named high-yield by 3 sources",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026",
    "testbook-2025",
    "collegedunia-2025"
   ]
  },
  {
   "area": "Thoracic trauma",
   "subject": "Trauma & Critical Care",
   "weight": 8,
   "keywords": [
    "chest trauma",
    "thoracic trauma",
    "tension pneumothorax",
    "hemothorax",
    "haemothorax",
    "flail chest",
    "cardiac tamponade",
    "thoracotomy",
    "torso trauma",
    "sucking wound",
    "open pneumothorax",
    "tube thoracostomy",
    "chest injury"
   ],
   "prior_weight": 8,
   "confidence": "high",
   "evidence": "2022–24 recalls: 0 / 5 / 6 questions (≈3.8 per paper) · named high-yield by 2 sources",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026",
    "diginerve-topics"
   ]
  },
  {
   "area": "Abdominal trauma",
   "subject": "Trauma & Critical Care",
   "weight": 6,
   "keywords": [
    "abdominal trauma",
    "blunt abdominal",
    "fast scan",
    "efast",
    "splenic injury",
    "liver injury",
    "dpl",
    "penetrating abdominal",
    "colon trauma",
    "colonic injur",
    "jejunal injury",
    "hepatic and ivc",
    "liver trauma"
   ],
   "prior_weight": 9,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 3 / 0 questions (≈1 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Head injury",
   "subject": "Trauma & Critical Care",
   "weight": 7,
   "keywords": [
    "head injury",
    "traumatic brain",
    "gcs",
    "glasgow",
    "extradural",
    "subdural",
    "intracranial pressure",
    "csf",
    "rhinorr",
    "otorrh",
    "skull fracture",
    "diffuse axonal",
    "edh",
    "sdh",
    "concussion"
   ],
   "prior_weight": 8,
   "confidence": "high",
   "evidence": "2022–24 recalls: 4 / 1 / 1 questions (≈2.1 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Pelvic, vascular & extremity trauma",
   "subject": "Trauma & Critical Care",
   "weight": 5,
   "keywords": [
    "pelvic fracture",
    "vascular injury",
    "extremity trauma",
    "compartment syndrome",
    "crush",
    "traumatic amputation",
    "neck trauma",
    "zone ii",
    "penetrating neck",
    "ivc injur"
   ],
   "prior_weight": 6,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 2 / 1 questions (≈1 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Shock & fluid resuscitation",
   "subject": "Trauma & Critical Care",
   "weight": 5,
   "keywords": [
    "shock",
    "resuscitation",
    "hemorrhagic",
    "haemorrhagic",
    "massive transfusion",
    "hypovolemi"
   ],
   "prior_weight": 8,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 1 / 0 questions (≈0.3 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026"
   ]
  },
  {
   "area": "Burns",
   "subject": "Trauma & Critical Care",
   "weight": 5,
   "keywords": [
    "burn",
    "parkland",
    "rule of nine",
    "inhalation injury",
    "escharotomy",
    "electrical injury"
   ],
   "prior_weight": 8,
   "confidence": "low",
   "evidence": "2022–24 recalls: 1 / 0 / 0 questions (≈0.3 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Damage control & abdominal compartment syndrome",
   "subject": "Trauma & Critical Care",
   "weight": 5,
   "keywords": [
    "damage control",
    "abdominal compartment",
    "intra-abdominal pressure",
    "laparostomy"
   ],
   "prior_weight": 6,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 2 / 0 questions (≈0.7 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026"
   ]
  },
  {
   "area": "Surgical critical care & sepsis",
   "subject": "Trauma & Critical Care",
   "weight": 5,
   "keywords": [
    "sepsis",
    "septic",
    "icu",
    "ventilat",
    "ards",
    "critical care",
    "mods",
    "sirs"
   ],
   "prior_weight": 6,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 1 / 1 questions (≈1 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Wound healing & surgical site infection",
   "subject": "Basic & Perioperative",
   "weight": 4,
   "keywords": [
    "wound healing",
    "wound",
    "ssi",
    "surgical site infection",
    "scar"
   ],
   "prior_weight": 7,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper)",
   "sources": []
  },
  {
   "area": "Surgical nutrition",
   "subject": "Basic & Perioperative",
   "weight": 4,
   "keywords": [
    "nutrition",
    "enteral",
    "parenteral",
    "tpn",
    "refeeding",
    "malnutrition"
   ],
   "prior_weight": 7,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper) · named high-yield by 1 source",
   "sources": [
    "conceptual-2026"
   ]
  },
  {
   "area": "Fluids, electrolytes & acid–base",
   "subject": "Basic & Perioperative",
   "weight": 6,
   "keywords": [
    "fluid",
    "electrolyte",
    "acid base",
    "acid-base",
    "hyponatremia",
    "hyperkalemia",
    "potassium",
    "sodium"
   ],
   "prior_weight": 7,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 2 / 0 / 1 questions (≈1 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Blood transfusion & haemostasis",
   "subject": "Basic & Perioperative",
   "weight": 5,
   "keywords": [
    "transfusion",
    "blood product",
    "coagulation",
    "haemostasis",
    "hemostasis",
    "dic",
    "anticoagul",
    "bleeding disorder"
   ],
   "prior_weight": 7,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 1 questions (≈0.3 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Anaesthesia & pain basics",
   "subject": "Basic & Perioperative",
   "weight": 5,
   "keywords": [
    "anesthesia",
    "anaesthesia",
    "local anaesthetic",
    "local anesthetic",
    "pain",
    "analgesi"
   ],
   "prior_weight": 5,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 3 / 0 questions (≈1 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Sutures, staplers & energy devices",
   "subject": "Basic & Perioperative",
   "weight": 5,
   "keywords": [
    "suture",
    "stapler",
    "diathermy",
    "electrosurgery",
    "harmonic",
    "energy device",
    "knot"
   ],
   "prior_weight": 6,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 1 questions (≈0.3 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Minimal access & robotic surgery",
   "subject": "Basic & Perioperative",
   "weight": 5,
   "keywords": [
    "laparoscop",
    "minimal access",
    "pneumoperitoneum",
    "robotic",
    "mis ",
    "minimally invasive"
   ],
   "prior_weight": 6,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 0 / 2 questions (≈1 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Preoperative assessment & risk",
   "subject": "Basic & Perioperative",
   "weight": 5,
   "keywords": [
    "preoperative",
    "pre-operative",
    "asa grade",
    "risk assessment",
    "perioperative",
    "dvt prophylaxis",
    "surgical safety"
   ],
   "prior_weight": 5,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 1 / 1 questions (≈0.7 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Surgical infections",
   "subject": "Basic & Perioperative",
   "weight": 4,
   "keywords": [
    "necrotizing fasciitis",
    "necrotising fasciitis",
    "gas gangrene",
    "tetanus",
    "fournier",
    "cellulitis",
    "surgical infection",
    "antibiotic prophylaxis"
   ],
   "prior_weight": 6,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper)",
   "sources": []
  },
  {
   "area": "Surgical oncology principles",
   "subject": "Basic & Perioperative",
   "weight": 7,
   "keywords": [
    "~oncology",
    "tumour marker",
    "tumor marker",
    "tnm",
    "~staging",
    "chemotherapy",
    "radiotherapy",
    "cancer genetics",
    "proto-oncogene",
    "oncogene",
    "tumour suppressor",
    "tumor suppressor",
    "hallmark",
    "liquid biopsy",
    "circulating tumo",
    "carcinogenesis",
    "cancer biology",
    "malignant transformation",
    "chemoprevention",
    "targeted therapy",
    "immunotherapy"
   ],
   "prior_weight": 7,
   "confidence": "high",
   "evidence": "2022–24 recalls: 1 / 8 / 0 questions (≈3.1 per paper) · named high-yield by 3 sources",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics",
    "diginerve-pattern",
    "testbook-2025"
   ]
  },
  {
   "area": "Skin tumours & melanoma",
   "subject": "Basic & Perioperative",
   "weight": 4,
   "keywords": [
    "melanoma",
    "basal cell",
    "bcc",
    "squamous cell carcinoma skin",
    "marjolin",
    "skin cancer",
    "skin tumour",
    "skin tumor"
   ],
   "prior_weight": 7,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper) · named high-yield by 1 source",
   "sources": [
    "diginerve-topics"
   ]
  },
  {
   "area": "Soft tissue sarcoma",
   "subject": "Basic & Perioperative",
   "weight": 4,
   "keywords": [
    "sarcoma",
    "liposarcoma",
    "desmoid",
    "soft tissue tumour"
   ],
   "prior_weight": 6,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper) · named high-yield by 1 source",
   "sources": [
    "diginerve-topics"
   ]
  },
  {
   "area": "Research methodology & biostatistics",
   "subject": "Basic & Perioperative",
   "weight": 5,
   "keywords": [
    "statistics",
    "biostatistics",
    "research",
    "study design",
    "sensitivity",
    "specificity",
    "meta analysis",
    "evidence based",
    "central tendency",
    "correlation",
    "sampling",
    "median",
    "standard deviation",
    "p value",
    "odds ratio",
    "confidence interval",
    "study type"
   ],
   "prior_weight": 5,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 5 / 0 questions (≈1.7 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "duramater"
   ]
  },
  {
   "area": "Peripheral arterial disease & limb ischaemia",
   "subject": "Vascular",
   "weight": 8,
   "keywords": [
    "peripheral arterial",
    "pad",
    "limb ischemia",
    "limb ischaemia",
    "claudication",
    "embolectomy",
    "buerger",
    "critical limb",
    "abi",
    "diabetic foot",
    "gangrene",
    "amputation",
    "~arterial",
    "~vascular",
    "raynaud",
    "renovascular",
    "fontaine",
    "acute limb",
    "embol",
    "stent",
    "endovascular",
    "vegf"
   ],
   "prior_weight": 8,
   "confidence": "high",
   "evidence": "2022–24 recalls: 2 / 2 / 8 questions (≈4.2 per paper) · named high-yield by 2 sources",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026",
    "diginerve-pattern"
   ]
  },
  {
   "area": "Aortic aneurysm & dissection",
   "subject": "Vascular",
   "weight": 8,
   "keywords": [
    "aneurysm",
    "aaa",
    "aortic",
    "dissection",
    "evar"
   ],
   "prior_weight": 8,
   "confidence": "high",
   "evidence": "2022–24 recalls: 4 / 0 / 4 questions (≈2.8 per paper) · named high-yield by 2 sources",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026",
    "diginerve-pattern"
   ]
  },
  {
   "area": "Carotid disease",
   "subject": "Vascular",
   "weight": 5,
   "keywords": [
    "carotid",
    "endarterectomy",
    "tia",
    "carotid body"
   ],
   "prior_weight": 6,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 1 / 0 questions (≈0.3 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Venous disease & DVT",
   "subject": "Vascular",
   "weight": 7,
   "keywords": [
    "varicose",
    "venous",
    "dvt",
    "deep vein",
    "thrombosis",
    "pulmonary embolism",
    "ceap",
    "venous ulcer",
    "trendelenburg",
    "tessari",
    "sclerotherapy",
    "four-layer",
    "4-layer",
    "compression bandage",
    "venous pressure",
    "sfj",
    "cyanoacrylate"
   ],
   "prior_weight": 7,
   "confidence": "high",
   "evidence": "2022–24 recalls: 2 / 1 / 5 questions (≈2.8 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026"
   ]
  },
  {
   "area": "Lymphatics & lymphoedema",
   "subject": "Vascular",
   "weight": 4,
   "keywords": [
    "lymphedema",
    "lymphoedema",
    "lymphatic",
    "filarial",
    "lymphangiogra",
    "lymphoscintigraph"
   ],
   "prior_weight": 4,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 1 / 0 questions (≈0.3 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Vascular access & AV fistula",
   "subject": "Vascular",
   "weight": 3,
   "keywords": [
    "av fistula",
    "arteriovenous fistula",
    "vascular access",
    "dialysis access"
   ],
   "prior_weight": 4,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper)",
   "sources": []
  },
  {
   "area": "Urolithiasis & urinary tract obstruction",
   "subject": "Urology",
   "weight": 5,
   "keywords": [
    "urolithiasis",
    "renal stone",
    "kidney stone",
    "ureteric",
    "calculus",
    "pcnl",
    "ureteroscopy",
    "eswl",
    "~urology",
    "ureterocele",
    "ureter",
    "vesicoureteric",
    "puj",
    "pelviureteric",
    "hydronephrosis",
    "posterior urethral valve"
   ],
   "prior_weight": 7,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 1 / 0 questions (≈0.3 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Renal cell carcinoma & renal masses",
   "subject": "Urology",
   "weight": 6,
   "keywords": [
    "renal cell",
    "rcc",
    "kidney cancer",
    "renal mass",
    "nephrectomy",
    "wilms adult",
    "~kidney",
    "~renal"
   ],
   "prior_weight": 7,
   "confidence": "high",
   "evidence": "2022–24 recalls: 2 / 2 / 2 questions (≈2.1 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Bladder cancer",
   "subject": "Urology",
   "weight": 5,
   "keywords": [
    "bladder cancer",
    "carcinoma bladder",
    "urothelial",
    "turbt",
    "cystectomy",
    "~bladder"
   ],
   "prior_weight": 6,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 1 questions (≈0.3 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Prostate — BPH & cancer",
   "subject": "Urology",
   "weight": 6,
   "keywords": [
    "prostate",
    "bph",
    "turp",
    "psa"
   ],
   "prior_weight": 7,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 2 / 1 / 0 questions (≈1 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Testis & scrotum",
   "subject": "Urology",
   "weight": 7,
   "keywords": [
    "testis",
    "testicular",
    "torsion",
    "hydrocele",
    "varicocele",
    "seminoma",
    "scrotal",
    "orchidectomy",
    "testicular tumo",
    "germ cell",
    "embryonal carcinoma",
    "choriocarcinoma",
    "yolk sac"
   ],
   "prior_weight": 7,
   "confidence": "high",
   "evidence": "2022–24 recalls: 2 / 2 / 4 questions (≈2.8 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Urethra, penis & urological trauma",
   "subject": "Urology",
   "weight": 5,
   "keywords": [
    "urethral injury",
    "bladder injury",
    "renal trauma",
    "urethral stricture",
    "urethra",
    "urethral",
    "penile",
    "penis"
   ],
   "prior_weight": 5,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 2 / 0 / 2 questions (≈1.4 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Kidney transplant",
   "subject": "Urology",
   "weight": 5,
   "keywords": [
    "kidney transplant",
    "renal transplant"
   ],
   "prior_weight": 6,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 1 / 1 questions (≈0.7 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Congenital GI anomalies",
   "subject": "Paediatric Surgery",
   "weight": 8,
   "keywords": [
    "atresia",
    "malrotation",
    "hirschsprung",
    "anorectal malformation",
    "imperforate",
    "meconium",
    "gastroschisis",
    "omphalocele",
    "duodenal atresia",
    "nec",
    "necrotizing enterocolitis",
    "~paediatric surgery",
    "~pediatric surgery",
    "annular pancreas",
    "double bubble",
    "ladd"
   ],
   "prior_weight": 8,
   "confidence": "high",
   "evidence": "2022–24 recalls: 1 / 6 / 1 questions (≈2.8 per paper) · named high-yield by 2 sources",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026",
    "duramater"
   ]
  },
  {
   "area": "Pyloric stenosis & intussusception",
   "subject": "Paediatric Surgery",
   "weight": 6,
   "keywords": [
    "pyloric stenosis",
    "intussusception",
    "pyloromyotomy",
    "ramstedt"
   ],
   "prior_weight": 7,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 0 / 2 questions (≈1 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Paediatric tumours",
   "subject": "Paediatric Surgery",
   "weight": 5,
   "keywords": [
    "wilms",
    "neuroblastoma",
    "hepatoblastoma",
    "pediatric tumour",
    "paediatric tumour",
    "teratoma"
   ],
   "prior_weight": 7,
   "confidence": "low",
   "evidence": "2022–24 recalls: 1 / 0 / 0 questions (≈0.3 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "CDH & tracheo-oesophageal fistula",
   "subject": "Paediatric Surgery",
   "weight": 5,
   "keywords": [
    "diaphragmatic hernia",
    "cdh",
    "tracheoesophageal",
    "tracheo-oesophageal",
    "tef",
    "esophageal atresia"
   ],
   "prior_weight": 7,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 1 questions (≈0.3 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "conceptual-2026"
   ]
  },
  {
   "area": "Undescended testis & hypospadias",
   "subject": "Paediatric Surgery",
   "weight": 5,
   "keywords": [
    "undescended",
    "cryptorchid",
    "hypospadias",
    "phimosis",
    "orchidopexy"
   ],
   "prior_weight": 6,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 1 / 1 questions (≈0.7 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Lung — cancer, abscess & bronchoscopy",
   "subject": "Thoracic & Cardiac",
   "weight": 7,
   "keywords": [
    "lung cancer",
    "bronchogenic",
    "pulmonary nodule",
    "lobectomy",
    "pancoast",
    "thorax",
    "lung abscess",
    "bronchoscop",
    "bronchial",
    "endobronchial",
    "aspergilloma",
    "monod",
    "pneumonectomy",
    "paraneoplastic",
    "hypertrophic pulmonary",
    "small cell",
    "foreign body",
    "bronchiectasis",
    "lung",
    "pulmonary"
   ],
   "prior_weight": 6,
   "confidence": "high",
   "evidence": "2022–24 recalls: 2 / 4 / 9 questions (≈5.2 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Mediastinal masses",
   "subject": "Thoracic & Cardiac",
   "weight": 4,
   "keywords": [
    "mediastin",
    "thymoma",
    "myasthenia gravis"
   ],
   "prior_weight": 6,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 0 questions (≈0 per paper)",
   "sources": []
  },
  {
   "area": "Empyema, pneumothorax & chest drains",
   "subject": "Thoracic & Cardiac",
   "weight": 5,
   "keywords": [
    "empyema",
    "pneumothorax",
    "chest drain",
    "intercostal drain",
    "icd",
    "pleural",
    "vats"
   ],
   "prior_weight": 6,
   "confidence": "low",
   "evidence": "2022–24 recalls: 0 / 0 / 1 questions (≈0.3 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Adult cardiac surgery — valves, CABG & tumours",
   "subject": "Thoracic & Cardiac",
   "weight": 7,
   "keywords": [
    "cabg",
    "coronary",
    "lad",
    "lima",
    "valve",
    "valvular",
    "mitral",
    "aortic stenosis",
    "aortic regurgitation",
    "tricuspid",
    "cardiac surgery",
    "cardiopulmonary bypass",
    "myxoma",
    "endocarditis",
    "myocardial infarction",
    "troponin",
    "pulsus paradoxus",
    "pericard",
    "tamponade",
    "paroxysmal nocturnal",
    "pacemaker",
    "mitraclip",
    "heart failure",
    "cardiothoracic",
    "ctvs",
    "cvts",
    "~cardiac",
    "~heart"
   ],
   "prior_weight": 4,
   "confidence": "high",
   "evidence": "2022–24 recalls: 7 / 4 / 8 questions (≈6.6 per paper) · named high-yield by 1 source",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics"
   ]
  },
  {
   "area": "Brain & spinal tumours",
   "subject": "Neuro, Plastics & Transplant",
   "weight": 6,
   "keywords": [
    "brain tumour",
    "brain tumor",
    "glioma",
    "meningioma",
    "pituitary",
    "spinal tumour",
    "neurosurgery",
    "neurosurgical",
    "astrocytoma",
    "medulloblastoma",
    "ependymoma",
    "craniopharyngioma",
    "schwannoma",
    "gh-secreting",
    "acromegaly",
    "neuro-oncology"
   ],
   "prior_weight": 5,
   "confidence": "high",
   "evidence": "2022–24 recalls: 2 / 3 / 3 questions (≈2.8 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Spine, CVJ, spinal dysraphism & hydrocephalus",
   "subject": "Neuro, Plastics & Transplant",
   "weight": 6,
   "keywords": [
    "spinal injury",
    "spinal cord",
    "hydrocephalus",
    "shunt vp",
    "spina bifida",
    "craniovertebral",
    "basilar invagination",
    "atlanto",
    "chiari",
    "spinal dysraphism",
    "myelomeningocele",
    "tethered",
    "cord syndrome",
    "central cord",
    "brown",
    "spinal",
    "nascis",
    "lumbar canal stenosis",
    "disc prolapse"
   ],
   "prior_weight": 4,
   "confidence": "high",
   "evidence": "2022–24 recalls: 2 / 1 / 6 questions (≈3.1 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Flaps & skin grafts",
   "subject": "Neuro, Plastics & Transplant",
   "weight": 7,
   "keywords": [
    "flap",
    "skin graft",
    "~graft",
    "~reconstruct",
    "~plastic surgery",
    "abbe",
    "limberg",
    "diep",
    "tram",
    "siea",
    "ruben",
    "deltopectoral",
    "free flap",
    "tissue expan",
    "split-thickness",
    "skin grafting",
    "keloid",
    "scalp reconstruction",
    "skull defect",
    "wound coverage",
    "pressure sore"
   ],
   "prior_weight": 6,
   "confidence": "high",
   "evidence": "2022–24 recalls: 5 / 5 / 1 questions (≈3.8 per paper) · named high-yield by 2 sources",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "mcqsurgery",
    "duramater"
   ]
  },
  {
   "area": "Hand, upper limb & peripheral nerve surgery",
   "subject": "Neuro, Plastics & Transplant",
   "weight": 6,
   "keywords": [
    "hand infection",
    "paronychia",
    "tendon",
    "hand injury",
    "felon",
    "dupuytren",
    "hand",
    "finger",
    "flexor tendon",
    "extensor tendon",
    "snuff box",
    "scaphoid",
    "radial nerve",
    "ulnar nerve",
    "median nerve",
    "carpal tunnel",
    "nerve injur",
    "nerve compression",
    "nerve graft",
    "nerve gap",
    "neuropraxia",
    "neurapraxia",
    "axonotmesis",
    "brachial plexus",
    "cleland",
    "grayson",
    "thoracic outlet",
    "upper limb",
    "wrist drop",
    "claw hand"
   ],
   "prior_weight": 5,
   "confidence": "high",
   "evidence": "2022–24 recalls: 4 / 1 / 3 questions (≈2.8 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Transplant immunology & organ donation",
   "subject": "Neuro, Plastics & Transplant",
   "weight": 6,
   "keywords": [
    "~transplant",
    "rejection",
    "immunosuppress",
    "brain death",
    "organ donation",
    "hla"
   ],
   "prior_weight": 6,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 3 / 2 / 0 questions (≈1.7 per paper) · named high-yield by 3 sources",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024",
    "diginerve-topics",
    "diginerve-pattern",
    "duramater"
   ]
  },
  {
   "area": "Textbook updates & important tables",
   "subject": "Updates & Tables",
   "weight": 8,
   "priority": true,
   "keywords": [
    "update",
    "updates",
    "bailey",
    "sabiston",
    "28e",
    "28th edition",
    "important tables",
    "first 5 chapters"
   ],
   "prior_weight": 8,
   "confidence": "low",
   "evidence": "Not an exam topic area: groups recent-edition update and table videos. 2025 analyses report more questions on recent guidelines and updates."
  },
  {
   "area": "Congenital heart disease",
   "subject": "Thoracic & Cardiac",
   "weight": 8,
   "keywords": [
    "congenital heart",
    "tetralogy",
    "tof",
    "tapvc",
    "vsd",
    "asd",
    "pda",
    "patent ductus",
    "coarctation",
    "hypoplastic left heart",
    "ebstein",
    "transposition",
    "rastelli",
    "fontan",
    "glenn",
    "blalock",
    "pa banding",
    "eisenmenger",
    "cyanotic"
   ],
   "prior_weight": 5,
   "confidence": "high",
   "evidence": "2022–24 recalls: 6 / 1 / 6 questions (≈4.5 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Neurosurgery — ICP, neuroanatomy & neurocritical care",
   "subject": "Neuro, Plastics & Transplant",
   "weight": 6,
   "keywords": [
    "cerebral edema",
    "brain edema",
    "vasogenic",
    "cytotoxic edema",
    "intracranial pressure",
    "icp",
    "monro",
    "cerebral blood flow",
    "cerebral perfusion",
    "pupillary",
    "cranial nerve",
    "gaze",
    "brainstem",
    "posterior fossa",
    "sitting position",
    "air embolism",
    "external ventricular drain",
    "neuroanatomy",
    "neurosurgical instrument",
    "subarachnoid",
    "aneurysm clipping",
    "avm"
   ],
   "prior_weight": 5,
   "confidence": "high",
   "evidence": "2022–24 recalls: 3 / 5 / 0 questions (≈2.8 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Vascular anomalies & haemangioma",
   "subject": "Neuro, Plastics & Transplant",
   "weight": 4,
   "keywords": [
    "haemangioma",
    "hemangioma",
    "vascular anomal",
    "vascular malformation",
    "vascular birthmark",
    "phaces",
    "kasabach",
    "port wine",
    "lymphatic malformation",
    "cystic hygroma"
   ],
   "prior_weight": 4,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 2 / 0 / 0 questions (≈0.7 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Congenital limb, chest-wall & craniofacial anomalies",
   "subject": "Neuro, Plastics & Transplant",
   "weight": 5,
   "keywords": [
    "phocomelia",
    "poland",
    "syndactyly",
    "polydactyly",
    "congenital limb",
    "microtia",
    "treacher",
    "craniosynostosis",
    "pectus",
    "nuss",
    "congenital ear"
   ],
   "prior_weight": 4,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 1 / 1 / 2 questions (≈1.4 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  },
  {
   "area": "Maxillofacial trauma & reconstruction",
   "subject": "Neuro, Plastics & Transplant",
   "weight": 4,
   "keywords": [
    "maxillofacial",
    "enophthalmos",
    "orbital",
    "orbit",
    "zygoma",
    "le fort",
    "mandible",
    "mandibular",
    "iliac bone graft",
    "facial fracture",
    "blow-out"
   ],
   "prior_weight": 4,
   "confidence": "medium",
   "evidence": "2022–24 recalls: 0 / 2 / 0 questions (≈0.7 per paper)",
   "sources": [
    "dt-2022",
    "dt-2023",
    "dt-2024"
   ]
  }
 ],
 "version": "2026-11-08",
 "calibrated": {
  "checked": "2026-11-08",
  "method": "Each question in the 2022–2024 recalls was mapped to a topic area with Scalpel’s classifier (429 questions, 4 unplaceable; a random 50 were hand-checked, about 92% correct). Topic-list and analysis sources contribute a small bonus when two or more name an area.",
  "evidenceShare": 0.6,
  "sources": [
   {
    "id": "dt-2022",
    "name": "DocTutorials · NEET SS Surgery 2022 (memory-based recall, reworked)",
    "url": "https://www.doctutorials.com/neet-ss/neet-ss-pyqs",
    "year": 2022,
    "kind": "recall",
    "questions": 146
   },
   {
    "id": "dt-2023",
    "name": "DocTutorials · NEET SS Surgery 2023 (memory-based recall, reworked)",
    "url": "https://www.doctutorials.com/neet-ss/neet-ss-pyqs",
    "year": 2023,
    "kind": "recall",
    "questions": 144
   },
   {
    "id": "dt-2024",
    "name": "DocTutorials · NEET SS Surgery 2024 (memory-based recall, reworked)",
    "url": "https://www.doctutorials.com/neet-ss/neet-ss-pyqs",
    "year": 2024,
    "kind": "recall",
    "questions": 139
   },
   {
    "id": "collegedunia-2025",
    "name": "Collegedunia · NEET SS 2025 paper analysis",
    "url": "https://collegedunia.com/exams/neet-ss/paper-analysis",
    "year": 2025,
    "kind": "analysis"
   },
   {
    "id": "medicaldialogues-2025",
    "name": "Medical Dialogues · NEET SS 2025 exam analysis",
    "url": "https://medicaldialogues.in/news/education/medical-admissions/neet-ss-2025-exam-analysis-question-paper-difficulty-moderate-check-out-expected-cutoff-161683",
    "year": 2025,
    "kind": "analysis"
   },
   {
    "id": "collegedekho-2025",
    "name": "CollegeDekho · NEET SS 2025 paper analysis",
    "url": "https://www.collegedekho.com/exam/neet-ss/paper-analysis",
    "year": 2025,
    "kind": "analysis"
   },
   {
    "id": "testbook-2025",
    "name": "Testbook · NEET SS 2025 subject-wise analysis",
    "url": "https://testbook.com/news/neet-ss-2025-question-paper-subject-wise-analysis/",
    "year": 2025,
    "kind": "analysis"
   },
   {
    "id": "duramater",
    "name": "Duramater · NEET SS Surgical group guide",
    "url": "https://www.duramater.in/neet-ss/surgery",
    "year": 2026,
    "kind": "topic-list"
   },
   {
    "id": "conceptual-2026",
    "name": "Conceptual Surgery · NEET SS 2026 General Surgery high-yield areas",
    "url": "https://theconceptualsurgery.com/2026/07/20/neet-ss-2026-general-surgery-how-to-build-your-rank-while-surviving-residency/",
    "year": 2026,
    "kind": "topic-list"
   },
   {
    "id": "mcqsurgery",
    "name": "MCQ Surgery · NEET SS preparation tips (high-weightage topics)",
    "url": "https://mcqsurgery.com/13-tips-to-prepare-for-neet-ss-25-surgery/",
    "year": 2025,
    "kind": "topic-list"
   },
   {
    "id": "diginerve-topics",
    "name": "DigiNerve · Important topics for NEET SS Surgery 2025",
    "url": "https://www.diginerve.com/blogs/important-topics-for-neet-ss-surgery-in-2025/",
    "year": 2025,
    "kind": "topic-list"
   },
   {
    "id": "diginerve-pattern",
    "name": "DigiNerve · NEET SS Surgery expected pattern",
    "url": "https://www.diginerve.com/blogs/neet-ss-surgery-2025-previous-year-questions-expected-pattern-pdf-download/",
    "year": 2025,
    "kind": "topic-list"
   }
  ]
 }
};
