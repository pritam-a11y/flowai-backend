const precisionLocations = {
  jacksonville: {
    name: "Jacksonville",
    address: "7860 Gate Pkwy, Unit 123, Jacksonville, FL 32256",
    zipCode: "32256",
    coordinates: {
      lat: 30.2659,
      lng: -81.5583
    },
    services: [
      "CT Scan",
      "MRI Scan",
      "Open MRI",
      "PET CT",
      "3D Mammography",
      "Ultrasound",
      "DEXA Bone Densitometry",
      "Digital X-Ray",
      "Full Body Screening",
      "Genetic Testing",
      "Lung Cancer Screening",
      "Prostate Cancer Screening"
    ]
  },
  jacksonvilleBeach: {
    name: "Jacksonville Beach",
    address: "14444 Beach Blvd, Suite 23, Jacksonville Beach, FL 32250",
    zipCode: "32250",
    coordinates: {
      lat: 30.2847,
      lng: -81.4142
    },
    services: [
      "CT Scan",
      "MRI Scan",
      "3D Mammography",
      "Ultrasound",
      "DEXA Bone Densitometry",
      "Digital X-Ray",
      "Full Body Screening",
      "Genetic Testing",
      "Lung Cancer Screening",
      "Prostate Cancer Screening"
    ]
  },
  flemingIsland: {
    name: "Fleming Island",
    address: "1540 Business Center Dr, Ste B, Fleming Island, FL 32003",
    zipCode: "32003",
    coordinates: {
      lat: 30.0924,
      lng: -81.7189
    },
    services: [
      "CT Scan",
      "MRI Scan",
      "3D Mammography",
      "Ultrasound",
      "DEXA Bone Densitometry",
      "Digital X-Ray",
      "Genetic Testing",
      "Lung Cancer Screening",
      "Prostate Cancer Screening"
    ]
  },
  mandarin: {
    name: "Mandarin",
    address: "10696 Old St Augustine Rd, Jacksonville, FL 32257",
    zipCode: "32257",
    coordinates: {
      lat: 30.1658,
      lng: -81.5883
    },
    services: [
      "MRI Scan",
      "Open Upright MRI",
      "3D Mammography",
      "Ultrasound",
      "Digital X-Ray"
    ]
  },
  stAugustine: {
    name: "St. Augustine",
    address: "1000 Plantation Island Dr S, Ste 1, St. Augustine, FL 32080",
    zipCode: "32080",
    coordinates: {
      lat: 29.9012,
      lng: -81.3124
    },
    services: [
      "CT Scan",
      "MRI Scan",
      "PET CT",
      "3D Mammography",
      "Ultrasound",
      "DEXA Bone Densitometry",
      "Digital X-Ray",
      "Genetic Testing",
      "Lung Cancer Screening",
      "Prostate Cancer Screening"
    ]
  },
  orlando: {
    name: "Orlando – Millenia",
    address: "3900 Millenia Blvd, Orlando, FL 32839",
    zipCode: "32839",
    coordinates: {
      lat: 28.4969,
      lng: -81.4285
    },
    services: [
      "MRI Scan"
    ]
  }
};

const uchicagoLocations = {
  hydeParkDCAM: {
    name: "Hyde Park — Duchossois Center for Advanced Medicine (DCAM)",
    address: "5758 S. Maryland Ave., Chicago, IL 60637",
    zipCode: "60637",
    coordinates: {
      lat: 41.7902987,
      lng: -87.6053771
    },
    services: [
      "Cardiology",
      "Urology", 
      "Neurology",
      "Oncology",
      "Gastroenterology",
      "Radiology",
      "Orthopedics",
      "Obstetrics and Gynecology"
    ]
  },
  hydeParkCCD: {
    name: "Center for Care & Discovery (CCD)",
    address: "5700 S. Maryland Ave., Chicago, IL 60637", 
    zipCode: "60637",
    coordinates: {
      lat: 41.7910241,
      lng: -87.604903
    },
    services: [
      "Gastroenterology",
      "Radiology",
      "Obstetrics and Gynecology"
    ]
  },
  southLoop: {
    name: "South Loop",
    address: "1101 S. Canal St., Suite 201 & 202, Chicago, IL 60607",
    zipCode: "60607",
    coordinates: {
      lat: 41.8688617,
      lng: -87.63889259999999
    },
    services: [
      "Cardiology",
      "Urology",
      "Neurology", 
      "Oncology",
      "Gastroenterology",
      "Radiology",
      "Orthopedics",
      "Obstetrics and Gynecology"
    ]
  },
  orlandPark: {
    name: "Orland Park — Center for Advanced Care",
    address: "14290 S. La Grange Rd., Orland Park, IL 60462",
    zipCode: "60462",
    coordinates: {
      lat: 41.6308805,
      lng: -87.8545918
    },
    services: [
      "Cardiology",
      "Urology",
      "Neurology",
      "Oncology", 
      "Gastroenterology",
      "Radiology",
      "Orthopedics",
      "Obstetrics and Gynecology"
    ]
  },
  tinleyPark: {
    name: "Tinley Park — UChicago Medicine at Ingalls",
    address: "6701 W. 159th St., Tinley Park, IL 60477",
    zipCode: "60477",
    coordinates: {
      lat: 41.60168729999999,
      lng: -87.7818673
    },
    services: [
      "Cardiology",
      "Urology", 
      "Neurology",
      "Oncology",
      "Gastroenterology",
      "Radiology",
      "Orthopedics",
      "Obstetrics and Gynecology"
    ]
  },
  laGrange: {
    name: "La Grange — UChicago Medicine Orthopaedics (AdventHealth Campus)",
    address: "5201 South Willow Springs Rd., Suite 340, La Grange, IL 60525",
    zipCode: "60525",
    coordinates: {
      lat: 41.7956417,
      lng: -87.8867673
    },
    services: [
      "Orthopedics"
    ]
  },
  comerChildrens: {
    name: "Comer Children's Hospital",
    address: "5721 S. Maryland Ave., Chicago, IL 60637",
    zipCode: "60637", 
    coordinates: {
      lat: 41.7901847,
      lng: -87.60458489999999
    },
    services: [
      "Pediatric Orthopedics"
    ]
  }
};

const locations = {
  precision: precisionLocations,
  uchicago: uchicagoLocations
};

module.exports = {
  locations,
  precisionLocations,
  uchicagoLocations
};