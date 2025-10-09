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

        // Build examples from symptom mapping (now showing arrays)
        const examples = symptomMapping.mappings.map(m => {
            const enumsStr = m.expertiseEnums.join(', ');
            return `Patient Symptom: "${m.symptom}"\nMatched Expertise: [${enumsStr}]`;
        }).join('\n\n');

        return `You are a medical symptom classifier for a physician scheduling system. Your task is to analyze patient-described symptoms and match them to the most relevant areas of medical expertise ONLY when you have high confidence.

    AVAILABLE EXPERTISE AREAS (use these exact enum names):
    ${allEnums.join('\n')}

    SYMPTOM TO EXPERTISE MAPPING EXAMPLES:
    ${examples}

    CLASSIFICATION INSTRUCTIONS:
    1. Read the patient's symptom description carefully
    2. Based on the examples above and your medical knowledge, identify up to 3 MOST RELEVANT expertise areas
    3. Match symptoms to the expertise areas that would most likely treat this condition
    4. Return 1-3 expertise enums, depending on how many are truly relevant
    5. Do NOT hallucinate or guess - only return enums that clearly match the symptoms
    6. Use MANUAL_REVIEW_REQUIRED only for completely unintelligible input

    RESPONSE FORMAT:
    Return a JSON array of 1-3 expertise enums, or ["MANUAL_REVIEW_REQUIRED"]
    Examples:
    - ["GENERAL_CARDIOLOGY"]
    - ["HEART_FAILURE", "CARDIOMYOPATHY"]
    - ["GENERAL_GASTROENTEROLOGY", "ENDOSCOPY", "COLONOSCOPY"]
    - ["MANUAL_REVIEW_REQUIRED"]

    Return ONLY the JSON array, no explanation or additional text.`;
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

      const classifiedResponse = response.data.choices[0].message.content.trim();

      // Parse JSON array response
      let expertiseEnums;
      try {
        expertiseEnums = JSON.parse(classifiedResponse);

        // Ensure it's an array
        if (!Array.isArray(expertiseEnums)) {
          throw new Error('Response is not an array');
        }
      } catch (parseError) {
        logger.error('Failed to parse OpenAI response as JSON array', {
          response: classifiedResponse,
          error: parseError.message
        });

        return {
          success: false,
          error: 'Invalid response format from symptom classifier. Please try again.'
        };
      }

      // Handle MANUAL_REVIEW_REQUIRED response
      if (expertiseEnums.length === 1 && expertiseEnums[0] === 'MANUAL_REVIEW_REQUIRED') {
        logger.info('Symptoms require manual review', {
          symptomText: symptomText.substring(0, 100)
        });

        return {
          success: false,
          error: 'These symptoms require manual review. Please contact our office directly for assistance.',
          requiresManualReview: true
        };
      }

      // Validate that all returned enums are valid
      const allEnums = getAllExpertiseEnums();
      const invalidEnums = expertiseEnums.filter(e => !allEnums.includes(e));

      if (invalidEnums.length > 0) {
        logger.warn('OpenAI returned invalid expertise enums', {
          returned: expertiseEnums,
          invalid: invalidEnums,
          validEnums: allEnums.length
        });

        throw new Error(`OpenAI returned invalid expertise areas: ${invalidEnums.join(', ')}`);
      }

      // Limit to 3 enums
      const limitedEnums = expertiseEnums.slice(0, 3);

      logger.info('Successfully classified symptoms', {
        expertiseEnums: limitedEnums,
        count: limitedEnums.length,
        tokensUsed: response.data.usage?.total_tokens || 0
      });

      return {
        success: true,
        expertiseEnums: limitedEnums,
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