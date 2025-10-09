require('dotenv').config();
const openAISymptomClassifier = require('./openAISymptomClassifier');
const physiciansData = require('../config/physiciansData.json');
const { getExpertiseDisplayName } = require('../config/expertiseEnums');
const { getAllCanonicalAddresses } = require('../config/locations');
const axios = require('axios');
const logger = require('../utils/logger');

class SymptomPhysicianMatcher {
  constructor() {
    this.physicians = physiciansData.physicians;
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  }

  /**
   * Truncate address to only include up to Chicago
   * @param {string} address - Full address string
   * @returns {string} Truncated address up to Chicago
   */
  truncateAddress(address) {
    if (!address) return address;
    
    const chicagoIndex = address.indexOf('Chicago');
    
    if (chicagoIndex === -1) {
      return address;
    }
    
    return address.substring(0, chicagoIndex + 'Chicago'.length).trim();
  }

  /**
   * Calculate distances from user address to all primary locations
   * @param {string} userAddress - User's address
   * @returns {Promise<Map>} Map of address -> {distance, duration, distanceValue}
   */
  async calculateLocationDistances(userAddress) {
    const locationDistances = new Map();
    const canonicalAddresses = getAllCanonicalAddresses();

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
        params: {
          key: this.googleMapsApiKey,
          origins: userAddress,
          destinations: canonicalAddresses.join('|'),
          units: 'imperial',
          mode: 'driving'
        },
        timeout: 30000
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Google Maps API error: ${response.data.status}`);
      }

      const elements = response.data.rows[0]?.elements || [];

      canonicalAddresses.forEach((address, index) => {
        const element = elements[index];

        if (element && element.status === 'OK') {
          locationDistances.set(address, {
            distance: element.distance.text,
            duration: element.duration.text,
            distanceValue: element.distance.value
          });
        } else {
          locationDistances.set(address, {
            distance: null,
            duration: null,
            distanceValue: Number.MAX_SAFE_INTEGER
          });
        }
      });

    } catch (error) {
      logger.error('Error calculating location distances', {
        error: error.message,
        userAddress
      });

      // Return empty map on error - will be handled downstream
    }

    return locationDistances;
  }

  /**
   * Sort physician locations by distance using pre-calculated location distances
   * @param {Array} locations - Array of location objects
   * @param {Map} locationDistances - Pre-calculated distances map
   * @returns {Array} Sorted locations with distance information (includes distanceValue for ranking)
   */
  sortLocationsByDistance(locations, locationDistances) {
    if (!locations || locations.length === 0) {
      return [];
    }

    const locationsWithDistance = locations.map(location => {
      const distanceInfo = locationDistances.get(location.address);

      if (distanceInfo) {
        return {
          name: location.name,
          address: this.truncateAddress(location.address),
          distance: distanceInfo.distance,
          duration: distanceInfo.duration,
          distanceValue: distanceInfo.distanceValue
        };
      } else {
        return {
          name: location.name,
          address: this.truncateAddress(location.address),
          distance: null,
          duration: null,
          distanceValue: Number.MAX_SAFE_INTEGER
        };
      }
    });

    // Sort by distance
    locationsWithDistance.sort((a, b) => a.distanceValue - b.distanceValue);

    // Return WITH distanceValue for physician ranking (will be removed later for API response)
    return locationsWithDistance;
  }

  /**
   * Find physicians by symptom description and optional address
   * This is the main function for the Retell function call
   * 
   * @param {string} address - Patient's address
   * @param {string} symptomText - Patient's symptom description
   * @returns {Promise<Object>} Result with matched physicians
   */
  async findPhysiciansBySymptoms(address, symptomText) {
    try {
      // Input validation
      if (!symptomText || typeof symptomText !== 'string' || !symptomText.trim()) {
        return {
          success: false,
          error: 'Symptom description is required'
        };
      }

      if (!address || typeof address !== 'string' || !address.trim()) {
        return {
          success: false,
          error: 'Patient address is required'
        };
      }

      logger.info('Finding physicians by symptoms', {
        symptomLength: symptomText.length,
        address
      });

      // Step 1: Classify symptoms using OpenAI (returns array of up to 3 expertise enums)
      const classificationResult = await openAISymptomClassifier.classifySymptoms(symptomText);

      if (!classificationResult.success) {
        logger.error('Symptom classification failed', {
          error: classificationResult.error
        });

        return {
          success: false,
          error: 'We are having trouble finding a physician based on the requested symptoms. Please try again or contact our office directly.'
        };
      }

      const expertiseEnums = classificationResult.expertiseEnums; // Array of 1-3 enums
      const expertiseDisplayNames = expertiseEnums.map(e => getExpertiseDisplayName(e));

      logger.info('Symptoms classified', {
        expertiseEnums,
        expertiseDisplayNames,
        count: expertiseEnums.length
      });

      // Step 2: Find physicians with matching normalized expertise (ANY of the expertise areas)
      const matchingPhysicians = this.physicians.filter(physician => {
        // Check if physician has ANY of the expertise areas in their normalizedExpertise array
        return physician.normalizedExpertise &&
               physician.normalizedExpertise.some(e => expertiseEnums.includes(e));
      });

      if (matchingPhysicians.length === 0) {
        logger.info('No physicians found for any expertise area', {
          expertiseEnums,
          expertiseDisplayNames
        });

        return {
          success: false,
          matchedExpertise: expertiseDisplayNames.join(', '),
          error: 'We are having trouble finding a physician based on the requested symptoms. Please try again or contact our office directly.'
        };
      }

      logger.info('Found matching physicians', {
        count: matchingPhysicians.length,
        expertiseEnums
      });

      // Step 3: Calculate distances to all locations once
      const locationDistances = await this.calculateLocationDistances(address);

      logger.info('Calculated distances to all locations', {
        locationCount: locationDistances.size
      });

      // Step 4: Sort physicians by closest location distance
      const physiciansWithDistance = matchingPhysicians.map(physician => {
        // Sort this physician's locations by distance
        const sortedLocations = this.sortLocationsByDistance(
          physician.locations,
          locationDistances
        );

        // Get closest location's distance for physician ranking
        const closestLocation = sortedLocations[0];
        const closestDistance = closestLocation?.distanceValue || Number.MAX_SAFE_INTEGER;

        return {
          physician,
          sortedLocations,
          closestDistance
        };
      });

      // Sort physicians by closest location distance
      physiciansWithDistance.sort((a, b) => a.closestDistance - b.closestDistance);

      // Step 5: Take top 3 physicians and format response
      // Convert normalized expertise enums to display names for better readability
      const top3Physicians = physiciansWithDistance.slice(0, 3).map(item => {
        const displayExpertise = (item.physician.normalizedExpertise || []).map(enumKey => 
          getExpertiseDisplayName(enumKey)
        );
        
        return {
          name: item.physician.name,
          specialty: item.physician.specialty,
          areasOfExpertise: displayExpertise,
          languages: item.physician.languages || [],
          locations: item.sortedLocations.map(loc => ({
            name: loc.name,
            address: loc.address,
            distance: loc.distance,
            duration: loc.duration
          }))
        };
      });

      logger.info('Successfully matched physicians to symptoms', {
        expertiseEnums,
        expertiseDisplayNames,
        physiciansReturned: top3Physicians.length
      });

      return {
        success: true,
        matchedExpertise: expertiseDisplayNames.join(', '),
        matchedExpertiseAreas: expertiseDisplayNames, // Array for programmatic access
        userAddress: address,
        physicians: top3Physicians
      };

    } catch (error) {
      logger.error('Error in findPhysiciansBySymptoms', {
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: 'We are having trouble finding a physician based on the requested symptoms. Please try again or contact our office directly.'
      };
    }
  }

  /**
   * Test the matcher with sample symptoms
   * @param {string} symptomText - Test symptom description
   * @param {string} address - Test address
   * @returns {Promise<Object>} Test result
   */
  async test(
    symptomText = 'swollen ankle',
    address = '123 Main St, Chicago, IL 60601'
  ) {
    logger.info('Testing symptom physician matcher', { symptomText, address });
    return await this.findPhysiciansBySymptoms(address, symptomText);
  }
}

module.exports = new SymptomPhysicianMatcher();