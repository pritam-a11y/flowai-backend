/**
 * Normalized Expertise Enums
 * 
 * This file contains the master list of normalized expertise area enums.
 * These enums bridge the gap between patient symptom requirements and physician expertise.
 * 
 * Created by analyzing Patient Symptoms CSV and Physician Matching CSV.
 */

const EXPERTISE_ENUMS = {
  // Cardiology - General
  GENERAL_CARDIOLOGY: 'General Cardiology',
  PREVENTIVE_CARDIOLOGY: 'Preventive Cardiology',
  
  // Cardiology - Heart Conditions
  CORONARY_ARTERY_DISEASE: 'Coronary Artery Disease',
  HEART_FAILURE: 'Heart Failure',
  HEART_FAILURE_CARDIOMYOPATHY: 'Heart Failure & Cardiomyopathy',
  CARDIOMYOPATHY: 'Cardiomyopathy',
  HEART_TRANSPLANT: 'Heart Transplant',
  VENTRICULAR_ASSIST_DEVICES: 'Ventricular Assist Devices',
  
  // Cardiology - Rhythm/Electrical
  ARRHYTHMIAS: 'Arrhythmias',
  ATRIAL_FIBRILLATION: 'Atrial Fibrillation',
  CARDIAC_ELECTROPHYSIOLOGY: 'Cardiac Electrophysiology',
  VENTRICULAR_TACHYCARDIA: 'Ventricular Tachycardia',
  SYNCOPE_FAINTING: 'Syncope (Fainting)',
  
  // Cardiology - Valves
  VALVE_DISEASE: 'Valve Disease',
  
  // Cardiology - Interventional
  CARDIAC_CATHETERIZATION: 'Cardiac Catheterization',
  INTERVENTIONAL_CARDIOLOGY: 'Interventional Cardiology',
  
  // Cardiology - Other
  HYPERTENSION: 'Hypertension',
  HYPERLIPIDEMIA: 'Hyperlipidemia',
  ECHOCARDIOGRAPHY: 'Echocardiography',
  ADULT_CONGENITAL_HEART_DISEASE: 'Adult Congenital Heart Disease',
  MINIMALLY_INVASIVE_HEART_SURGERY: 'Minimally Invasive Heart Surgery',
  
  // Vascular
  PERIPHERAL_VASCULAR_DISEASE: 'Peripheral Vascular Disease',
  PERIPHERAL_ARTERIAL_DISEASE: 'Peripheral Arterial Disease',
  AORTIC_ANEURYSMS: 'Aortic Aneurysms',
  AORTIC_DISEASE: 'Aortic Disease',
  PULMONARY_EMBOLISM: 'Pulmonary Embolism',
  
  // Gastroenterology - General
  GENERAL_GASTROENTEROLOGY: 'General Gastroenterology',
  ENDOSCOPY: 'Endoscopy',
  COLONOSCOPY: 'Colonoscopy',
  
  // Gastroenterology - Conditions
  GERD_ACID_REFLUX: 'GERD, Acid Reflux',
  CROHNS_DISEASE: "Crohn's Disease",
  ULCERATIVE_COLITIS: 'Ulcerative Colitis',
  INFLAMMATORY_BOWEL_DISEASE: 'Inflammatory Bowel Disease',
  CELIAC_DISEASE: 'Celiac Disease',
  ESOPHAGEAL_MOTILITY_SWALLOWING_DISORDERS: 'Esophageal Motility, Swallowing Disorders, Esophagus Conditions',
  
  // Gastroenterology - Liver
  LIVER_DISEASES: 'Liver Diseases',
  FATTY_LIVER_DISEASE_NAFLD: 'Fatty Liver Disease, NAFLD',
  HEPATOBILIARY_DISEASES: 'Hepatobiliary Diseases',
  
  // Gastroenterology - Pancreas
  PANCREAS_PANCREATOBILIARY_DISEASE: 'Pancreas, Pancreatobiliary disease',
  
  // GI Surgery
  COLON_RECTAL_SURGERY: 'Colon & Rectal Surgery',
  
  // Neurology - General
  GENERAL_NEUROLOGY: 'General Neurology',
  NEUROPATHY: 'Neuropathy',
  GAIT_BALANCE_DISORDERS: 'Gait & Balance Disorders',
  
  // Neurology - Brain Conditions
  STROKE: 'Stroke',
  BRAIN_TUMORS: 'Brain Tumors',
  BRAIN_CANCER_NEUROBLASTOMA: 'Brain Cancer, Neuroblastoma',
  PITUITARY_TUMORS: 'Pituitary Tumors',
  CONCUSSION_BRAIN_INJURIES: 'Concussion & Brain Injuries',
  
  // Neurology - Movement Disorders
  PARKINSONS_DISEASE: "Parkinson's Disease",
  MULTIPLE_SCLEROSIS: 'Multiple Sclerosis',
  EPILEPSY_SEIZURES: 'Epilepsy, Seizures',
  HEADACHE_DISORDERS_CHRONIC_MIGRAINE: 'Headache disorders, Chronic migraine',
  DEMENTIA: 'Dementia',
  DIZZINESS_OTONEUROLOGY: 'Dizziness, Otoneurology',
  TRIGEMINAL_NEURALGIA: 'Trigeminal Neuralgia',
  
  // Obstetrics & Gynecology
  GENERAL_OBSTETRICS_GYNECOLOGY: 'General Obstetrics and Gynecology',
  CONTRACEPTION_FAMILY_PLANNING: 'Contraception & family planning',
  PERIMENOPAUSE_MENOPAUSE: 'Perimenopause / Menopause',
  HIGH_RISK_PREGNANCY: 'High Risk Pregnancy, Maternal–Fetal Medicine (MFM)',
  
  // Gynecologic Conditions
  CERVICAL_CANCER_ABNORMAL_PAP: 'Cervical Cancer, Abnormal Pap smear',
  OVARIAN_UTERINE_CERVICAL_CANCER: 'Ovarian / Uterine / Cervical Cancer',
  UTERINE_FIBROIDS: 'Uterine Fibroids',
  PROLAPSE: 'Prolapse',
  INCONTINENCE: 'Incontinence',
  FEMALE_INCONTINENCE: 'Female Incontinence',
  
  // Oncology - General
  GENERAL_ONCOLOGY: 'General Oncology',
  HEMATOLOGY: 'Hematology',
  
  // Oncology - Specific Cancers
  BREAST_CANCER: 'Breast Cancer',
  COLON_CANCER: 'Colon Cancer',
  PANCREATIC_CANCER: 'Pancreating Cancer',
  PROSTATE_CANCER: 'Prostate Cancer',
  TESTICULAR_CANCER: 'Testicular Cancer',
  LUNG_CANCER: 'Lung Cancer',
  MELANOMA: 'Melanoma',
  LYMPHOMA: 'Lymphoma',
  SARCOMAS: 'Sarcomas',
  HEAD_NECK_CANCER: 'Head & Neck',
  
  // Orthopedics - Joints
  HIP: 'Hip',
  KNEE: 'Knee',
  SHOULDER_ELBOW_SPORTS_MEDICINE: 'Shoulder & Elbow; Sports Medicine',
  SHOULDER_HIP_SPORTS_MEDICINE: 'Shoulder, Hip, Sports Medicine',
  HAND: 'Hand',
  HAND_WRIST: 'Hand & Wrist',
  ELBOW: 'Elbow',
  FOOT_ANKLE: 'Foot & Ankle',
  KNEE_WRIST_ANKLE: 'Knee, Wrist, Ankle',
  TMJ: "TMJ (Temporomandibular Joint)",
  
  // Orthopedics - Conditions
  FRACTURE: 'Fracture',
  FRACTURE_CARE: 'Fracture Care',
  SPORTS_MEDICINE: 'Sports Medicine',
  OSTEOARTHRITIS: 'Osteoarthritis',
  SPINE: 'Spine',
  SCOLIOSIS: 'Scoliosis',
  CEREBRAL_PALSY: 'Cerebral Palsy',
  
  // Urology - General
  GENERAL_UROLOGY: 'General Urology',
  UROLOGIC_ONCOLOGY: 'Urologic Oncology; General Urology',
  
  // Urology - Conditions
  BLADDER: 'Bladder',
  PROSTATE: 'Prostate',
  KIDNEY: 'Kidney',
  STONES: 'Stones',
  ERECTILE_DYSFUNCTION: 'Erectile Dysfunction',
  MALE_INFERTILITY: 'Male Infertility',
  URINARY_INCONTINENCE: 'Urinary Incontinence',
  URETHRAL_STRICTURE: 'Urethral Stricture',
  PEDIATRIC_UROLOGY: 'Pediatric Urology'
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