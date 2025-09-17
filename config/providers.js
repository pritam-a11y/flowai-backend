const providers = {
  "ead urology": {
    provider_id: "ead_urology",
    name: "EAD Urology",
    business_name: "Ead Urology",
    doctor_name: "Dr. Daniel Ead",
    logo_url:
      "https://static.wixstatic.com/media/98ad52_10ebfcb7845c4b399bc2dca33938370c~mv2_d_4267_4000_s_4_2.jpg/v1/fill/w_272,h_248,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/EU-Final-Logo%5B1%5D.jpg",
    office_phone: "(954) 472 4072",
    from_email: "patientservices@myflowai.com",
    default_location: "1216 N University Dr Plantation FL 33322",
  },
  "precision imaging": {
    provider_id: "precision_imaging",
    name: "Precision Imaging",
    business_name: "Precision Imaging",
    doctor_name: "Precision Imaging Team",
    logo_url: "https://i.ibb.co/XxSpYFBT/precision.jpg",
    office_phone: "904-996-8100",
    from_email: "patientservices@myflowai.com",
    default_location: null,
  },
  "uchicago": {
    provider_id: "uchicago",
    name: "UChicago Medicine",
    business_name: "University of Chicago Medicine",
    doctor_name: "University of Chicago Medicine",
    logo_url: "https://edge.sitecorecloud.io/unichicagomc-81nbqnb3/media/images/ucmc/landing-pages/ucm-logo-horizontal.png",
    office_phone: "773-702-1000",
    from_email: "patientservices@myflowai.com",
    default_location: "TBD",
  },
};

/**
 * Get provider configuration by name (case-insensitive)
 * @param {string} providerName - Provider name from call analysis
 * @returns {object|null} Provider config or null if not found
 */
function getProviderConfig(providerName) {
  if (!providerName || typeof providerName !== "string") {
    return null;
  }

  const normalizedName = providerName.toLowerCase().trim();
  return providers[normalizedName] || null;
}

/**
 * Get default provider configuration (EAD Urology)
 * @returns {object} Default provider config
 */
function getDefaultProviderConfig() {
  return providers["ead urology"];
}

module.exports = {
  providers,
  getProviderConfig,
  getDefaultProviderConfig,
};
