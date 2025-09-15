const { locations } = require('../config/locations');
const zipcodes = require('zipcodes');

class LocationSorter {
  /**
   * Calculate distance between two coordinates using Haversine formula
   * @param {number} lat1 - Latitude of first point
   * @param {number} lng1 - Longitude of first point
   * @param {number} lat2 - Latitude of second point
   * @param {number} lng2 - Longitude of second point
   * @returns {number} Distance in miles
   */
  static calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return Math.round(distance * 10) / 10; // Round to 1 decimal place
  }

  static toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Get coordinates for a ZIP code
   * @param {string} zipCode - 5-digit ZIP code
   * @returns {object|null} Coordinates object or null if not found
   */
  static getZipCodeCoordinates(zipCode) {
    // Use the zipcodes package to lookup any US ZIP code
    const zipInfo = zipcodes.lookup(zipCode);
    
    if (zipInfo && zipInfo.latitude && zipInfo.longitude) {
      return {
        lat: zipInfo.latitude,
        lng: zipInfo.longitude
      };
    }
    
    // If not found, return null
    return null;
  }

  /**
   * Normalize appointment type for matching
   * @param {string} appointmentType - The appointment type string
   * @returns {string} Normalized appointment type
   */
  static normalizeAppointmentType(appointmentType) {
    return appointmentType.toLowerCase().trim();
  }

  /**
   * Check if a location offers a specific service
   * @param {object} location - Location object
   * @param {string} appointmentType - Appointment type to check
   * @returns {boolean} True if location offers the service
   */
  static locationOffersService(location, appointmentType) {
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
   * Sort locations by distance from a ZIP code for a specific appointment type
   * @param {string} zipCode - 5-digit ZIP code
   * @param {string} appointmentType - Type of appointment
   * @returns {object} Sorted locations or error message
   */
  static sortLocationsByDistance(zipCode, appointmentType) {
    // Validate ZIP code format
    if (!zipCode || !/^\d{5}$/.test(zipCode)) {
      return {
        success: false,
        error: "Invalid ZIP code format. Please provide a 5-digit ZIP code."
      };
    }

    // Get coordinates for the provided ZIP code
    const userCoordinates = this.getZipCodeCoordinates(zipCode);
    if (!userCoordinates) {
      return {
        success: false,
        error: "Unable to determine location for the provided ZIP code. Please verify the ZIP code is correct."
      };
    }

    // Filter locations that offer the requested service
    const eligibleLocations = [];
    for (const key in locations) {
      const location = locations[key];
      if (this.locationOffersService(location, appointmentType)) {
        // Calculate distance
        const distance = this.calculateDistance(
          userCoordinates.lat,
          userCoordinates.lng,
          location.coordinates.lat,
          location.coordinates.lng
        );
        
        eligibleLocations.push({
          ...location,
          distance: distance
        });
      }
    }

    // Check if any locations were found
    if (eligibleLocations.length === 0) {
      return {
        success: false,
        error: `No locations found offering ${appointmentType} services.`
      };
    }

    // Sort by distance
    eligibleLocations.sort((a, b) => a.distance - b.distance);

    // Format the response
    const result = {};
    eligibleLocations.forEach((location, index) => {
      result[`Preference ${index + 1}`] = {
        name: location.name,
        address: location.address,
        distance: `${location.distance} miles`
      };
    });

    return {
      success: true,
      result: result
    };
  }
}

module.exports = LocationSorter;