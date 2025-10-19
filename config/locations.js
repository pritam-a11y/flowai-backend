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
    address: "1540 Business Center Drive, Suite B, Fleming Island, FL 32003",
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
    address: "10696 Old Saint Augustine Road, Jacksonville, FL 32257",
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
    name: "Saint Augustine",
    address: "1000 Plantation Island Drive South, Suite 1, Saint Augustine, FL 32080",
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
    address: "3900 Millenia Boulevard, Orlando, FL 32839",
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
    address: "5758 South Maryland Avenue, Chicago, IL 60637",
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
    address: "5700 South Maryland Avenue, Chicago, IL 60637", 
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
    address: "1101 South Canal Street, Suite 201 & 202, Chicago, IL 60607",
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
    address: "14290 South La Grange Road, Orland Park, IL 60462",
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
    address: "6701 West 159th Street, Tinley Park, IL 60477",
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
    address: "5201 South Willow Springs Road, Suite 340, La Grange, IL 60525",
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
    address: "5721 South Maryland Avenue, Chicago, IL 60637",
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

/**
 * Primary location configuration for physician matching
 * These are the fixed locations used for distance calculations
 */
const PRIMARY_LOCATIONS = [
  {
    id: 'hyde_park',
    name: 'Hyde Park',
    displayName: 'Hyde Park - Main Campus',
    address: '5758 South Maryland Avenue, Chicago, IL 60637',
    description: 'Center for Care & Discovery, DCAM, Comer Children\'s, Mitchell Hospital',
    hours: 'Hospital: 24/7; Clinics: Mon–Fri 8:00 am – 5:00 pm; DCAM: Mon–Sat 7:30 am – 6:00 pm',
    parking: 'Valet & garage parking; shuttle service between buildings'
  },
  {
    id: 'south_loop',
    name: 'South Loop',
    displayName: 'South Loop',
    address: '1101 South Canal Street Suite 201, Chicago, IL 60607',
    description: 'Outpatient clinic location',
    hours: 'Typical hours: Mon–Fri 8:00 am – 5:00 pm',
    parking: 'Garage parking with validation; metered street parking'
  },
  {
    id: 'river_east',
    name: 'River East',
    displayName: 'River East',
    address: '355 East Grand Avenue, Chicago, IL 60611',
    description: 'Outpatient clinic location',
    hours: 'Typical hours: Mon–Fri 8:00 am – 5:00 pm',
    parking: 'Garage parking with validation; metered street parking'
  },
  {
    id: 'orland_park',
    name: 'Orland Park',
    displayName: 'Orland Park — Center for Advanced Care',
    address: '14290 South La Grange Road, Orland Park, IL 60462',
    description: 'Outpatient clinic with on-site lab/imaging',
    hours: 'Typical hours: Mon–Fri 7:00 am – 5:00 pm',
    parking: 'Garage & street parking; on-site lab/imaging'
  },
  {
    id: 'tinley_park',
    name: 'Tinley Park',
    displayName: 'Tinley Park — UChicago Medicine at Ingalls',
    address: '6701 West 159th Street, Tinley Park, IL 60477',
    description: 'Ingalls outpatient location',
    hours: 'Typical hours: Mon–Fri 7:00 am – 7:00 pm',
    parking: 'Free on-site parking'
  },
  {
    id: 'harvey',
    name: 'Ingalls Memorial Hospital',
    displayName: 'Ingalls Memorial Hospital (Harvey, IL)',
    address: '71 West 156th Street, Harvey, IL 60426',
    description: 'Full hospital with clinics',
    hours: 'Hospital: 24/7; Clinics: Mon–Fri 8:00 am – 5:00 pm',
    parking: 'On-site parking available'
  },
  {
    id: 'crown_point',
    name: 'Crown Point',
    displayName: 'Crown Point',
    address: '10855 Virginia Street, Crown Point, IN 46307',
    description: 'Outpatient clinic location',
    hours: 'Typical hours: Mon–Fri 8:00 am – 5:00 pm',
    parking: 'On-site parking available'
  }
];

/**
 * Address mapping for normalizing physician location addresses
 * Maps various address formats to the canonical location addresses
 */
const ADDRESS_MAPPING = {
  // Hyde Park variations
  '5758 South Maryland Avenue, Chicago, IL, 60637': '5758 South Maryland Avenue, Chicago, IL 60637',
  '5721 South Maryland Avenue, Chicago, IL, 60637': '5758 South Maryland Avenue, Chicago, IL 60637',

  // South Loop variations
  '1101 South Canal Street Suite 201, Chicago, IL, 60607': '1101 South Canal Street Suite 201, Chicago, IL 60607',
  '1100 South Canal Street, Chicago, IL, 60607': '1101 South Canal Street Suite 201, Chicago, IL 60607',

  // River East variations
  '355 East Grand Avenue, Chicago, IL, 60611': '355 East Grand Avenue, Chicago, IL 60611',

  // Orland Park variations (normalize to "Road" not "Rd")
  '14290 South La Grange Rd, Orland Park, IL, 60462': '14290 South La Grange Road, Orland Park, IL 60462',
  '14290 South La Grange Road, Orland Park, IL, 60462': '14290 South La Grange Road, Orland Park, IL 60462',

  // Tinley Park variations (normalize to "Street" not "St")
  '6701 West 159th St, Tinley Park, IL, 60477': '6701 West 159th Street, Tinley Park, IL 60477',

  // Harvey variations
  '71 West 156th Street, Harvey, IL, 60426': '71 West 156th Street, Harvey, IL 60426',

  // Crown Point variations
  '10855 Virginia Street, Crown Point, IN, 46307': '10855 Virginia Street, Crown Point, IN 46307'
};

/**
 * Get the canonical address for a given address
 * @param {string} address - The address to normalize
 * @returns {string|null} The canonical address, or null if not in mapping
 */
function getCanonicalAddress(address) {
  return ADDRESS_MAPPING[address] || null;
}

/**
 * Get location details by canonical address
 * @param {string} address - The canonical address
 * @returns {Object|null} Location object or null if not found
 */
function getLocationByAddress(address) {
  return PRIMARY_LOCATIONS.find(loc => loc.address === address) || null;
}

/**
 * Get all canonical addresses for distance calculation
 * @returns {Array<string>} Array of canonical addresses
 */
function getAllCanonicalAddresses() {
  return PRIMARY_LOCATIONS.map(loc => loc.address);
}

const inlandImagingLocations = {
  spokaneValley: {
    name: "Spokane Valley",
    address: "12420 East Mission Avenue, Spokane Valley, WA 99216",
    zipCode: "99216",
    coordinates: {
      lat: 47.673889,
      lng: -117.079444
    },
    services: [
      "MRI Scan",
      "CT Scan",
      "Ultrasound",
      "X-Ray",
      "Mammography",
      "PET/CT",
      "Nuclear Medicine",
      "Bone Densitometry"
    ]
  },
  holyFamily: {
    name: "Holy Family",
    address: "5633 North Lidgerwood Street, Spokane, WA 99208",
    zipCode: "99208",
    coordinates: {
      lat: 47.703889,
      lng: -117.403611
    },
    services: [
      "MRI Scan",
      "CT Scan",
      "Ultrasound",
      "X-Ray",
      "Mammography"
    ]
  },
  southHill: {
    name: "South Hill",
    address: "606 South Cowley Street, Spokane, WA 99202",
    zipCode: "99202",
    coordinates: {
      lat: 47.650556,
      lng: -117.406389
    },
    services: [
      "MRI Scan",
      "CT Scan",
      "Ultrasound",
      "X-Ray",
      "Mammography",
      "PET/CT"
    ]
  },
  northpointe: {
    name: "Northpointe",
    address: "9601 North Nevada Street, Suite 200, Spokane, WA 99218",
    zipCode: "99218",
    coordinates: {
      lat: 47.752778,
      lng: -117.412500
    },
    services: [
      "MRI Scan",
      "CT Scan",
      "Ultrasound",
      "X-Ray"
    ]
  },
  coeurDAlene: {
    name: "Coeur d'Alene",
    address: "2003 Kootenai Health Way, Coeur d'Alene, ID 83814",
    zipCode: "83814",
    coordinates: {
      lat: 47.697222,
      lng: -116.795556
    },
    services: [
      "MRI Scan",
      "CT Scan",
      "Ultrasound",
      "X-Ray",
      "Mammography",
      "PET/CT",
      "Nuclear Medicine"
    ]
  },
  postFalls: {
    name: "Post Falls",
    address: "1300 East Mullan Avenue, Post Falls, ID 83854",
    zipCode: "83854",
    coordinates: {
      lat: 47.717500,
      lng: -116.935833
    },
    services: [
      "MRI Scan",
      "CT Scan",
      "Ultrasound",
      "X-Ray"
    ]
  },
  libertyLake: {
    name: "Liberty Lake",
    address: "16528 East Desmet Court, Building B, Liberty Lake, WA 99019",
    zipCode: "99019",
    coordinates: {
      lat: 47.669444,
      lng: -117.086944
    },
    services: [
      "MRI Scan",
      "CT Scan",
      "Ultrasound",
      "X-Ray"
    ]
  },
  valleyHospital: {
    name: "Valley Hospital",
    address: "12606 East Mission Avenue, Spokane Valley, WA 99216",
    zipCode: "99216",
    coordinates: {
      lat: 47.673611,
      lng: -117.076389
    },
    services: [
      "MRI Scan",
      "CT Scan",
      "Ultrasound",
      "X-Ray",
      "Emergency Imaging"
    ]
  }
};

const locations = {
  precision: precisionLocations,
  uchicago: uchicagoLocations,
  inlandImaging: inlandImagingLocations
};

module.exports = {
  locations,
  precisionLocations,
  uchicagoLocations,
  inlandImagingLocations,
  PRIMARY_LOCATIONS,
  ADDRESS_MAPPING,
  getCanonicalAddress,
  getLocationByAddress,
  getAllCanonicalAddresses
};