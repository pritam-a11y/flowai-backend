/**
 * Physician Expertise Mapper
 * 
 * Maps physician expertise areas from physiciansData.json to normalized expertise enums.
 * This creates the bridge between the 427 physician expertise areas and our normalized enums.
 */

const { getAllExpertiseEnums } = require('../config/expertiseEnums');

/**
 * Mapping of physician expertise phrases to normalized expertise enums
 * This is a comprehensive mapping that handles all variations of expertise descriptions
 */
const PHYSICIAN_EXPERTISE_MAPPING = {
  // Cardiology - General
  'General Cardiology': ['GENERAL_CARDIOLOGY'],
  'General/Preventive Cardiology': ['GENERAL_CARDIOLOGY', 'PREVENTIVE_CARDIOLOGY'],
  'Preventive Cardiology': ['PREVENTIVE_CARDIOLOGY'],
  
  // Cardiology - Coronary
  'Coronary Artery Disease': ['CORONARY_ARTERY_DISEASE'],
  'CAD': ['CORONARY_ARTERY_DISEASE'],
  'Coronary Artery Disease, Hypertension': ['CORONARY_ARTERY_DISEASE', 'HYPERTENSION'],
  'Coronary Artery Disease, Preventive Cardiology, General Cardiology': ['CORONARY_ARTERY_DISEASE', 'PREVENTIVE_CARDIOLOGY', 'GENERAL_CARDIOLOGY'],
  'Coronary Artery Disease, Echocardiography, General Cardiology, Hyperlipidemia, Hypertension, Preventive Cardiology': ['CORONARY_ARTERY_DISEASE', 'ECHOCARDIOGRAPHY', 'GENERAL_CARDIOLOGY', 'HYPERLIPIDEMIA', 'HYPERTENSION', 'PREVENTIVE_CARDIOLOGY'],
  'Acute Coronary Syndrome, Antiplatelet Therapies, Coronary Artery Disease': ['CORONARY_ARTERY_DISEASE'],
  'Coronary & Structural Heart Interventions': ['INTERVENTIONAL_CARDIOLOGY'],
  'Coronary & Peripheral Interventions': ['INTERVENTIONAL_CARDIOLOGY'],
  
  // Cardiology - Heart Failure
  'Heart Failure': ['HEART_FAILURE'],
  'Advanced Heart Failure': ['HEART_FAILURE'],
  'Heart Failure, Non-Invasive Cardiac (Heart) Testing': ['HEART_FAILURE'],
  'Heart Failure & Cardiomyopathy': ['HEART_FAILURE_CARDIOMYOPATHY'],
  'Heart Failure, General Cardiology': ['HEART_FAILURE', 'GENERAL_CARDIOLOGY'],
  'Heart Failure & Cardiomyopathy; General Cardiology': ['HEART_FAILURE_CARDIOMYOPATHY', 'GENERAL_CARDIOLOGY'],
  'Congestive Heart Failure, Ventricular Assist Devices (VADs), Heart Transplant': ['HEART_FAILURE', 'VENTRICULAR_ASSIST_DEVICES', 'HEART_TRANSPLANT'],
  
  // Cardiology - Cardiomyopathy & Transplant
  'Cardiomyopathy': ['CARDIOMYOPATHY'],
  'Heart Transplant, Cardiomyopathy, Ventricular Assist Devices (VADs)': ['HEART_TRANSPLANT', 'CARDIOMYOPATHY', 'VENTRICULAR_ASSIST_DEVICES'],
  'Heart Transplant': ['HEART_TRANSPLANT'],
  'Ventricular Assist Devices (VADs), Cardiomyopathy, Heart Transplant': ['VENTRICULAR_ASSIST_DEVICES', 'CARDIOMYOPATHY', 'HEART_TRANSPLANT'],
  'Ventricular Assist Devices (VADs)': ['VENTRICULAR_ASSIST_DEVICES'],
  'Transplant, Hypertrophic Cardiomyopathy': ['HEART_TRANSPLANT', 'CARDIOMYOPATHY'],
  'Transplant': ['HEART_TRANSPLANT'],
  
  // Cardiology - Rhythm/Electrical
  'Arrhythmias': ['ARRHYTHMIAS'],
  'Atrial Fibrillation': ['ATRIAL_FIBRILLATION'],
  'Atrial Fibrillation, Arrhythmias, Catheter Ablation of Cardiac Arrhythmias': ['ATRIAL_FIBRILLATION', 'ARRHYTHMIAS', 'CARDIAC_ELECTROPHYSIOLOGY'],
  'Catheter Ablation of Cardiac Arrhythmias': ['CARDIAC_ELECTROPHYSIOLOGY'],
  'Catheter Ablation': ['CARDIAC_ELECTROPHYSIOLOGY'],
  'Syncope (Fainting), Atrial Fibrillation, Arrhythmias, Ventricular Tachycardia': ['SYNCOPE_FAINTING', 'ATRIAL_FIBRILLATION', 'ARRHYTHMIAS', 'VENTRICULAR_TACHYCARDIA'],
  'Syncope (Fainting)': ['SYNCOPE_FAINTING'],
  'Ventricular Tachycardia': ['VENTRICULAR_TACHYCARDIA'],
  'Ventricular Tachycardia, Hypertrophic Cardiomyopathy': ['VENTRICULAR_TACHYCARDIA', 'CARDIOMYOPATHY'],
  'Pacemakers & Defibrillators': ['CARDIAC_ELECTROPHYSIOLOGY'],
  'Conduction System Pacing': ['CARDIAC_ELECTROPHYSIOLOGY'],
  'Cardiac Resynchronization': ['CARDIAC_ELECTROPHYSIOLOGY'],
  
  // Cardiology - Valves
  'Valve Disease': ['VALVE_DISEASE'],
  'Valve Disease, General Cardiology': ['VALVE_DISEASE', 'GENERAL_CARDIOLOGY'],
  'Coronary artery Disease, Heart Valve Disease': ['CORONARY_ARTERY_DISEASE', 'VALVE_DISEASE'],
  'Heart Valve Disease': ['VALVE_DISEASE'],
  
  // Cardiology - Interventional
  'Cardiac Catheterization': ['CARDIAC_CATHETERIZATION'],
  'Cardiac CT Angiography': ['CARDIAC_CATHETERIZATION'],
  'TAVR': ['INTERVENTIONAL_CARDIOLOGY'],
  'Mitral Clip': ['INTERVENTIONAL_CARDIOLOGY'],
  'PFO': ['INTERVENTIONAL_CARDIOLOGY'],
  'Aortic Valve Stenosis': ['VALVE_DISEASE'],
  'Patient Foramen Ovale (PFO)': ['INTERVENTIONAL_CARDIOLOGY'],
  
  // Cardiology - Other
  'Minimally Invasive Heart Surgery': ['MINIMALLY_INVASIVE_HEART_SURGERY'],
  'Hypertension': ['HYPERTENSION'],
  'Hypertension, Echocardiography, Heart Failure': ['HYPERTENSION', 'ECHOCARDIOGRAPHY', 'HEART_FAILURE'],
  'Hypertension, Preventive Cardiology, Coronary Artery Disease, Echocardiography, Women\'s Heart Disease, General Cardiology': ['HYPERTENSION', 'PREVENTIVE_CARDIOLOGY', 'CORONARY_ARTERY_DISEASE', 'ECHOCARDIOGRAPHY', 'GENERAL_CARDIOLOGY'],
  'Hyperlipidemia': ['HYPERLIPIDEMIA'],
  'Lipid Disorders': ['HYPERLIPIDEMIA'],
  'Echocardiography': ['ECHOCARDIOGRAPHY'],
  'Echocardiography, General Cardiology': ['ECHOCARDIOGRAPHY', 'GENERAL_CARDIOLOGY'],
  'Sports Cardiology': ['GENERAL_CARDIOLOGY'],
  'Cardiovascular Risk Reduction': ['PREVENTIVE_CARDIOLOGY'],
  'Secondary prevention': ['PREVENTIVE_CARDIOLOGY'],
  
  // Adult Congenital
  'Adult Congenital Heart Disease': ['ADULT_CONGENITAL_HEART_DISEASE'],
  'Connective Tissue Diseases, Echocardiography, Aortic Aneurysms, Marfan Syndrome, Congenital Heart Disease in Children, Adult Congenital Heart Disease, Pulmonary Arterial Hypertension, Hypertrophic Cardiomyopathy': ['ADULT_CONGENITAL_HEART_DISEASE', 'AORTIC_ANEURYSMS', 'ECHOCARDIOGRAPHY'],
  
  // Women's Heart Health
  'Women\'s Heart Disease, Cardiac Side Effects of Cancer Therapy, General Cardiology': ['GENERAL_CARDIOLOGY'],
  'Women\'s Heart Disease, Echocardiography, Preventive Cardiology, Cardiac MRI, Cardiac Side Effects of Cancer Therapy, General Cardiology, Cardio-Obstetrics': ['GENERAL_CARDIOLOGY', 'ECHOCARDIOGRAPHY', 'PREVENTIVE_CARDIOLOGY'],
  'Women\'s Heart Health': ['GENERAL_CARDIOLOGY'],
  'Cardio-Oncology (Director, Cardio-Oncology Program at U Chicago)': ['GENERAL_CARDIOLOGY'],
  
  // Vascular
  'Peripheral Arterial Disease': ['PERIPHERAL_ARTERIAL_DISEASE'],
  'Peripheral Vascular Disease': ['PERIPHERAL_VASCULAR_DISEASE'],
  'Peripheral Vascular Disease, Peripheral Arterial Disease': ['PERIPHERAL_VASCULAR_DISEASE'],
  'DVT': ['PERIPHERAL_VASCULAR_DISEASE'],
  'Pulmonary Embolism': ['PULMONARY_EMBOLISM'],
  'Pulmonary Embolism Therapies': ['PULMONARY_EMBOLISM'],
  'Aortic Disease': ['AORTIC_DISEASE'],
  'Aortic Aneurysms': ['AORTIC_ANEURYSMS'],
  'Aortic Disease, Cerebrovascular Disease, Peripheral Vascular Disease': ['AORTIC_DISEASE', 'PERIPHERAL_VASCULAR_DISEASE'],
  'Abdominal Aortic Aneurysms, Renal Artery Disease, Mesenteric Artery Disease, Carotid Artery Disease, Aortic Disease, Peripheral Arterial Disease': ['AORTIC_ANEURYSMS', 'PERIPHERAL_ARTERIAL_DISEASE'],
  'Renal Artery Disease, Abdominal Aortic Aneurysms, Mesenteric Artery Disease, Carotid Artery Disease, Aortic Disease': ['AORTIC_ANEURYSMS', 'PERIPHERAL_ARTERIAL_DISEASE'],
  'Renal Artery Disease, Abdominal Aortic Aneurysms, Mesenteric Artery Disease, Carotid Artery Disease, Aortic Disease, Peripheral Arterial Disease': ['AORTIC_ANEURYSMS', 'PERIPHERAL_ARTERIAL_DISEASE'],
  'Mesenteric Ischemia, Carotid Artery Disease, Aortic Surgery, Complex Aortic Pathology': ['AORTIC_DISEASE', 'PERIPHERAL_ARTERIAL_DISEASE'],
  'Arteriovenous Fistula Revision, Dialysis Access Procedures, Venous Insufficiency, Varicose Veins': ['PERIPHERAL_VASCULAR_DISEASE'],
  'Vascular Surgery': ['PERIPHERAL_VASCULAR_DISEASE'],
  'Ischemic Heart Disease, Carotid Artery Disease, Aortic Disease, Pulmonary Arterial Hypertension, Pulmonary Embolism Therapies, Coronary Artery Disease': ['CORONARY_ARTERY_DISEASE', 'AORTIC_DISEASE', 'PULMONARY_EMBOLISM'],
  
  // Gastroenterology - General
  'General Gastroenterology': ['GENERAL_GASTROENTEROLOGY'],
  'Gastroenterology': ['GENERAL_GASTROENTEROLOGY'],
  'General GI Complaints, Swallowing Disorders, Esophagus Conditions, Acid Reflux': ['GENERAL_GASTROENTEROLOGY'],
  'Endoscopy': ['ENDOSCOPY'],
  'Endoscopy, Colonoscopy': ['ENDOSCOPY', 'COLONOSCOPY'],
  'General Gastroenterology, Endoscopy, Colonoscopy': ['GENERAL_GASTROENTEROLOGY', 'ENDOSCOPY', 'COLONOSCOPY'],
  'Colonoscopy': ['COLONOSCOPY'],
  'Abdominal Pain, Colonoscopy': ['GENERAL_GASTROENTEROLOGY', 'COLONOSCOPY'],
  
  // Gastroenterology - GERD
  'GERD': ['GERD_ACID_REFLUX'],
  'GERD, Dysphagia, Achalasia, Esophageal motility': ['GERD_ACID_REFLUX', 'ESOPHAGEAL_MOTILITY_SWALLOWING_DISORDERS'],
  'Esophageal motility': ['ESOPHAGEAL_MOTILITY_SWALLOWING_DISORDERS'],
  'Dysphagia': ['ESOPHAGEAL_MOTILITY_SWALLOWING_DISORDERS'],
  'Achalasia': ['ESOPHAGEAL_MOTILITY_SWALLOWING_DISORDERS'],
  'GERD, Esophageal motility, Dysphagia, Functional GI disorders': ['GERD_ACID_REFLUX', 'ESOPHAGEAL_MOTILITY_SWALLOWING_DISORDERS'],
  
  // Gastroenterology - IBD
  'Inflammatory Bowel Disease': ['INFLAMMATORY_BOWEL_DISEASE'],
  'Crohn\'s': ['CROHNS_DISEASE'],
  'Crohn\'s Disease': ['CROHNS_DISEASE'],
  'Ulcerative Colitis': ['ULCERATIVE_COLITIS'],
  'Inflammatory Bowel Disease, Crohn\'s Disease, Ulcerative Colitis': ['INFLAMMATORY_BOWEL_DISEASE', 'CROHNS_DISEASE', 'ULCERATIVE_COLITIS'],
  'Inflammatory Bowel Disease, Crohn\'s, Ulcerative Colitis': ['INFLAMMATORY_BOWEL_DISEASE', 'CROHNS_DISEASE', 'ULCERATIVE_COLITIS'],
  'Inflammatory Bowel Disease, Ulcerative Colitis, Crohn\'s Disease, Dysplasia surveillance': ['INFLAMMATORY_BOWEL_DISEASE', 'ULCERATIVE_COLITIS', 'CROHNS_DISEASE'],
  'Colon Cancer, Ulcerative Colitis, Crohn\'s Disease, Colon Cancer Prevention, Imflammatory Bowel Disease, Fecal Microbiota Transplant': ['COLON_CANCER', 'ULCERATIVE_COLITIS', 'CROHNS_DISEASE', 'INFLAMMATORY_BOWEL_DISEASE'],
  
  // Gastroenterology - Celiac
  'Celiac Disease': ['CELIAC_DISEASE'],
  'Celiac Disease, Diarrheal Diseases, Nutrition Education': ['CELIAC_DISEASE'],
  
  // Gastroenterology - Liver
  'Liver Diseases': ['LIVER_DISEASES'],
  'Liver Diseases, Colonoscopy': ['LIVER_DISEASES', 'COLONOSCOPY'],
  'Liver Diseases, Liver Transplant': ['LIVER_DISEASES'],
  'Liver Disease': ['LIVER_DISEASES'],
  'Liver disease': ['LIVER_DISEASES'],
  'Cirrhosis': ['LIVER_DISEASES'],
  'Cirrhosis, Fatty Liver Disease, Hepatitis, Liver Cancer, Liver Diseases, Liver Transplant': ['LIVER_DISEASES', 'FATTY_LIVER_DISEASE_NAFLD'],
  'Cirrhosis, Hepatitis, NAFLD/NASH, Transplant Hepatology': ['LIVER_DISEASES', 'FATTY_LIVER_DISEASE_NAFLD'],
  'Fatty Liver Disease': ['FATTY_LIVER_DISEASE_NAFLD'],
  'NAFLD/NASH': ['FATTY_LIVER_DISEASE_NAFLD'],
  'Hepatitis': ['LIVER_DISEASES'],
  'Liver transplantation': ['LIVER_DISEASES'],
  'Transplant Hepatology': ['LIVER_DISEASES'],
  
  // Gastroenterology - Colon Cancer
  'Colon Cancer': ['COLON_CANCER'],
  'Colon Cancer Prevention': ['COLON_CANCER'],
  'Colon Cancer Prevention, Liver Diseases, Gastroesophageal Reflux Disease (GERD), Inflammatory Bowel Disease (IBD)': ['COLON_CANCER', 'LIVER_DISEASES', 'GERD_ACID_REFLUX', 'INFLAMMATORY_BOWEL_DISEASE'],
  'Hereditary GI cancer syndromes': ['COLON_CANCER'],
  'Lynch syndrome': ['COLON_CANCER'],
  'Lynch': ['COLON_CANCER'],
  'Familial adenomatous polyposis': ['COLON_CANCER'],
  'FAP': ['COLON_CANCER'],
  
  // Gastroenterology - Pancreas
  'Pancreas': ['PANCREAS_PANCREATOBILIARY_DISEASE'],
  'Pancreatic Diseases': ['PANCREAS_PANCREATOBILIARY_DISEASE'],
  'Pancreaticobiliary disease': ['PANCREAS_PANCREATOBILIARY_DISEASE'],
  'Barrett\'s Esophagus, Gastrointestinal Cancers, Pancreatic Diseases': ['PANCREAS_PANCREATOBILIARY_DISEASE'],
  'Endoscopy, ERCP, Therapeutic/Diagnostic Endocopic Ultrasound, Biliary Diseases, Barrett\'s Esophagus, Gastrointestinal Cancers, Colorectal Cancer, Pancreatic Cancer, Pancreatic Diseases': ['ENDOSCOPY', 'PANCREAS_PANCREATOBILIARY_DISEASE'],
  'Endoscopic ultrasound (EUS), ERCP, Pancreaticobiliary disease, Complex polypectomy': ['ENDOSCOPY', 'PANCREAS_PANCREATOBILIARY_DISEASE'],
  'ERCP': ['ENDOSCOPY'],
  'Biliary': ['PANCREAS_PANCREATOBILIARY_DISEASE'],
  'Hepatobiliary': ['HEPATOBILIARY_DISEASES'],
  
  // Gastroenterology - Other
  'Small Bowel Disorders, Obesity': ['GENERAL_GASTROENTEROLOGY'],
  'Functional GI disorders': ['GENERAL_GASTROENTEROLOGY'],
  'Dysplasia surveillance': ['GENERAL_GASTROENTEROLOGY'],
  'Complex polypectomy': ['ENDOSCOPY'],
  
  // GI Surgery
  'Colon & Rectal Surgery': ['COLON_RECTAL_SURGERY'],
  'Colon & rectal surgery': ['COLON_RECTAL_SURGERY'],
  'Colon & Rectal Surgery, IBD Surgery, Minimally Invasive & Robotic Surgery': ['COLON_RECTAL_SURGERY'],
  'Colon & rectal surgery, IBD surgery, Diverticulitis, Pelvic floor': ['COLON_RECTAL_SURGERY'],
  'IBD Surgery': ['COLON_RECTAL_SURGERY'],
  'IBD surgery': ['COLON_RECTAL_SURGERY'],
  'Diverticulitis': ['COLON_RECTAL_SURGERY'],
  'Complex GI surgery': ['COLON_RECTAL_SURGERY'],
  'Complex GI Surgery': ['COLON_RECTAL_SURGERY'],
  'Liver, Pancreas, Biliary, Complex GI Surgery': ['LIVER_DISEASES', 'PANCREAS_PANCREATOBILIARY_DISEASE'],
  'Hepato-pancreato-biliary surgery': ['LIVER_DISEASES', 'PANCREAS_PANCREATOBILIARY_DISEASE'],
  'Liver': ['LIVER_DISEASES'],
  'Pancreas, Hepatobiliary, Gastrointestinal cancers, Multidisciplinary cancer care': ['PANCREAS_PANCREATOBILIARY_DISEASE', 'HEPATOBILIARY_DISEASES'],
  'Foregut': ['GENERAL_GASTROENTEROLOGY'],
  'Complex foregut': ['GENERAL_GASTROENTEROLOGY'],
  'Bariatric surgery': ['GENERAL_GASTROENTEROLOGY'],
  'Revisional bariatric surgery': ['GENERAL_GASTROENTEROLOGY'],
  'Duodenal switch': ['GENERAL_GASTROENTEROLOGY'],
  'Complex GI surgery, Foregut, Intestinal failure, Sepsis in surgery': ['GENERAL_GASTROENTEROLOGY'],
  'Intestinal failure': ['GENERAL_GASTROENTEROLOGY'],
  
  // Neurology - General
  'General neurology': ['GENERAL_NEUROLOGY'],
  'General Neurology': ['GENERAL_NEUROLOGY'],
  'Neuropathy': ['NEUROPATHY'],
  'Neuropathies': ['NEUROPATHY'],
  'General Neurology, Neuropathy': ['GENERAL_NEUROLOGY', 'NEUROPATHY'],
  'Neuropathies, General Neurology, Neuropathy': ['NEUROPATHY', 'GENERAL_NEUROLOGY'],
  'Neuromuscular disorders': ['NEUROPATHY'],
  'Neuromuscular disorders, Myasthenia gravis, Neuropathies': ['NEUROPATHY'],
  'Gait & Balance Disorders': ['GAIT_BALANCE_DISORDERS'],
  'General Neurology; Gait & Balance  Disorders': ['GENERAL_NEUROLOGY', 'GAIT_BALANCE_DISORDERS'],
  
  // Neurology - Brain
  'Brain & Spinal Tumors': ['BRAIN_TUMORS'],
  'Brain & spinal cord disorders': ['GENERAL_NEUROLOGY'],
  'Brain tumors': ['BRAIN_TUMORS'],
  'Brain Tumors': ['BRAIN_TUMORS'],
  'Pituitary Tumors': ['PITUITARY_TUMORS'],
  'Pituitary tumors': ['PITUITARY_TUMORS'],
  'Pituitary Tumors, Brain Tumors, Gliomas, Schwannomas, Brain Metastases, Meningioma, Skull Base Tumors, Head & Neck Cancer': ['PITUITARY_TUMORS', 'BRAIN_TUMORS'],
  'Pituitary Tumors, Brain Tumors, Pediatric Brain & Spinal Cord Tumors, Minimally Invasive Neurosurgery, Schwannomas, Trigeminal Neuralgia, Meningiomas': ['PITUITARY_TUMORS', 'BRAIN_TUMORS', 'TRIGEMINAL_NEURALGIA'],
  'Brain tumors, Pituitary tumors, Skull base, Clinical trials': ['BRAIN_TUMORS', 'PITUITARY_TUMORS'],
  'Pediatric brain tumors': ['BRAIN_TUMORS'],
  'Skull base': ['BRAIN_TUMORS'],
  
  // Neurology - Stroke
  'Stroke': ['STROKE'],
  'Stroke, Cerebrovascular Diseases, Brain Aneurysm, Cerebral Ischemia, Ischemic Stroke, Vascular Dementia, Arteriovenous Malformations': ['STROKE'],
  'Ischemic stroke': ['STROKE'],
  'Ischemic Stroke, Brain Aneurysms, Stroke, Arteriovenous Malformations': ['STROKE'],
  'TIA': ['STROKE'],
  'Secondary stroke prevention': ['STROKE'],
  'Neurohospitalist care': ['STROKE'],
  
  // Neurology - Movement Disorders
  'Parkinson\'s Disease': ['PARKINSONS_DISEASE'],
  'Parkinson\'s disease': ['PARKINSONS_DISEASE'],
  'Movement Disorders, Parkinson\'s Disease, Deep Brain Stimulation, Dystonia, Chorea, Myclonus, Neuromonitoring': ['PARKINSONS_DISEASE'],
  'Hemifacial Spasm, Tics, Tremor, Tourette Syndrome, Huntington\'s Disease, Movement Disorders, Progressive Supranuclear Palsy, Parkinson\'s Disease, Botox Therapy, Deep Brain Stimulation, Dystonia, Multiple System Atrophy, Blepharospasm': ['PARKINSONS_DISEASE'],
  'Movement disorders surgery': ['PARKINSONS_DISEASE'],
  'Essential tremor': ['PARKINSONS_DISEASE'],
  'Huntington\'s disease': ['PARKINSONS_DISEASE'],
  
  // Neurology - MS & Demyelinating
  'Multiple sclerosis': ['MULTIPLE_SCLEROSIS'],
  'MS': ['MULTIPLE_SCLEROSIS'],
  'Multiple Sclerosis': ['MULTIPLE_SCLEROSIS'],
  'Multiple sclerosis, Neuromyelitis optica, Autoimmune encephalitis, Demyelinating disease': ['MULTIPLE_SCLEROSIS'],
  'Acute Disseminated Encephalomyelitis (ADEM), Lupus, Multiple Sclerosis, Connective Tissue Diseases, Sjogren\'s Syndrome, Neurosarcoidosis, Demyelinating Disease, MOG Antibody Disease': ['MULTIPLE_SCLEROSIS'],
  'Demyelinating disease': ['MULTIPLE_SCLEROSIS'],
  'NMO': ['MULTIPLE_SCLEROSIS'],
  'Neuromyelitis optica': ['MULTIPLE_SCLEROSIS'],
  'Autoimmune encephalitis': ['MULTIPLE_SCLEROSIS'],
  
  // Neurology - Epilepsy
  'Epilepsy': ['EPILEPSY_SEIZURES'],
  'Seizures': ['EPILEPSY_SEIZURES'],
  'Epilepsy, Seizures': ['EPILEPSY_SEIZURES'],
  'Epilepsy, Seizures, Director - Epilepsy Research': ['EPILEPSY_SEIZURES'],
  'Epilepsy, Seizures, Headache, Dementia, Parkinson\'s disease, Stroke, MS, Neuropathy': ['EPILEPSY_SEIZURES', 'HEADACHE_DISORDERS_CHRONIC_MIGRAINE', 'DEMENTIA', 'PARKINSONS_DISEASE', 'STROKE', 'MULTIPLE_SCLEROSIS', 'NEUROPATHY'],
  'Epilepsy surgery': ['EPILEPSY_SEIZURES'],
  'Epilepsy surgery (pediatric)': ['EPILEPSY_SEIZURES'],
  'Intellectual Disabilities, Genetic Brain Disease, Epilepsy, Pediatric Epilepsy, Autism Spectrum Disorder, Neurofibromatosis, Neurocutaneous Disorders, Seizures': ['EPILEPSY_SEIZURES'],
  
  // Neurology - Headache
  'Headache': ['HEADACHE_DISORDERS_CHRONIC_MIGRAINE'],
  'Headache disorders': ['HEADACHE_DISORDERS_CHRONIC_MIGRAINE'],
  'Chronic migraine': ['HEADACHE_DISORDERS_CHRONIC_MIGRAINE'],
  'Migraine': ['HEADACHE_DISORDERS_CHRONIC_MIGRAINE'],
  'Migraine Headaches': ['HEADACHE_DISORDERS_CHRONIC_MIGRAINE'],
  'Migraine Headaches, Concussion & Brain Injuries, Stroke, Dementia': ['HEADACHE_DISORDERS_CHRONIC_MIGRAINE', 'CONCUSSION_BRAIN_INJURIES', 'STROKE', 'DEMENTIA'],
  
  // Neurology - Dementia
  'Dementia': ['DEMENTIA'],
  'Cognitive disorders': ['DEMENTIA'],
  
  // Neurology - Dizziness
  'Dizziness': ['DIZZINESS_OTONEUROLOGY'],
  'Otoneurology, Dizziness': ['DIZZINESS_OTONEUROLOGY'],
  
  // Neurology - Other
  'Trigeminal neuralgia': ['TRIGEMINAL_NEURALGIA'],
  'Trigeminal Neuralgia': ['TRIGEMINAL_NEURALGIA'],
  'Concussion & Brain Injuries': ['CONCUSSION_BRAIN_INJURIES'],
  'Concussion & Brain Injuries, Sports Injuries, Hip Problems': ['CONCUSSION_BRAIN_INJURIES'],
  'Muscular dystrophies': ['NEUROPATHY'],
  'Myopathies': ['NEUROPATHY'],
  'Myasthenia gravis': ['NEUROPATHY'],
  'Hereditary neuropathies': ['NEUROPATHY'],
  'CIDP': ['NEUROPATHY'],
  'Ataxia Telangiectasia, Gait & Balance Disorders, Spinocerebellar Ataxias, Congenital Myasthenic Syndromes, Hereditary Parkinson\'s Disease': ['GAIT_BALANCE_DISORDERS', 'PARKINSONS_DISEASE'],
  
  // Neurosurgery - Functional
  'DBS': ['PARKINSONS_DISEASE'],
  'Neuromodulation': ['PARKINSONS_DISEASE'],
  'Functional neurosurgery': ['PARKINSONS_DISEASE'],
  'Deep Brain Stimulation (DBS)': ['PARKINSONS_DISEASE'],
  'Deep Brain Stimulation (DBS), Epilepsy surgery, Trigeminal neuralgia, Movement disorders surgery': ['PARKINSONS_DISEASE', 'EPILEPSY_SEIZURES', 'TRIGEMINAL_NEURALGIA'],
  'Deep Brain Stimulation': ['PARKINSONS_DISEASE'],
  
  // Neurosurgery - Spine
  'Spine': ['SPINE'],
  'Spinal tumors': ['SPINE'],
  'Complex spine': ['SPINE'],
  'Minimally invasive spine': ['SPINE'],
  'Metastatic spine disease': ['SPINE'],
  'Minimally invasive spine, Spinal fusions, Spine fracture repair, Spinal tumors, Microdiscectomy, Foraminotomy': ['SPINE'],
  'Minimally invasive & robotic spine surgery': ['SPINE'],
  'Complex spinal disorders': ['SPINE'],
  'Minimally Invasive Spine Surgery, Degenerative Spine Disorders, Spine Tumors, Revision Spine Surgery, Spinal Deformities': ['SPINE'],
  'Spinal fusions': ['SPINE'],
  'Spine fracture repair': ['SPINE'],
  'Spinal tumors': ['SPINE'],
  'Microdiscectomy': ['SPINE'],
  'Foraminotomy': ['SPINE'],
  'Degenerative Spine Disorders': ['SPINE'],
  'Degenerative Spine': ['SPINE'],
  'Revision Spine Surgery': ['SPINE'],
  'Revision Spine': ['SPINE'],
  'Spinal Deformities': ['SPINE', 'SCOLIOSIS'],
  'Complex Spine': ['SPINE'],
  'Minimally Invasive Spine': ['SPINE'],
  'Scoliosis': ['SCOLIOSIS'],
  'Back Surgery': ['SPINE'],
  
  // Neurosurgery - Hydrocephalus & Other
  'Chiari malformation': ['GENERAL_NEUROLOGY'],
  'Hydrocephalus': ['GENERAL_NEUROLOGY'],
  
  // OB/GYN - General
  'General obstetrics and gynecology': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  'General obstetrics': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  'Gynecologic care': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  'Comprehensive women\'s health': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  'Well-woman care': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  'Prenatal care': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  'Obstetrics & Gynecology': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  'Comprehensive women\'s health, Well-woman care, Prenatal care': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  'Comprehensive women\'s health, Obstetrics & Gynecology': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  'Preventive & routine care, Vaginal surgery, Sterilization, Heavy menses, Cervical dysplasia': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  
  // OB/GYN - Contraception
  'Contraception & family planning': ['CONTRACEPTION_FAMILY_PLANNING'],
  'Abnormal uterine bleeding, Abnormal Pap smear, High-risk pregnancy, Contraception & family planning': ['GENERAL_OBSTETRICS_GYNECOLOGY', 'CONTRACEPTION_FAMILY_PLANNING', 'HIGH_RISK_PREGNANCY'],
  'Abnormal Pap smear': ['CERVICAL_CANCER_ABNORMAL_PAP'],
  'Cervical dysplasia': ['CERVICAL_CANCER_ABNORMAL_PAP'],
  
  // OB/GYN - Menopause
  'Perimenopause/menopause': ['PERIMENOPAUSE_MENOPAUSE'],
  'Uterine fibroids, Abnormal uterine bleeding, Irregular menses, Perimenopause/menopause': ['UTERINE_FIBROIDS', 'GENERAL_OBSTETRICS_GYNECOLOGY', 'PERIMENOPAUSE_MENOPAUSE'],
  'Abnormal uterine bleeding': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  'Irregular menses': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  'Heavy menses': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  
  // OB/GYN - High Risk Pregnancy
  'High-risk pregnancy': ['HIGH_RISK_PREGNANCY'],
  'Maternal-fetal diagnosis & management': ['HIGH_RISK_PREGNANCY'],
  'Maternal Fetal Medicine, Gynecologic Ultrasound, High Risk Pregnancy': ['HIGH_RISK_PREGNANCY'],
  
  // OB/GYN - Gynecologic Cancer
  'Gynecologic Cancers': ['OVARIAN_UTERINE_CERVICAL_CANCER'],
  'Gynecologic cancers': ['OVARIAN_UTERINE_CERVICAL_CANCER'],
  'Gynecologic Malignancy, Breast Cancer': ['OVARIAN_UTERINE_CERVICAL_CANCER', 'BREAST_CANCER'],
  'Ovarian': ['OVARIAN_UTERINE_CERVICAL_CANCER'],
  'Ovarian cancer': ['OVARIAN_UTERINE_CERVICAL_CANCER'],
  'Cervical': ['CERVICAL_CANCER_ABNORMAL_PAP'],
  'Cervical cancer': ['CERVICAL_CANCER_ABNORMAL_PAP'],
  'Endometrial': ['OVARIAN_UTERINE_CERVICAL_CANCER'],
  'Endometrial cancer': ['OVARIAN_UTERINE_CERVICAL_CANCER'],
  'Endometrial cancers': ['OVARIAN_UTERINE_CERVICAL_CANCER'],
  'Uterine': ['OVARIAN_UTERINE_CERVICAL_CANCER'],
  'Vulvar': ['OVARIAN_UTERINE_CERVICAL_CANCER'],
  'Vaginal cancers': ['OVARIAN_UTERINE_CERVICAL_CANCER'],
  'Ovarian, Cervical, Endometrial cancers, Advanced surgical techniques': ['OVARIAN_UTERINE_CERVICAL_CANCER', 'CERVICAL_CANCER_ABNORMAL_PAP'],
  'Ovarian, Cervical, Endometrial, Comprehensive longitudinal care': ['OVARIAN_UTERINE_CERVICAL_CANCER', 'CERVICAL_CANCER_ABNORMAL_PAP'],
  'Ovarian, Uterine, Cervical, Vulvar, Vaginal cancers': ['OVARIAN_UTERINE_CERVICAL_CANCER', 'CERVICAL_CANCER_ABNORMAL_PAP'],
  'Gynecologic Cancers, Robotic Gynecologic Surgery, Cervical Cancer, Ovarian Cancer, Uterine Cancer, Vaginal Cancer, Vulvar Cancer, Endometrial Cancer, Gestational Tophoblastic Neoplasia': ['OVARIAN_UTERINE_CERVICAL_CANCER', 'CERVICAL_CANCER_ABNORMAL_PAP'],
  
  // OB/GYN - Uterine Fibroids
  'Uterine fibroids': ['UTERINE_FIBROIDS'],
  'Vaginal surgery': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  'Sterilization': ['CONTRACEPTION_FAMILY_PLANNING'],
  
  // OB/GYN - Prolapse & Incontinence
  'Prolapse': ['PROLAPSE'],
  'Pelvic organ prolapse': ['PROLAPSE'],
  'Pelvic floor disorders': ['PROLAPSE'],
  'Pelvic floor disorders, Prolapse, Urinary/fecal incontinence, Birth trauma, Urogenital fistulas': ['PROLAPSE', 'FEMALE_INCONTINENCE'],
  'Pelvic floor disorders, Fistulae, Complex lower urinary tract injuries, Congenital anomalies': ['PROLAPSE', 'FEMALE_INCONTINENCE'],
  'Pelvic organ prolapse, Urinary incontinence, Fecal incontinence, Robotic & minimally invasive surgery': ['PROLAPSE', 'FEMALE_INCONTINENCE'],
  'Urinary incontinence': ['FEMALE_INCONTINENCE'],
  'Urinary/fecal incontinence': ['FEMALE_INCONTINENCE'],
  'Fecal incontinence': ['FEMALE_INCONTINENCE'],
  'Birth trauma': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  'Urogenital fistulas': ['FEMALE_INCONTINENCE'],
  'Fistulae': ['FEMALE_INCONTINENCE'],
  'Complex lower urinary tract injuries': ['FEMALE_INCONTINENCE'],
  'Congenital anomalies': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  'Pelvic floor': ['PROLAPSE'],
  'Robotic & minimally invasive surgery': ['GENERAL_OBSTETRICS_GYNECOLOGY'],
  
  // Oncology - General
  'General oncology': ['GENERAL_ONCOLOGY'],
  'Hematology': ['HEMATOLOGY'],
  'General oncology, Hematology': ['GENERAL_ONCOLOGY', 'HEMATOLOGY'],
  'Hematology, General Oncology': ['HEMATOLOGY', 'GENERAL_ONCOLOGY'],
  
  // Oncology - Breast
  'Breast': ['BREAST_CANCER'],
  'Breast cancer': ['BREAST_CANCER'],
  'Breast, Gynecologic cancers, Novel therapeutics': ['BREAST_CANCER', 'OVARIAN_UTERINE_CERVICAL_CANCER'],
  'Breast surgery': ['BREAST_CANCER'],
  'Breast surgery, Multidisciplinary care': ['BREAST_CANCER'],
  'Melanoma, Breast cancer, Sarcoma': ['MELANOMA', 'BREAST_CANCER', 'SARCOMAS'],
  
  // Oncology - GI
  'GI oncology': ['COLON_CANCER'],
  'Pancreatic cancer': ['PANCREATIC_CANCER'],
  'GI oncology, Pancreatic cancer': ['COLON_CANCER', 'PANCREATIC_CANCER'],
  'Gastrointestinal cancers': ['COLON_CANCER'],
  'GI cancers': ['COLON_CANCER'],
  'Colon Cancer': ['COLON_CANCER'],
  'Pancreating Cancer': ['PANCREATIC_CANCER'],
  
  // Oncology - GU
  'Genitourinary cancers': ['PROSTATE_CANCER'],
  'GU malignancies': ['PROSTATE_CANCER'],
  'GU': ['PROSTATE_CANCER'],
  'Bladder': ['PROSTATE_CANCER'],
  'Prostate': ['PROSTATE_CANCER'],
  'Kidney': ['PROSTATE_CANCER'],
  'Testicular': ['TESTICULAR_CANCER'],
  'Genitourinary cancers, Bladder, Prostate, Kidney, Testicular': ['PROSTATE_CANCER', 'TESTICULAR_CANCER'],
  'Advanced prostate cancer': ['PROSTATE_CANCER'],
  'Advanced prostate cancer, GU malignancies': ['PROSTATE_CANCER'],
  'Prostate cancer': ['PROSTATE_CANCER'],
  'Testicular cancer': ['TESTICULAR_CANCER'],
  
  // Oncology - Head & Neck, Lung
  'Head & Neck': ['HEAD_NECK_CANCER'],
  'Head & Neck cancer': ['HEAD_NECK_CANCER'],
  'Lung': ['LUNG_CANCER'],
  'Lung cancer': ['LUNG_CANCER'],
  'Lung, Esophageal, Head & Neck cancer': ['LUNG_CANCER', 'HEAD_NECK_CANCER'],
  'Head & Neck, Lung cancer, Multimodality therapy': ['HEAD_NECK_CANCER', 'LUNG_CANCER'],
  
  // Oncology - Lymphoma & Leukemia
  'Lymphoma': ['LYMPHOMA'],
  'Lymphoma, CLL, CAR T-cell therapy': ['LYMPHOMA'],
  'CLL': ['HEMATOLOGY'],
  'CAR T-cell therapy': ['HEMATOLOGY'],
  
  // Oncology - Sarcoma
  'Sarcoma': ['SARCOMAS'],
  'Sarcomas': ['SARCOMAS'],
  'Bone & Soft Tissue Sarcomas': ['SARCOMAS'],
  'Bone & Soft Tissue Cancers': ['SARCOMAS'],
  'Bone & Soft Tissue Tumors': ['SARCOMAS'],
  'Pediatric Bone & Soft Tissue Sarcomas': ['SARCOMAS'],
  'Sarcomas, Neuroblastoma, Solid Tumors, Adolescent & Young Adult Cancers': ['SARCOMAS'],
  
  // Oncology - Pediatric
  'Solid tumors': ['GENERAL_ONCOLOGY'],
  'Pediatric oncology': ['GENERAL_ONCOLOGY'],
  'Solid tumors, Pediatric oncology': ['GENERAL_ONCOLOGY'],
  'AYA oncology': ['GENERAL_ONCOLOGY'],
  'Pediatric hematologic malignancies': ['HEMATOLOGY'],
  'AYA oncology, Pediatric hematologic malignancies': ['GENERAL_ONCOLOGY', 'HEMATOLOGY'],
  
  // Oncology - Melanoma
  'Melanoma': ['MELANOMA'],
  'Skin': ['MELANOMA'],
  
  // Oncology - Radiation
  'Oligometastasis': ['GENERAL_ONCOLOGY'],
  'Radiotherapy': ['GENERAL_ONCOLOGY'],
  'Radio-immunotherapy': ['GENERAL_ONCOLOGY'],
  'Oligometastasis, Radiotherapy, Radio-immunotherapy': ['GENERAL_ONCOLOGY'],
  'General radiation oncology': ['GENERAL_ONCOLOGY'],
  'General radiation oncology, Head & Neck, GU, Breast': ['GENERAL_ONCOLOGY', 'HEAD_NECK_CANCER', 'PROSTATE_CANCER', 'BREAST_CANCER'],
  'SRS': ['GENERAL_ONCOLOGY'],
  'IMRT': ['GENERAL_ONCOLOGY'],
  'Brain': ['BRAIN_TUMORS'],
  'SRS, IMRT, Brain, Breast, GI cancers': ['GENERAL_ONCOLOGY', 'BRAIN_TUMORS', 'BREAST_CANCER', 'COLON_CANCER'],
  'Esophageal': ['COLON_CANCER'],
  
  // Oncology - Other
  'Multidisciplinary cancer care': ['GENERAL_ONCOLOGY'],
  'Multidisciplinary care': ['GENERAL_ONCOLOGY'],
  'Multimodality therapy': ['GENERAL_ONCOLOGY'],
  'Novel therapeutics': ['GENERAL_ONCOLOGY'],
  'Clinical trials': ['GENERAL_ONCOLOGY'],
  'Comprehensive longitudinal care': ['GENERAL_ONCOLOGY'],
  
  // Orthopedics - Hip
  'Hip': ['HIP'],
  'Hip Surgery': ['HIP'],
  'Hip Replacement': ['HIP'],
  'Hip Problems': ['HIP'],
  'Shoulder, Hip, Sports Medicine': ['SHOULDER_HIP_SPORTS_MEDICINE'],
  
  // Orthopedics - Knee
  'Knee': ['KNEE'],
  'Knee Surgery': ['KNEE'],
  'Knee Replacement': ['KNEE'],
  'Knee Reconstruction': ['KNEE'],
  'Knee Injuries': ['KNEE'],
  'Knee, Wrist, Ankle': ['KNEE_WRIST_ANKLE'],
  'Total Knee Arthroplasty': ['KNEE'],
  'Total Hip & Knee Replacement (robotic-assisted)': ['HIP', 'KNEE'],
  'Robotic-assisted Knee Replacement': ['KNEE'],
  'Robotic Knee Replacement': ['KNEE'],
  'Meniscus Repair and Transplantation': ['KNEE'],
  'Patellar Instability': ['KNEE'],
  
  // Orthopedics - Shoulder
  'Shoulder': ['SHOULDER_ELBOW_SPORTS_MEDICINE'],
  'Shoulder Surgery': ['SHOULDER_ELBOW_SPORTS_MEDICINE'],
  'Shoulder & Elbow Surgery': ['SHOULDER_ELBOW_SPORTS_MEDICINE'],
  'Shoulder & Elbow; Sports Medicine': ['SHOULDER_HIP_SPORTS_MEDICINE'],
  'Shoulder Replacement': ['SHOULDER_ELBOW_SPORTS_MEDICINE'],
  'Shoulder Injuries': ['SHOULDER_ELBOW_SPORTS_MEDICINE'],
  'Shoulder Instability': ['SHOULDER_ELBOW_SPORTS_MEDICINE'],
  'Shoulder Tendonitis': ['SHOULDER_ELBOW_SPORTS_MEDICINE'],
  'Arthroscopic Shoulder Surgery': ['SHOULDER_ELBOW_SPORTS_MEDICINE'],
  'Arthroscopic Shoulder/Knee/Hip/Elbow/Ankle': ['SHOULDER_ELBOW_SPORTS_MEDICINE', 'HIP', 'KNEE', 'ELBOW', 'FOOT_ANKLE', 'SPORTS_MEDICINE'],
  'Shoulder, Hip, Sports Medicine': ['SHOULDER_HIP_SPORTS_MEDICINE'],
  
  // Orthopedics - Hand & Wrist
  'Hand': ['HAND'],
  'Hand Surgery': ['HAND'],
  'Hand & Wrist Surgery': ['HAND_WRIST'],
  'Hand and Wrist Surgery': ['HAND_WRIST'],
  'Hand/Wrist/Elbow Surgery': ['HAND_WRIST', 'ELBOW'],
  'Hand/Wrist/Elbow': ['HAND_WRIST', 'ELBOW'],
  'Wrist Surgery': ['HAND_WRIST'],
  'Hand & Wrist Arthritis': ['HAND_WRIST', 'OSTEOARTHRITIS'],
  'Hand & Wrist Surgery, Congenital Hand Reconstruction, Peripheral Nerve Injuries, Osteoarthritis': ['HAND_WRIST', 'OSTEOARTHRITIS'],
  'Hand and Wrist Surgery, Congenital Hand Reconstruction, Pediatric Hand and Wrist Surgery, Peripheral Nerve Injuries': ['HAND_WRIST'],
  'Congenital Hand': ['HAND'],
  'Congenital Hand Reconstruction': ['HAND'],
  'Pediatric Hand and Wrist Surgery': ['HAND_WRIST'],
  'Pediatric Upper Extremity': ['HAND_WRIST'],
  'Hand Surgery – Orthopaedics': ['HAND'],
  
  // Orthopedics - Elbow
  'Elbow': ['ELBOW'],
  'Elbow Surgery': ['ELBOW'],
  'Pediatric Elbow Surgery': ['ELBOW'],
  
  // Orthopedics - Foot & Ankle
  'Foot & Ankle': ['FOOT_ANKLE'],
  'Foot Surgery': ['FOOT_ANKLE'],
  'Ankle Surgery': ['FOOT_ANKLE'],
  'Foot/Ankle Surgery': ['FOOT_ANKLE'],
  'Foot/Ankle Fractures': ['FOOT_ANKLE', 'FRACTURE'],
  'Ankle Arthroscopy': ['FOOT_ANKLE'],
  'Total Ankle Replacement': ['FOOT_ANKLE'],
  'Bunion Correction': ['FOOT_ANKLE'],
  'Minimally Invasive Foot Surgery': ['FOOT_ANKLE'],
  
  // Orthopedics - Sports Medicine
  'Sports Medicine': ['SPORTS_MEDICINE'],
  'Sports Injuries': ['SPORTS_MEDICINE'],
  'Arthroscopy': ['SPORTS_MEDICINE'],
  'Arthroscopic Surgery': ['SPORTS_MEDICINE'],
  'Ligament Reconstruction': ['SPORTS_MEDICINE'],
  'Tendon Repair': ['SPORTS_MEDICINE'],
  'Tendonitis': ['SPORTS_MEDICINE'],
  'Instability': ['SPORTS_MEDICINE'],
  
  // Orthopedics - Fracture
  'Fracture': ['FRACTURE'],
  'Cerebral Palsy': ['CEREBRAL_PALSY'],
  'Fracture Care': ['FRACTURE_CARE'],
  'Trauma Orthopaedic Surgery': ['FRACTURE'],
  'Trauma Orthopaedic Surgery, Fracture Care': ['FRACTURE', 'FRACTURE_CARE'],
  'Complex Fractures (Upper & Lower Extremity)': ['FRACTURE'],
  'Periarticular Fractures': ['FRACTURE'],
  'Polytrauma': ['FRACTURE'],
  'Trauma': ['FRACTURE'],
  'Complex Fractures (Upper & Lower Extremity), Periarticular Fractures, Polytrauma': ['FRACTURE'],
  'Pediatric Fracture Care': ['FRACTURE_CARE'],
  
  // Orthopedics - Osteoarthritis & Joint Replacement
  'Osteoarthritis': ['OSTEOARTHRITIS'],
  'Joint Replacement': ['OSTEOARTHRITIS'],
  'Total Joint Replacement': ['OSTEOARTHRITIS'],
  'Revision Total Joint Replacement': ['OSTEOARTHRITIS'],
  'Joint Reconstruction': ['OSTEOARTHRITIS'],
  
  // Orthopedics - Spine & Scoliosis
  'Hip Surgery, Knee Surgery, Fracture Care, Spinal Cord Disorders, Scoliosis, Cerebral Palsy, Acute & Chronic Injuries, Limb Deformities, Joint Replacement': ['HIP', 'KNEE', 'FRACTURE_CARE', 'SPINE', 'SCOLIOSIS'],
  'Leg Length Discrepancies': ['OSTEOARTHRITIS'],
  'Limb Deformities': ['OSTEOARTHRITIS'],
  'Limb Salvage': ['OSTEOARTHRITIS'],
  'Pediatric Hip/Knee/Shoulder/Elbow': ['HIP', 'KNEE', 'SHOULDER_ELBOW_SPORTS_MEDICINE', 'ELBOW'],
  'Pediatric Hip/Knee/Shoulder/Elbow, Scoliosis, Trauma, Joint Replacement': ['HIP', 'KNEE', 'SHOULDER_ELBOW_SPORTS_MEDICINE', 'ELBOW', 'SCOLIOSIS', 'FRACTURE'],
  'Deformity Correction Surgery': ['OSTEOARTHRITIS'],
  'Acquired Extremity Deformities': ['OSTEOARTHRITIS'],
  'Overuse Musculoskeletal Injuries': ['SPORTS_MEDICINE'],
  'Acute & Chronic Injuries': ['FRACTURE'],
  'Pediatric Neck Surgery': ['SPINE'],
  'Pediatric Wrist Surgery': ['HAND_WRIST'],
  'Back Surgery': ['SPINE'],
  'Spinal Cord Disorders': ['SPINE'],
  'Cerebral Palsy': ['GENERAL_NEUROLOGY'],
  
  // Orthopedics - Other
  'Upper Extremity Surgery': ['HAND_WRIST', 'ELBOW'],
  'Upper Extremity Trauma': ['FRACTURE'],
  'Peripheral Nerve': ['HAND_WRIST'],
  'Peripheral Nerve Surgery': ['HAND_WRIST'],
  'Peripheral Nerve Injuries': ['HAND_WRIST'],
  'Minimally Invasive Surgery': ['SPORTS_MEDICINE'],
  'Advanced surgical techniques': ['GENERAL_ONCOLOGY'],
  
  // Urology - General
  'General Urology': ['GENERAL_UROLOGY'],
  'Urologic Oncology; General Urology': ['UROLOGIC_ONCOLOGY'],
  
  // Urology - Prostate
  'Prostate Cancer': ['PROSTATE_CANCER'],
  'Prostate cancer': ['PROSTATE_CANCER'],
  'Testis Cancer, Prostate Cancer, Bladder Cancer, Kidney Cancer': ['TESTICULAR_CANCER', 'PROSTATE_CANCER', 'BLADDER', 'KIDNEY'],
  'Minimally Invasive & Robotic Urologic Surgery, Bladder Cancer, Prostate Cancer': ['PROSTATE_CANCER', 'BLADDER'],
  'Prostate cancer, Kidney cancer, Testicular cancer, Focal therapy, Robotic & minimally invasive surgery': ['PROSTATE_CANCER', 'KIDNEY', 'TESTICULAR_CANCER'],
  'Prostate cancer, Kidney cancer, Robotic & minimally invasive surgery': ['PROSTATE_CANCER', 'KIDNEY'],
  'Testicular Cancer, Prostate Cancer': ['TESTICULAR_CANCER', 'PROSTATE_CANCER'],
  'BPH': ['PROSTATE'],
  'Prostate cancer screening': ['PROSTATE_CANCER'],
  'Complications after prostate cancer treatment': ['PROSTATE_CANCER'],
  
  // Urology - Bladder & Kidney
  'Bladder Cancer': ['BLADDER'],
  'Bladder Cancer, Penile Cancer': ['BLADDER'],
  'Kidney cancer': ['KIDNEY'],
  'Testicular cancer': ['TESTICULAR_CANCER'],
  'Testicular Cancer': ['TESTICULAR_CANCER'],
  'Testicular': ['TESTICULAR_CANCER'],
  
  // Urology - Stones & Hematuria
  'Stones': ['STONES'],
  'Kidney stones or severe flank pain': ['STONES'],
  'Pediatric stone disease': ['STONES'],
  'Hematuria': ['GENERAL_UROLOGY'],
  'BPH, Stones, Hematuria, Prostate cancer screening': ['PROSTATE', 'STONES', 'GENERAL_UROLOGY', 'PROSTATE_CANCER'],
  
  // Urology - Erectile Dysfunction & Infertility
  'Erectile dysfunction': ['ERECTILE_DYSFUNCTION'],
  'Erectile Dysfunction': ['ERECTILE_DYSFUNCTION'],
  'Male infertility': ['MALE_INFERTILITY'],
  'Male Infertility': ['MALE_INFERTILITY'],
  'Vasectomy': ['MALE_INFERTILITY'],
  'Varicocele': ['MALE_INFERTILITY'],
  'Vasectomy reversal': ['MALE_INFERTILITY'],
  'Hypogonadism': ['ERECTILE_DYSFUNCTION'],
  'Male infertility, Vasectomy reversal, Varicocele, Erectile dysfunction, Hypogonadism': ['MALE_INFERTILITY', 'ERECTILE_DYSFUNCTION'],
  'Male Infertility, Vasectomy, Varicocele, Erectile dysfunction, etc.': ['MALE_INFERTILITY', 'ERECTILE_DYSFUNCTION'],
  'Erectile Dysfunction, Female/Male Incontinence, Ureteral Strictures, Fistula Repair': ['ERECTILE_DYSFUNCTION', 'URINARY_INCONTINENCE', 'URETHRAL_STRICTURE'],
  
  // Urology - Incontinence
  'Urinary incontinence': ['URINARY_INCONTINENCE'],
  'Urinary incontinence, Pelvic organ prolapse, Reconstructive urology': ['URINARY_INCONTINENCE', 'PROLAPSE'],
  'Female/Male Incontinence': ['URINARY_INCONTINENCE'],
  'Pelvic organ prolapse': ['PROLAPSE'],
  'Reconstructive urology': ['GENERAL_UROLOGY'],
  'Fistula Repair': ['GENERAL_UROLOGY'],
  
  // Urology - Stricture
  'Urethral stricture': ['URETHRAL_STRICTURE'],
  'Urethroplasty': ['URETHRAL_STRICTURE'],
  'Ureteral reconstruction': ['URETHRAL_STRICTURE'],
  'Ureteral Strictures': ['URETHRAL_STRICTURE'],
  'Urethral stricture, Urethroplasty, Ureteral reconstruction, Complications after prostate cancer treatment': ['URETHRAL_STRICTURE', 'PROSTATE_CANCER'],
  
  // Urology - Pediatric
  'Pediatric Urology': ['PEDIATRIC_UROLOGY'],
  'Hypospadias': ['PEDIATRIC_UROLOGY'],
  'Vesicoureteral reflux': ['PEDIATRIC_UROLOGY'],
  'Undescended testicle': ['PEDIATRIC_UROLOGY'],
  'Hypospadias, Vesicoureteral reflux, Undescended testicle, Pediatric stone disease': ['PEDIATRIC_UROLOGY', 'STONES'],
  
  // Urology - Surgery
  'Robotic surgery': ['GENERAL_UROLOGY'],
  'Kidney/Prostate/Bladder surgery': ['KIDNEY', 'PROSTATE', 'BLADDER'],
  'Complex minimally invasive urology': ['GENERAL_UROLOGY'],
  'Robotic & minimally invasive surgery': ['GENERAL_UROLOGY'],
  'Focal therapy': ['PROSTATE_CANCER'],
  
  // Cardiac Surgery
  'Aortic Surgery, Coronary Revascularization, Mitral and Tricuspid Valve Pathology, Cardiac Tumors, Heart Defects, Minimally Invasive & Robotic Heart Surgery, Aortic Aneurysms, Aortic Dissection, Atrial Fibrillation Surgery': ['VALVE_DISEASE', 'AORTIC_ANEURYSMS', 'ATRIAL_FIBRILLATION'],
  'Aotric Surgery, Ventricular Assist Devices, Heart Transplant, Heart Failure': ['AORTIC_DISEASE', 'VENTRICULAR_ASSIST_DEVICES', 'HEART_TRANSPLANT', 'HEART_FAILURE'],
  'Mechanical Circulatory Support, Heart Transplant, Heart Failure, Chief, Section of Cardiac Surgery': ['VENTRICULAR_ASSIST_DEVICES', 'HEART_TRANSPLANT', 'HEART_FAILURE'],
  'Thoracic Surgery, Cardiac Surgery, Transplant, Coronary Artery Bypass Surgery, Mechanical Circulatory Support': ['HEART_TRANSPLANT', 'VENTRICULAR_ASSIST_DEVICES'],
  'Robotic Heart Surgery, Atrial Fibrillation Surgery, Total Endoscopic Coronary Artery Bypass (TECAB) Surgery, Minimally Invasive Surgery': ['ATRIAL_FIBRILLATION'],
  'Robotic Heart Surgery, Heart Failure, Arrhythmias, Coronary Artery Bypass Surgery, Minimally Invasive Cardiac Surgery': ['HEART_FAILURE', 'ARRHYTHMIAS'],
  'Neonatal Cardiac Surgery, Venticular Assist Devices, Heart Transplant, Congenital Heart Disease, Aortic Aneurysms, Heart Valve Disease': ['HEART_TRANSPLANT', 'VENTRICULAR_ASSIST_DEVICES', 'ADULT_CONGENITAL_HEART_DISEASE', 'AORTIC_ANEURYSMS', 'VALVE_DISEASE'],
  'Ventricular Assist Devices (VADs), Heart Transplant, Valvuloplasty, Heart Failure, Artificial Hearts, Minimally Invasive Cardiac Surgery, Bloodless Heart Surgery': ['VENTRICULAR_ASSIST_DEVICES', 'HEART_TRANSPLANT', 'HEART_FAILURE'],
  'Cardiac Synchronization Therapy, Ventricular Assist Devices, Heart Transplant, Heart Failure, Cardiac Critical Care, Women\'s Heart Disease, Cardiac Amyloidosis': ['VENTRICULAR_ASSIST_DEVICES', 'HEART_TRANSPLANT', 'HEART_FAILURE'],
  'Transcatheter Aortic Valve Replacement (TAVR), Carotid Artery Disease, Ventricular Assist Devices, Transcatheter Mitral Valve Repair (MitraClip), Valve Disease, Coronary Artery Disease, Peripheral Arterial Disease': ['VALVE_DISEASE', 'VENTRICULAR_ASSIST_DEVICES', 'CORONARY_ARTERY_DISEASE', 'PERIPHERAL_ARTERIAL_DISEASE'],
  'Mechanical Circulatory Support': ['VENTRICULAR_ASSIST_DEVICES'],
  'LVAD': ['VENTRICULAR_ASSIST_DEVICES'],
  'Cardiac Amyloidosis': ['CARDIOMYOPATHY'],
  'Advanced Heart Failure, Transplant, Mechanical Circulatory Support, LVAD, Cardiac Amyloidosis': ['HEART_FAILURE', 'HEART_TRANSPLANT', 'VENTRICULAR_ASSIST_DEVICES', 'CARDIOMYOPATHY'],
  
  // Sleep & Other
  'Insomnia, Sleep Disorders, Obstructive Sleep Apnea, Narcolepsy, Central Sleep Apnea, Periodic Limb Movement Disorder, Parasomnias': ['GENERAL_NEUROLOGY'],
  'Insomnia, Sleep Disorders, Obstructive Sleep Apnea, Narcolepsy, Central Sleep Apnea, Periodic Limb Movement Disorder, Parasomnias, Migraine Headaches, Restless Legs Syndrome': ['GENERAL_NEUROLOGY', 'HEADACHE_DISORDERS_CHRONIC_MIGRAINE'],
  'Insomnia': ['GENERAL_NEUROLOGY'],
  'Sleep Disorders': ['GENERAL_NEUROLOGY'],
  
  // Catch-all for others
  'etc.': ['GENERAL_UROLOGY'],
  'Chief': ['GENERAL_CARDIOLOGY'],
  'Section of Cardiac Surgery': ['GENERAL_CARDIOLOGY']
};

/**
 * Map a physician's expertise area to normalized enum(s)
 * @param {string} expertise - Raw expertise string from physician data
 * @returns {Array} Array of normalized expertise enum keys
 */
function mapPhysicianExpertiseToEnum(expertise) {
  if (!expertise || typeof expertise !== 'string') {
    return [];
  }
  
  const trimmedExpertise = expertise.trim();
  
  // Direct lookup
  if (PHYSICIAN_EXPERTISE_MAPPING[trimmedExpertise]) {
    return PHYSICIAN_EXPERTISE_MAPPING[trimmedExpertise];
  }
  
  // Return empty if no mapping found
  return [];
}

/**
 * Map all expertise areas for a physician
 * @param {Array} expertiseAreas - Array of expertise area strings
 * @returns {Array} Array of unique normalized expertise enum keys
 */
function mapAllPhysicianExpertise(expertiseAreas) {
  if (!Array.isArray(expertiseAreas)) {
    return [];
  }
  
  const allEnums = new Set();
  
  expertiseAreas.forEach(expertise => {
    const enums = mapPhysicianExpertiseToEnum(expertise);
    enums.forEach(e => allEnums.add(e));
  });
  
  return Array.from(allEnums);
}

module.exports = {
  PHYSICIAN_EXPERTISE_MAPPING,
  mapPhysicianExpertiseToEnum,
  mapAllPhysicianExpertise
};