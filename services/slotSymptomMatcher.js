require('dotenv').config();
const axios = require('axios');
const logger = require('../utils/logger');
const physiciansUchicago = require('../config/physicians_uchicago.json');
const LocationSorter = require('../utils/locationSorter');

class SlotSymptomMatcher {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.model = 'gpt-4o';
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
  }

  /**
   * Build prompt for GPT to match symptoms to physicians
   * @param {string} symptomText - Patient's symptom description
   * @param {Array} physiciansData - Array of physician objects with name and expertise
   * @returns {string} The formatted prompt
   */
  buildPhysicianMatchingPrompt(symptomText, physiciansData) {
    // Format physicians data as a structured list
    const physiciansInfo = physiciansData.map((physician, index) =>
      `${index + 1}. Name: ${physician.physicianName}\n   Areas of Expertise: ${physician.areasOfExpertise}`
    ).join('\n\n');

    return `You are a medical expert helping to match patient symptoms with the most appropriate physicians based on their areas of expertise.

PATIENT SYMPTOMS:
${symptomText}

AVAILABLE PHYSICIANS:
${physiciansInfo}

TASK:
Analyze the patient's symptoms and select the TOP 3 most suitable physicians based on their areas of expertise. Consider:
1. Direct relevance of the physician's expertise to the described symptoms
2. Specificity of expertise match (prefer specialists whose expertise directly addresses the symptoms)
3. Comprehensiveness of care (if symptoms span multiple areas, prefer physicians with broader relevant expertise)

IMPORTANT:
- Return ONLY the names of up to 3 physicians
- List them in DESCENDING order of relevance (most relevant first)
- If fewer than 3 physicians are truly relevant, return only those that are appropriate
- Do NOT include physicians whose expertise doesn't match the symptoms

RESPONSE FORMAT:
Return a JSON array containing only the physician names as strings.
Example: ["Dr. John Smith", "Dr. Jane Doe", "Dr. Bob Johnson"]

If no physicians match the symptoms well, return an empty array: []

Return ONLY the JSON array, no explanation or additional text.`;
  }

  /**
   * Match symptoms to top 3 physicians using GPT
   * @param {string} symptomText - Patient's symptom description
   * @returns {Promise<Object>} Result with matched physician names
   */
  async matchSymptomsToDoctors(symptomText) {
    try {
      if (!this.openaiApiKey) {
        throw new Error('OPENAI_API_KEY is not configured');
      }

      logger.info('Matching symptoms to physicians with GPT', {
        symptomLength: symptomText.length,
        totalPhysicians: physiciansUchicago.length
      });

      // Prepare physicians data (name and expertise only)
      const physiciansData = physiciansUchicago.map(p => ({
        physicianName: p.physicianName,
        areasOfExpertise: p.areasOfExpertise
      }));

      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a medical expert assistant that matches patient symptoms to appropriate physicians based on their areas of expertise. Always return valid JSON arrays.'
            },
            {
              role: 'user',
              content: this.buildPhysicianMatchingPrompt(symptomText, physiciansData)
            }
          ],
          temperature: 0.3,
          max_tokens: 150,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      let content = response.data.choices[0].message.content.trim();

      // Remove markdown code blocks if present
      if (content.startsWith('```json')) {
        content = content.replace(/^```json\s*/, '').replace(/```$/, '').trim();
      } else if (content.startsWith('```')) {
        content = content.replace(/^```\s*/, '').replace(/```$/, '').trim();
      }

      // Parse the JSON response
      let matchedNames;
      try {
        matchedNames = JSON.parse(content);
        if (!Array.isArray(matchedNames)) {
          throw new Error('Response is not an array');
        }
      } catch (parseError) {
        logger.error('Failed to parse GPT response', {
          response: content,
          error: parseError.message
        });
        return {
          success: false,
          error: 'Failed to parse physician matches'
        };
      }

      logger.info('GPT matched physicians', {
        matchedCount: matchedNames.length,
        matchedNames
      });

      // Get full physician data for matched names
      const matchedPhysicians = [];
      for (const name of matchedNames) {
        const physician = physiciansUchicago.find(p =>
          p.physicianName.toLowerCase() === name.toLowerCase()
        );
        if (physician) {
          matchedPhysicians.push(physician);
        }
      }

      return {
        success: true,
        physicians: matchedPhysicians
      };

    } catch (error) {
      logger.error('Error matching symptoms to doctors', {
        error: error.message,
        response: error.response?.data
      });
      return {
        success: false,
        error: 'Failed to match symptoms to physicians'
      };
    }
  }

  /**
   * Calculate distance from user address to a location
   * @param {string} userAddress - User's address
   * @param {string} locationName - Location name to map to address
   * @returns {Promise<Object>} Distance information
   */
  async calculateDistance(userAddress, locationName) {
    try {
      // Map location name to actual address using locations config
      const { PRIMARY_LOCATIONS } = require('../config/locations');
      const locationInfo = PRIMARY_LOCATIONS.find(loc =>
        loc.name.toLowerCase() === locationName.toLowerCase()
      );

      if (!locationInfo) {
        return {
          distance: null,
          duration: null,
          distanceValue: Number.MAX_SAFE_INTEGER
        };
      }

      const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
        params: {
          key: this.googleMapsApiKey,
          origins: userAddress,
          destinations: locationInfo.address,
          units: 'imperial',
          mode: 'driving'
        },
        timeout: 10000
      });

      if (response.data.status === 'OK' && response.data.rows[0]?.elements[0]?.status === 'OK') {
        const element = response.data.rows[0].elements[0];
        return {
          distance: element.distance.text,
          duration: element.duration.text,
          distanceValue: element.distance.value
        };
      }

      return {
        distance: null,
        duration: null,
        distanceValue: Number.MAX_SAFE_INTEGER
      };

    } catch (error) {
      logger.warn('Error calculating distance', {
        error: error.message,
        userAddress,
        locationName
      });
      return {
        distance: null,
        duration: null,
        distanceValue: Number.MAX_SAFE_INTEGER
      };
    }
  }

  /**
   * Get slots for physicians matched by symptoms
   * @param {string} symptomText - Patient's symptom description
   * @param {string} address - Patient's address
   * @param {string} serviceType - Type of service (optional)
   * @param {string} startTime - Start time for slot search (optional)  
   * @returns {Promise<Object>} Result with slots sorted by time and distance
   */
  async getSlotsForSymptoms(symptomText, address, serviceType, startTime, accessToken) {
    try {
      // Step 1: Match symptoms to top 3 physicians using GPT
      const matchResult = await this.matchSymptomsToDoctors(symptomText);

      if (!matchResult.success || matchResult.physicians.length === 0) {
        return {
          success: false,
          error: matchResult.error || 'No matching physicians found for the symptoms'
        };
      }

      logger.info('Matched physicians for symptoms', {
        count: matchResult.physicians.length,
        physicians: matchResult.physicians.map(p => p.physicianName)
      });

      // Step 2: Get slots for each physician's locations
      const allSlots = [];

      for (const physician of matchResult.physicians) {
        // Get locations for this physician
        const locations = Array.isArray(physician.location) ? physician.location : [physician.location];

        for (const location of locations) {
          try {
            // Currently hardcoded due to API issues as mentioned
            const overriddenLocation = "Orlando Neuro Clinic";

            logger.info('Fetching slots for physician location', {
              physician: physician.physicianName,
              originalLocation: location,
              overriddenLocation
            });
  
            // Calculate distance for this location
            const distanceInfo = await this.calculateDistance(address, location);

            // Add physician and location info to each slot
            for (const slot of slots) {
              allSlots.push({
                ...slot,
                doctor_name: physician.physicianName,
                doctor_languages: physician.languagesSpoken,
                location: location,
                distance: distanceInfo.distance,
                duration: distanceInfo.duration,
                distanceValue: distanceInfo.distanceValue
              });
            }

          } catch (slotError) {
            logger.warn('Error fetching slots for physician location', {
              physician: physician.physicianName,
              location,
              error: slotError.message
            });
            // Continue with next location
          }
        }
      }

      if (allSlots.length === 0) {
        return {
          success: false,
          error: 'No available slots found for matched physicians'
        };
      }

      // Step 3: Sort slots by time, then by distance for same time
      allSlots.sort((a, b) => {
        // First sort by start time
        const timeA = new Date(a.startTime);
        const timeB = new Date(b.startTime);
        const timeDiff = timeA - timeB;

        if (timeDiff !== 0) {
          return timeDiff;
        }

        // If same time, sort by distance
        return a.distanceValue - b.distanceValue;
      });

      // Step 4: Take top 10 slots and format response
      const top10Slots = allSlots.slice(0, 10).map(slot => ({
        slot_id: slot.slotId,
        start_time: slot.startTime,
        end_time: slot.endTime,
        day_of_week: slot.dayOfWeek,
        doctor_name: slot.doctor_name,
        doctor_languages: slot.doctor_languages,
        location: slot.location,
        distance: slot.distance,
        duration: slot.duration
      }));

      logger.info('Successfully retrieved slots for symptoms', {
        totalSlots: allSlots.length,
        returnedSlots: top10Slots.length
      });

      return {
        success: true,
        matched_physicians: matchResult.physicians.map(p => p.physicianName),
        total_slots_found: allSlots.length,
        slots: top10Slots
      };

    } catch (error) {
      logger.error('Error in getSlotsForSymptoms', {
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: 'Failed to retrieve slots for symptoms'
      };
    }
  }
}

module.exports = new SlotSymptomMatcher();