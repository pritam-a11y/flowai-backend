const EXPERTISE_ENUMS = {
  "GENERAL_CARDIOLOGY": "General Cardiology",
  "PREVENTIVE_CARDIOLOGY": "Preventive Cardiology",
  "CORONARY_ARTERY_DISEASE": "Coronary Artery Disease",
  "HEART_FAILURE": "Heart Failure",
  "CARDIOMYOPATHY": "Cardiomyopathy",
  "HEART_TRANSPLANT": "Heart Transplant",
  "VENTRICULAR_ASSIST_DEVICES": "Ventricular Assist Devices",
  "ARRHYTHMIAS": "Arrhythmias",
  "ATRIAL_FIBRILLATION": "Atrial Fibrillation",
  "CARDIAC_ELECTROPHYSIOLOGY": "Cardiac Electrophysiology",
  "VENTRICULAR_TACHYCARDIA": "Ventricular Tachycardia",
  "SYNCOPE": "Syncope (Fainting)",
  "VALVE_DISEASE": "Valve Disease",
  "CARDIAC_CATHETERIZATION": "Cardiac Catheterization",
  "INTERVENTIONAL_CARDIOLOGY": "Interventional Cardiology",
  "HYPERTENSION": "Hypertension",
  "HYPERLIPIDEMIA": "Hyperlipidemia",
  "ECHOCARDIOGRAPHY": "Echocardiography",
  "ADULT_CONGENITAL_HEART_DISEASE": "Adult Congenital Heart Disease",
  "MINIMALLY_INVASIVE_HEART_SURGERY": "Minimally Invasive Heart Surgery",
  "PERIPHERAL_VASCULAR_DISEASE": "Peripheral Vascular Disease",
  "AORTIC_ANEURYSMS": "Aortic Aneurysms",
  "AORTIC_DISEASE": "Aortic Disease",
  "PULMONARY_EMBOLISM": "Pulmonary Embolism",
  "GENERAL_GASTROENTEROLOGY": "General Gastroenterology",
  "OBESITY": "Obesity",
  "ENDOSCOPY": "Endoscopy",
  "COLONOSCOPY": "Colonoscopy",
  "GERD_ACID_REFLUX": "GERD, Acid Reflux",
  "CROHNS_DISEASE": "Crohn's Disease",
  "ULCERATIVE_COLITIS": "Ulcerative Colitis",
  "INFLAMMATORY_BOWEL_DISEASE": "Inflammatory Bowel Disease",
  "CELIAC_DISEASE": "Celiac Disease",
  "ESOPHAGEAL_MOTILITY_SWALLOWING_DISORDERS": "Esophageal Motility, Swallowing Disorders, Esophagus Conditions",
  "LIVER_DISEASES": "Liver Diseases",
  "FATTY_LIVER_DISEASE_NAFLD": "Fatty Liver Disease, NAFLD",
  "HEPATOBILIARY_DISEASES": "Hepatobiliary Diseases",
  "PANCREAS_PANCREATOBILIARY_DISEASE": "Pancreas, Pancreatobiliary disease",
  "COLON_RECTAL_SURGERY": "Colon & Rectal Surgery",
  "GENERAL_NEUROLOGY": "General Neurology",
  "NEUROPATHY": "Neuropathy",
  "GAIT_BALANCE_DISORDERS": "Gait & Balance Disorders",
  "STROKE": "Stroke",
  "BRAIN_TUMORS": "Brain Tumors",
  "PITUITARY_TUMORS": "Pituitary Tumors",
  "CONCUSSION_BRAIN_INJURIES": "Concussion & Brain Injuries",
  "PARKINSONS_DISEASE": "Parkinson's Disease",
  "MULTIPLE_SCLEROSIS": "Multiple Sclerosis",
  "EPILEPSY_SEIZURES": "Epilepsy, Seizures",
  "HEADACHE_DISORDERS_CHRONIC_MIGRAINE": "Headache disorders, Chronic migraine",
  "DEMENTIA": "Dementia",
  "DIZZINESS_OTONEUROLOGY": "Dizziness, Otoneurology",
  "TRIGEMINAL_NEURALGIA": "Trigeminal Neuralgia",
  "GENERAL_OBSTETRICS_GYNECOLOGY": "General Obstetrics and Gynecology",
  "CONTRACEPTION_FAMILY_PLANNING": "Contraception & family planning",
  "PERIMENOPAUSE_MENOPAUSE": "Perimenopause / Menopause",
  "HIGH_RISK_PREGNANCY_MFM": "High Risk Pregnancy, Maternal–Fetal Medicine (MFM)",
  "CERVICAL_CANCER_ABNORMAL_PAP_SMEAR": "Cervical Cancer, Abnormal Pap smear",
  "OVARIAN_UTERINE_CERVICAL_CANCER": "Ovarian / Uterine / Cervical Cancer",
  "UTERINE_FIBROIDS": "Uterine Fibroids",
  "PROLAPSE": "Prolapse",
  "INCONTINENCE": "Incontinence",
  "GENERAL_ONCOLOGY": "General Oncology",
  "HEMATOLOGY": "Hematology",
  "BREAST_CANCER": "Breast Cancer",
  "COLON_CANCER": "Colon Cancer",
  "PANCREATIC_CANCER": "Pancreatic Cancer",
  "PROSTATE_CANCER": "Prostate Cancer",
  "TESTICULAR_CANCER": "Testicular Cancer",
  "LUNG_CANCER": "Lung Cancer",
  "MELANOMA": "Melanoma",
  "LYMPHOMA": "Lymphoma",
  "SARCOMAS": "Sarcomas",
  "HEAD_NECK": "Head & Neck",
  "HIP": "Hip",
  "KNEE": "Knee",
  "SHOULDER_ELBOW": "Shoulder & Elbow",
  "HAND_WRIST": "Hand & Wrist",
  "FOOT_ANKLE": "Foot & Ankle",
  "TMJ": "TMJ (Temporomandibular Joint)",
  "FRACTURE_CARE": "Fracture Care",
  "SPORTS_MEDICINE": "Sports Medicine",
  "OSTEOARTHRITIS": "Osteoarthritis",
  "SPINE": "Spine",
  "SCOLIOSIS": "Scoliosis",
  "CEREBRAL_PALSY": "Cerebral Palsy",
  "GENERAL_UROLOGY": "General Urology",
  "UROLOGIC_ONCOLOGY": "Urologic Oncology",
  "BLADDER": "Bladder",
  "PROSTATE": "Prostate",
  "KIDNEY": "Kidney",
  "STONES": "Stones",
  "ERECTILE_DYSFUNCTION": "Erectile Dysfunction",
  "MALE_INFERTILITY": "Male Infertility",
  "URINARY_INCONTINENCE": "Urinary Incontinence",
  "URETHRAL_STRICTURE": "Urethral Stricture",
  "PEDIATRIC_UROLOGY": "Pediatric Urology"
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
