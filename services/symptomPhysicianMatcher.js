require('dotenv').config();
const openAISymptomClassifier = require('./openAISymptomClassifier');
const physiciansData = require('../config/physiciansData.json');
const { getExpertiseDisplayName } = require('../config/expertiseEnums');
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
   * Sort physician locations by distance from user address
   * @param {Array} locations - Array of location objects
   * @param {string} userAddress - User's address
   * @returns {Promise<Array>} Sorted locations with distance information
   */
  async sortLocationsByDistance(locations, userAddress) {
    if (!locations || locations.length === 0) {
      return [];
    }

    try {
      const destinations = locations.map(loc => loc.address);

      const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
        params: {
          key: this.googleMapsApiKey,
          origins: userAddress,
          destinations: destinations.join('|'),
          units: 'imperial',
          mode: 'driving'
        },
        timeout: 30000
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Google Maps API error: ${response.data.status}`);
      }

      const elements = response.data.rows[0]?.elements || [];
      const locationsWithDistance = [];

      locations.forEach((location, index) => {
        const element = elements[index];
        
        if (element && element.status === 'OK') {
          locationsWithDistance.push({
            name: location.name,
            address: this.truncateAddress(location.address),
            distance: element.distance.text,
            duration: element.duration.text,
            distanceValue: element.distance.value
          });
        } else {
          locationsWithDistance.push({
            name: location.name,
            address: this.truncateAddress(location.address),
            distance: null,
            duration: null,
            distanceValue: Number.MAX_SAFE_INTEGER
          });
        }
      });

      // Sort by distance
      locationsWithDistance.sort((a, b) => a.distanceValue - b.distanceValue);

      // Return without distanceValue
      return locationsWithDistance.map(loc => ({
        name: loc.name,
        address: loc.address,
        distance: loc.distance,
        duration: loc.duration
      }));

    } catch (error) {
      logger.error('Error calculating distances', {
        error: error.message,
        userAddress
      });
      
      // Return unsorted locations without distance on error
      return locations.map(loc => ({
        name: loc.name,
        address: this.truncateAddress(loc.address),
        distance: null,
        duration: null
      }));
    }
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

      // Step 1: Classify symptoms using OpenAI
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

      const expertiseEnum = classificationResult.expertiseEnum;
      const expertiseDisplayName = getExpertiseDisplayName(expertiseEnum);

      logger.info('Symptoms classified', {
        expertiseEnum,
        expertiseDisplayName
      });

      // Step 2: Find physicians with matching normalized expertise
      const matchingPhysicians = this.physicians.filter(physician => {
        // Check if physician has this expertise in their normalizedExpertise array
        return physician.normalizedExpertise && 
               physician.normalizedExpertise.includes(expertiseEnum);
      });

      if (matchingPhysicians.length === 0) {
        logger.info('No physicians found for expertise', {
          expertiseEnum,
          expertiseDisplayName
        });
        
        return {
          success: false,
          matchedExpertise: expertiseDisplayName,
          error: 'We are having trouble finding a physician based on the requested symptoms. Please try again or contact our office directly.'
        };
      }

      logger.info('Found matching physicians', {
        count: matchingPhysicians.length,
        expertiseEnum
      });

      // Step 3: Sort physicians by closest location distance
      const physiciansWithDistance = [];

      for (const physician of matchingPhysicians) {
        try {
          // Sort locations by distance
          const sortedLocations = await this.sortLocationsByDistance(
            physician.locations,
            address
          );

          // Use closest location's distance for physician ranking
          const closestDistance = sortedLocations[0]?.distanceValue || Number.MAX_SAFE_INTEGER;

          physiciansWithDistance.push({
            physician,
            sortedLocations,
            closestDistance
          });

        } catch (error) {
          logger.warn('Error sorting locations for physician', {
            error: error.message,
            physicianId: physician.id
          });
          
          // Add physician without distance sorting
          physiciansWithDistance.push({
            physician,
            sortedLocations: physician.locations.map(loc => ({
              name: loc.name,
              address: this.truncateAddress(loc.address),
              distance: null,
              duration: null
            })),
            closestDistance: Number.MAX_SAFE_INTEGER
          });
        }
      }

      // Sort physicians by closest location distance
      physiciansWithDistance.sort((a, b) => a.closestDistance - b.closestDistance);

      // Step 4: Take top 3 physicians and format response
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
          locations: item.sortedLocations
        };
      });

      logger.info('Successfully matched physicians to symptoms', {
        expertiseEnum,
        expertiseDisplayName,
        physiciansReturned: top3Physicians.length
      });

      return {
        success: true,
        matchedExpertise: expertiseDisplayName,
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
    symptomText = 'Unexplained weight loss',
    address = '123 Main St, Chicago, IL 60601'
  ) {
    logger.info('Testing symptom physician matcher', { symptomText, address });
    return await this.findPhysiciansBySymptoms(address, symptomText);
  }
}

module.exports = new SymptomPhysicianMatcher();