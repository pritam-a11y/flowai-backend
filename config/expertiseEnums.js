const EXPERTISE_ENUMS = {
  "ABNORMAL_PAP_SMEAR": "Abnormal Pap smear",
  "ACID_REFLUX": "Acid Reflux",
  "ADULT_CONGENITAL_HEART_DISEASE": "Adult Congenital Heart Disease",
  "ANKLE_SURGERY": "Ankle Surgery",
  "AORTIC_ANEURYSMS": "Aortic Aneurysms",
  "AORTIC_DISEASE": "Aortic Disease",
  "ARRHYTHMIAS": "Arrhythmias",
  "ATRIAL_FIBRILLATION": "Atrial Fibrillation",
  "BLADDER": "Bladder",
  "BRAIN_INJURIES": "Brain Injuries",
  "BRAIN_TUMOR": "Brain Tumor",
  "BREAST_CANCER": "Breast Cancer",
  "CARDIOMYOPATHY": "Cardiomyopathy",
  "CELIAC_DISEASE": "Celiac Disease",
  "CERVICAL_CANCER": "Cervical Cancer",
  "CHRONIC_MIGRAINE": "Chronic Migraine",
  "COLON_RECTAL_SURGERY": "Colon & Rectal Surgery",
  "COLON_CANCER": "Colon Cancer",
  "COLONOSCOPY": "Colonoscopy",
  "COMPLEX_SPINE": "Complex Spine",
  "CONCUSSION": "Concussion",
  "CONTRACEPTION": "Contraception",
  "CORONARY_ARTERY_DISEASE": "Coronary Artery Disease",
  "CROHN_S_DISEASE": "Crohn's Disease",
  "DEMENTIA": "Dementia",
  "DIZZINESS": "Dizziness",
  "ENDOSCOPY": "Endoscopy",
  "EPILEPSY": "Epilepsy",
  "ERECTILE_DYSFUNCTION": "Erectile Dysfunction",
  "ESOPHAGEAL_MOTILITY": "Esophageal Motility",
  "ESOPHAGUS_CONDITIONS": "Esophagus Conditions",
  "FAMILY_PLANNING": "Family Planning",
  "FATTY_LIVER_DISEASE": "Fatty Liver Disease",
  "FOOT_SURGERY": "Foot Surgery",
  "FRACTURE_CARE": "Fracture Care",
  "GERD": "GERD",
  "GAIT_BALANCE_DISORDERS": "Gait & Balance Disorders",
  "GENERAL_CARDIOLOGY": "General Cardiology",
  "GENERAL_GASTROENTEROLOGY": "General Gastroenterology",
  "GENERAL_NEUROLOGY": "General Neurology",
  "GENERAL_OBSTETRICS": "General Obstetrics",
  "GENERAL_ONCOLOGY": "General Oncology",
  "GENERAL_UROLOGY": "General Urology",
  "GYNECOLOGIC_MALIGNANCY": "Gynecologic Malignancy",
  "GYNECOLOGY": "Gynecology",
  "HAND_WRIST_SURGERY": "Hand & Wrist Surgery",
  "HAND_WRIST_ELBOW": "Hand/Wrist/Elbow",
  "HEAD_NECK_CANCER": "Head & Neck Cancer",
  "HEADACHE_DISORDERS": "Headache Disorders",
  "HEART_FAILURE": "Heart Failure",
  "HEMATOLOGY": "Hematology",
  "HEPATOBILIARY_DISEASES": "Hepatobiliary Diseases",
  "HIGH_RISK_PREGNANCY": "High Risk Pregnancy",
  "HIP_ARTHROSCOPY": "Hip Arthroscopy",
  "HIP_SURGERY": "Hip Surgery",
  "HYPERLIPIDEMIA": "Hyperlipidemia",
  "HYPERTENSION": "Hypertension",
  "INTERVENTIONAL_CARDIOLOGY": "Interventional Cardiology",
  "KNEE_ARTHROSCOPY": "Knee Arthroscopy",
  "LIVER_DISEASES": "Liver Diseases",
  "LYMPHOMA": "Lymphoma",
  "MALE_INFERTILITY": "Male Infertility",
  "MATERNAL_FETAL_MEDICINE_MFM": "Maternal–Fetal Medicine (MFM)",
  "MELANOMA": "Melanoma",
  "MENOPAUSE": "Menopause",
  "MULTIPLE_SCLEROSIS": "Multiple Sclerosis",
  "NAFLD": "NAFLD",
  "NEUROBLASTOMA": "Neuroblastoma",
  "NEUROPATHIES": "Neuropathies",
  "NEUROPATHY": "Neuropathy",
  "OBSTRUCTIVE_SLEEP_APNEA": "Obstructive Sleep Apnea",
  "OSTEOARTHRITIS": "Osteoarthritis",
  "OTONEUROLOGY": "Otoneurology",
  "OVARIAN_CANCER": "Ovarian Cancer",
  "PANCREAS": "Pancreas",
  "PANCREATIC_CANCER": "Pancreatic Cancer",
  "PANCREATOBILIARY_DISEASE": "Pancreatobiliary disease",
  "PARKINSON_S_DISEASE": "Parkinson's Disease",
  "PEDIATRIC_UROLOGY": "Pediatric Urology",
  "PERIMENOPAUSE": "Perimenopause",
  "PERIPHERAL_ARTERIAL_DISEASE": "Peripheral Arterial Disease",
  "PERIPHERAL_VASCULAR_DISEASE": "Peripheral Vascular Disease",
  "PITUITARY_TUMORS": "Pituitary Tumors",
  "PROLAPSE": "Prolapse",
  "PROSTATE_CANCER": "Prostate Cancer",
  "PULMONARY_EMBOLISM": "Pulmonary Embolism",
  "SARCOMAS": "Sarcomas",
  "SCOLIOSIS": "Scoliosis",
  "SEIZURES": "Seizures",
  "SHOULDER_ARTHROSCOPY": "Shoulder Arthroscopy",
  "SLEEP_DISORDERS": "Sleep Disorders",
  "SPINAL_DEFORMITIES": "Spinal Deformities",
  "SPINE_SURGERY": "Spine Surgery",
  "SPORTS_MEDICINE": "Sports Medicine",
  "STONES": "Stones",
  "STROKE": "Stroke",
  "SWALLOWING_DISORDERS": "Swallowing Disorders",
  "SYNCOPE_FAINTING": "Syncope (Fainting)",
  "TESTICULAR_CANCER": "Testicular Cancer",
  "TRIGEMINAL_NEURALGIA": "Trigeminal Neuralgia",
  "ULCERATIVE_COLITIS": "Ulcerative Colitis",
  "URETHRAL_STRICTURE": "Urethral Stricture",
  "URINARY_INCONTINENCE": "Urinary Incontinence",
  "UROLOGIC_ONCOLOGY": "Urologic Oncology",
  "UTERINE_CANCER": "Uterine Cancer",
  "UTERINE_FIBROIDS": "Uterine Fibroids",
  "VAGINAL_CANCER": "Vaginal Cancer",
  "VALVE_DISEASE": "Valve Disease",
  "VASCULAR_SURGERY": "Vascular Surgery"
};

// Reverse mapping for easier lookup (enum key -> display name)
const EXPERTISE_DISPLAY_NAMES = {};
Object.keys(EXPERTISE_ENUMS).forEach(key => {
  EXPERTISE_DISPLAY_NAMES[key] = EXPERTISE_ENUMS[key];
});

// Helper function to convert enum key to display name
function getExpertiseDisplayName(enumKey) {
  return EXPERTISE_DISPLAY_NAMES[enumKey] || enumKey.replace(/_/g, ' ');
}

// Helper function to get all enum keys
function getAllExpertiseEnums() {
  return Object.keys(EXPERTISE_ENUMS);
}

// Helper function to get all display names
function getAllExpertiseDisplayNames() {
  return Object.values(EXPERTISE_ENUMS);
}

module.exports = {
  EXPERTISE_ENUMS,
  EXPERTISE_DISPLAY_NAMES,
  getExpertiseDisplayName,
  getAllExpertiseEnums,
  getAllExpertiseDisplayNames
};
