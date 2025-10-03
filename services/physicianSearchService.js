require('dotenv').config();
const physiciansData = require('../config/physiciansData.json');
const axios = require('axios');
const logger = require('../utils/logger');

class PhysicianSearchService {
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
    
    // Find "Chicago" in the address
    const chicagoIndex = address.indexOf('Chicago');
    
    if (chicagoIndex === -1) {
      // If Chicago is not found, return the original address
      return address;
    }
    
    // Return address up to and including "Chicago"
    return address.substring(0, chicagoIndex + 'Chicago'.length).trim();
  }

  /**
   * Search for physicians by specialty and optionally by first name
   * @param {string} specialty - Required specialty (normalized, e.g., 'CARDIOLOGY')
   * @param {string} firstName - Optional first name (case-insensitive exact match)
   * @param {string} userAddress - Optional user address for distance sorting
   * @returns {Promise<Object>} Search results with up to 5 physicians
   */
  async searchPhysicians(specialty, firstName = null, userAddress = null) {
    try {
      // Normalize specialty to uppercase
      const normalizedSpecialty = specialty.toUpperCase().trim();
      
      // Filter by specialty
      let filteredPhysicians = this.physicians.filter(
        p => p.specialty === normalizedSpecialty
      );

      if (filteredPhysicians.length === 0) {
        return {
          success: false,
          message: `No physicians found for specialty: ${normalizedSpecialty}`,
          physicians: []
        };
      }

      // Filter by first name if provided (case-insensitive exact match)
      if (firstName) {
        const normalizedFirstName = firstName.trim().toUpperCase();
        filteredPhysicians = filteredPhysicians.filter(
          p => p.firstName.toUpperCase() === normalizedFirstName
        );

        if (filteredPhysicians.length === 0) {
          return {
            success: false,
            message: `No physicians found with name ${firstName} in ${normalizedSpecialty}`,
            physicians: []
          };
        }
      }

      // Limit to 5 physicians max (before location sorting)
      filteredPhysicians = filteredPhysicians.slice(0, 5);

      // Process each physician's locations
      const processedPhysicians = [];
      
      for (const physician of filteredPhysicians) {
        const physicianData = {
          id: physician.id,
          name: physician.name,
          specialty: physician.specialty,
          acceptingNewPatients: true, // Always true as per requirement
          languages: physician.languages,
          locations: []
        };

        // If user address is provided, calculate distances and sort locations
        if (userAddress && this.googleMapsApiKey) {
          try {
            const sortedLocations = await this.sortLocationsByDistance(
              physician.locations,
              userAddress
            );
            physicianData.locations = sortedLocations;
          } catch (error) {
            logger.warn('Failed to sort locations by distance', {
              error: error.message,
              physicianId: physician.id
            });
            // Fall back to unsorted locations without distance
            physicianData.locations = physician.locations.map(loc => ({
              name: loc.name,
              address: this.truncateAddress(loc.address)
            }));
          }
        } else {
          // No address provided or no API key - return locations without distance
          physicianData.locations = physician.locations.map(loc => ({
            name: loc.name,
            address: this.truncateAddress(loc.address)
          }));
        }

        processedPhysicians.push(physicianData);
      }

      return {
        success: true,
        physicians: processedPhysicians
      };

    } catch (error) {
      logger.error('Error in physician search', {
        error: error.message,
        specialty,
        firstName
      });
      
      return {
        success: false,
        message: 'An error occurred during physician search',
        physicians: []
      };
    }
  }

  /**
   * Sort locations by distance from user address using Google Maps Distance Matrix API
   * @param {Array} locations - Array of location objects
   * @param {string} userAddress - User's address
   * @returns {Promise<Array>} Sorted locations with distance information
   */
  async sortLocationsByDistance(locations, userAddress) {
    if (!locations || locations.length === 0) {
      return [];
    }

    // Single location - no need to call API
    if (locations.length === 1) {
      return [{
        name: locations[0].name,
        address: this.truncateAddress(locations[0].address)
      }];
    }

    try {
      // Prepare destination addresses
      const destinations = locations.map(loc => loc.address);

      // Make Distance Matrix API call
      const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
        params: {
          key: this.googleMapsApiKey,
          origins: userAddress,
          destinations: destinations.join('|'),
          units: 'imperial', // miles
          mode: 'driving'
        }
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
            address: location.address,  // Keep full address for internal use
            truncatedAddress: this.truncateAddress(location.address),
            distance: element.distance.text,
            duration: element.duration.text,
            distanceValue: element.distance.value // in meters for sorting
          });
        } else {
          // If distance calculation fails for this location, add without distance
          locationsWithDistance.push({
            name: location.name,
            address: location.address,  // Keep full address for internal use
            truncatedAddress: this.truncateAddress(location.address),
            distanceValue: Number.MAX_SAFE_INTEGER // Put at end when sorting
          });
        }
      });

      // Sort by distance (ascending)
      locationsWithDistance.sort((a, b) => a.distanceValue - b.distanceValue);

      // Return without distanceValue (internal use only)
      return locationsWithDistance.map(loc => ({
        name: loc.name,
        address: loc.truncatedAddress,  // Use truncated address in response
        distance: loc.distance || 'Distance unavailable',
        duration: loc.duration || 'Duration unavailable'
      }));

    } catch (error) {
      logger.error('Error calculating distances', {
        error: error.message,
        userAddress
      });
      
      // Return unsorted locations without distance on error
      return locations.map(loc => ({
        name: loc.name,
        address: this.truncateAddress(loc.address)
      }));
    }
  }

  /**
   * Get all available specialties
   * @returns {Array} List of available specialties
   */
  getAvailableSpecialties() {
    return [...new Set(this.physicians.map(p => p.specialty))].sort();
  }

  /**
   * Get physician count by specialty
   * @returns {Object} Count of physicians per specialty
   */
  getSpecialtyCounts() {
    const counts = {};
    this.physicians.forEach(p => {
      counts[p.specialty] = (counts[p.specialty] || 0) + 1;
    });
    return counts;
  }

  /**
   * Get all physicians by specialty with formatted data for Retell
   * @param {string} specialty - Required specialty (one of the 8 available)
   * @returns {Object} Result with all physicians in that specialty
   */
  getPhysiciansBySpecialty(specialty) {
    try {
      // Normalize specialty to uppercase
      const normalizedSpecialty = specialty.toUpperCase().trim();
      
      // Validate specialty is one of the 8 available
      const validSpecialties = [
        'CARDIOLOGY',
        'GASTROENTEROLOGY', 
        'GI_SURGERY',
        'NEUROLOGY',
        'OBSTETRICS_GYNECOLOGY',
        'ONCOLOGY',
        'ORTHOPEDICS',
        'UROLOGY'
      ];
      
      if (!validSpecialties.includes(normalizedSpecialty)) {
        return {
          success: false,
          message: `Invalid specialty. Valid specialties are: ${validSpecialties.join(', ')}`,
          physicians: []
        };
      }
      
      // Filter physicians by specialty
      const filteredPhysicians = this.physicians.filter(
        p => p.specialty === normalizedSpecialty
      );

      if (filteredPhysicians.length === 0) {
        return {
          success: false,
          message: `No physicians found for specialty: ${normalizedSpecialty}`,
          physicians: []
        };
      }

      // Format physicians with required data
      const formattedPhysicians = filteredPhysicians.map(physician => ({
        name: physician.name,
        specialty: physician.specialty,
        areasOfExpertise: physician.areasOfExpertise || [],
        locationNames: physician.locations.map(loc => loc.name)
      }));

      return {
        success: true,
        totalCount: formattedPhysicians.length,
        specialty: normalizedSpecialty,
        physicians: formattedPhysicians
      };

    } catch (error) {
      logger.error('Error getting physicians by specialty', {
        error: error.message,
        specialty
      });
      
      return {
        success: false,
        message: 'An error occurred while retrieving physicians',
        physicians: []
      };
    }
  }
}

module.exports = new PhysicianSearchService();