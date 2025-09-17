require('dotenv').config();
const { locations } = require('../config/locations');
const { Client } = require('@googlemaps/google-maps-services-js');

class LocationSorter {
  constructor() {
    this.googleMapsClient = new Client({});
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY;
  }
  /**
   * Get distances from user address to all eligible locations using Google Maps Distance Matrix API
   * @param {string} userAddress - Full address string
   * @param {Array} eligibleLocations - Array of location objects
   * @returns {Promise<Array>} Array of locations with distance and duration data
   */
  async getDistancesFromGoogle(userAddress, eligibleLocations) {
    if (!this.apiKey) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      // Prepare destination addresses
      const destinations = eligibleLocations.map(location => location.address);

      // Make Distance Matrix API call
      const response = await this.googleMapsClient.distancematrix({
        params: {
          key: this.apiKey,
          origins: [userAddress],
          destinations: destinations,
          units: 'imperial', // miles
          mode: 'driving',
          avoid: ['tolls'], // Optional: avoid tolls for more accurate general routing
        },
      });

      const results = [];
      const elements = response.data.rows[0]?.elements || [];

      eligibleLocations.forEach((location, index) => {
        const element = elements[index];
        
        if (element && element.status === 'OK') {
          results.push({
            ...location,
            distance: element.distance.text,
            duration: element.duration.text,
            distance_value: element.distance.value, // in meters for sorting
            duration_value: element.duration.value, // in seconds for sorting
          });
        } else {
          // If Google can't calculate distance, skip this location
          console.warn(`Could not calculate distance to ${location.name}: ${element?.status}`);
        }
      });

      return results;
    } catch (error) {
      console.error('Google Maps API detailed error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        apiKey: this.apiKey ? 'present' : 'missing'
      });
      throw new Error(`Google Maps API error: ${error.message}`);
    }
  }

  /**
   * Normalize appointment type for matching
   * @param {string} appointmentType - The appointment type string
   * @returns {string} Normalized appointment type
   */
  normalizeAppointmentType(appointmentType) {
    return appointmentType.toLowerCase().trim();
  }

  /**
   * Check if a location offers a specific service
   * @param {object} location - Location object
   * @param {string} appointmentType - Appointment type to check
   * @returns {boolean} True if location offers the service
   */
  locationOffersService(location, appointmentType) {
    const normalizedType = this.normalizeAppointmentType(appointmentType);
    
    // Special handling for MRI types
    if (normalizedType === 'mri' || normalizedType === 'mri scan') {
      // Return true if location has any MRI service
      return location.services.some(service => 
        service.toLowerCase().includes('mri')
      );
    }
    
    if (normalizedType === 'open mri') {
      // Only Jacksonville has Open MRI
      return location.services.some(service => 
        service.toLowerCase() === 'open mri'
      );
    }
    
    if (normalizedType === 'open upright mri') {
      // Only Mandarin has Open Upright MRI
      return location.services.some(service => 
        service.toLowerCase() === 'open upright mri'
      );
    }
    
    // For all other services, do case-insensitive exact match
    return location.services.some(service => 
      this.normalizeAppointmentType(service) === normalizedType
    );
  }

  /**
   * Sort locations by distance from an address for a specific appointment type and provider
   * @param {string} address - Full address string
   * @param {string} appointmentType - Type of appointment
   * @param {string} provider - Provider identifier (precision/uchicago)
   * @returns {Promise<object>} Sorted locations or error message
   */
  async sortLocationsByDistance(address, appointmentType, provider) {
    // Validate address
    if (!address || typeof address !== 'string' || !address.trim()) {
      return {
        success: false,
        error: "Please provide a valid address."
      };
    }

    // Validate provider
    if (!provider || typeof provider !== 'string') {
      return {
        success: false,
        error: "Please provide a valid provider."
      };
    }

    // Get provider-specific locations
    const providerLocations = locations[provider.toLowerCase()];
    if (!providerLocations) {
      return {
        success: false,
        error: `Provider '${provider}' not found.`
      };
    }

    try {
      // Filter locations that offer the requested service
      const eligibleLocations = [];
      for (const key in providerLocations) {
        const location = providerLocations[key];
        if (this.locationOffersService(location, appointmentType)) {
          eligibleLocations.push(location);
        }
      }

      // Check if any locations were found
      if (eligibleLocations.length === 0) {
        return {
          success: false,
          error: `No locations found offering ${appointmentType} services.`
        };
      }

      // Get distances using Google Maps API
      const locationsWithDistances = await this.getDistancesFromGoogle(address.trim(), eligibleLocations);

      // Check if we got any valid distance calculations
      if (locationsWithDistances.length === 0) {
        return {
          success: false,
          error: "Issue while fetching closest locations. Please verify the address is correct."
        };
      }

      // Sort by distance (using distance_value which is in meters)
      locationsWithDistances.sort((a, b) => a.distance_value - b.distance_value);

      // Format the response
      const result = {};
      locationsWithDistances.forEach((location, index) => {
        result[`Preference ${index + 1}`] = {
          name: location.name,
          address: location.address,
          distance: location.distance,
          duration: location.duration
        };
      });

      return {
        success: true,
        result: result
      };
    } catch (error) {
      return {
        success: false,
        error: "Issue while fetching closest locations. Please try again."
      };
    }
  }
}

module.exports = new LocationSorter();