require('dotenv').config();
const axios = require('axios');
const logger = require('../utils/logger');
const symptomMapping = require('../config/symptomExpertiseMapping.json');
const { EXPERTISE_ENUMS, getAllExpertiseEnums } = require('../config/expertiseEnums');

class OpenAISymptomClassifier {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = 'gpt-4o';
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
  }

  /**
   * Build the prompt for OpenAI with all symptom examples
   * @returns {string} The system prompt
   */
    buildSystemPrompt() {
        const allEnums = getAllExpertiseEnums();
        
        // Build examples from symptom mapping
        const examples = symptomMapping.mappings.map(m => 
        `Patient Symptom: "${m.symptom}"\nMatched Expertise: ${m.expertiseEnum}`
        ).join('\n\n');
        
        return `You are a medical symptom classifier for a physician scheduling system. Your task is to analyze patient-described symptoms and match them to the most relevant area of medical expertise ONLY when you have high confidence.

    AVAILABLE EXPERTISE AREAS (use these exact enum names):
    ${allEnums.join('\n')}

    SYMPTOM TO EXPERTISE MAPPING EXAMPLES:
    ${examples}

    CRITICAL SAFETY INSTRUCTIONS:
    1. Read the patient's symptom description carefully
    2. Based on the examples above and your medical knowledge, determine if there is a CLEAR match to ONE expertise area
    3. Only recommend an expertise area if you are highly confident (symptoms clearly and unambiguously match)
    4. If symptoms are:
    - Vague or poorly described
    - Could reasonably match multiple specialties
    - Don't clearly fit any specialty
    - Potentially emergency/life-threatening
    - Outside your confidence level
    Then return: MANUAL_REVIEW_REQUIRED

    5. NEVER guess or force a match when uncertain - patient safety depends on accurate routing

    RESPONSE FORMAT:
    Return ONLY one of:
    - A single expertise enum (e.g., "GENERAL_CARDIOLOGY") if highly confident
    - "MANUAL_REVIEW_REQUIRED" if there is ANY uncertainty

    Examples:
    - Clear chest pain with cardiac symptoms → GENERAL_CARDIOLOGY
    - Vague "not feeling well" → MANUAL_REVIEW_REQUIRED
    - Symptoms matching multiple specialties → MANUAL_REVIEW_REQUIRED

    Do not include any explanation, punctuation, or additional text.`;
    }

  /**
   * Classify patient symptoms using OpenAI
   * @param {string} symptomText - Patient's symptom description
   * @returns {Promise<Object>} Classification result with expertise enum
   */
  async classifySymptoms(symptomText) {
    try {
      if (!this.apiKey) {
        throw new Error('OPENAI_API_KEY is not configured in environment variables');
      }

      if (!symptomText || typeof symptomText !== 'string' || !symptomText.trim()) {
        throw new Error('Invalid symptom text provided');
      }

      logger.info('Classifying symptoms with OpenAI', {
        symptomLength: symptomText.length,
        model: this.model
      });

      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: this.buildSystemPrompt()
            },
            {
              role: 'user',
              content: `Patient symptoms: ${symptomText}`
            }
          ],
          temperature: 0.3, // Lower temperature for more consistent results
          max_tokens: 50, // We only need the enum back
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        }
      );

      const classifiedExpertise = response.data.choices[0].message.content.trim();

      // Handle MANUAL_REVIEW_REQUIRED response
      if (classifiedExpertise === 'MANUAL_REVIEW_REQUIRED') {
        logger.info('Symptoms require manual review', {
          symptomText: symptomText.substring(0, 100)
        });

        return {
          success: false,
          error: 'These symptoms require manual review. Please contact our office directly for assistance.',
          requiresManualReview: true
        };
      }

      // Validate that the returned enum is valid
      const allEnums = getAllExpertiseEnums();
      if (!allEnums.includes(classifiedExpertise)) {
        logger.warn('OpenAI returned invalid expertise enum', {
          returned: classifiedExpertise,
          validEnums: allEnums
        });

        throw new Error(`OpenAI returned invalid expertise area: ${classifiedExpertise}`);
      }

      logger.info('Successfully classified symptoms', {
        expertise: classifiedExpertise,
        tokensUsed: response.data.usage?.total_tokens || 0
      });

      return {
        success: true,
        expertiseEnum: classifiedExpertise,
        tokensUsed: response.data.usage?.total_tokens || 0
      };

    } catch (error) {
      // Handle OpenAI API errors
      if (error.response) {
        logger.error('OpenAI API error', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });

        return {
          success: false,
          error: `OpenAI API error: ${error.response.data?.error?.message || error.response.statusText}`
        };
      }

      // Handle network/timeout errors
      if (error.code === 'ECONNABORTED') {
        logger.error('OpenAI request timeout', { error: error.message });
        return {
          success: false,
          error: 'OpenAI request timed out. Please try again.'
        };
      }

      // Handle other errors
      logger.error('Error classifying symptoms', {
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message || 'An error occurred during symptom classification'
      };
    }
  }

  /**
   * Test the classifier with a sample symptom
   * @param {string} symptomText - Test symptom description
   * @returns {Promise<Object>} Test result
   */
  async test(symptomText = 'I have severe chest pain and shortness of breath') {
    logger.info('Testing OpenAI symptom classifier', { symptomText });
    return await this.classifySymptoms(symptomText);
  }
}

module.exports = new OpenAISymptomClassifier();