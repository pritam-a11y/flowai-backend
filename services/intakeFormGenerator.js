const OpenAI = require("openai");
const pdfMake = require("pdfmake/build/pdfmake");
const pdfFonts = require("pdfmake/build/vfs_fonts");
const logger = require("../utils/logger");

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Set fonts for pdfmake
pdfMake.vfs = pdfFonts;

/**
 * Extract structured intake information from transcript using ChatGPT
 * @param {string} transcript - The call transcript
 * @returns {Promise<Object>} - Structured intake information
 */
async function extractStructuredIntakeInfo(transcript) {
  try {
    const prompt = `You are a medical intake form processor. Analyze the following transcript of an interaction between a patient and an AI agent where the agent is asking detailed questions to the patient before their scheduled appointment.

Extract and structure the information into a medical SOAP note format. IMPORTANT: Only include information that was explicitly mentioned in the transcript. Do NOT assume or infer any information.

Required sections:

1. CHIEF COMPLAINT(S): Main reason(s) for the visit. Return as array of bullet points. If not mentioned, return ["N/A"].

2. HPI (History of Present Illness): Narrative of current illness/symptoms. Return as array of bullet points describing onset, duration, severity, etc. If not mentioned, return ["N/A"].

3. CURRENT MEDICATION: All medications with dosage. Return as array of bullet points (e.g., "Lisinopril 10mg daily"). If none mentioned, return ["N/A"].

4. MEDICAL HISTORY: Past and current medical conditions. Return as array of bullet points. If none mentioned, return ["N/A"].

5. ALLERGIES/INTOLERANCE: Drug allergies or intolerances. If patient explicitly states no allergies OR if not discussed, return the string "NKDA" (not an array). If allergies mentioned, return array of bullet points.

6. SURGICAL HISTORY: Past surgeries with dates if mentioned. Return as array of bullet points. If none mentioned, return ["N/A"].

7. HOSPITALIZATION: Past hospitalizations with reasons. Return as array of bullet points. If none mentioned, return ["N/A"].

8. FAMILY HISTORY: Family medical history. Return as array of objects with format:
   [{"relation": "Father", "condition": "Prostate Cancer", "contributory": "Non-Contributory"}]
   Always include "contributory" field - set to "Non-Contributory" if not specified otherwise.
   If no family history mentioned, return [{"relation": "N/A", "condition": "N/A", "contributory": ""}].

9. SOCIAL HISTORY: Format as comma-separated question-answer pairs: "Do you drink alcohol? - No, Do you smoke? - No, What is your occupation? - Teacher, Are you married? - Yes"
   Return as a single STRING (not array). If not discussed, return "N/A".

10. ROS (Review of Systems): Any symptoms the patient DENIES. Format each as "Denies [symptoms]" (e.g., "Denies fevers, weight loss, lethargy"). Return as array where each item is one "Denies..." statement. If no denials mentioned, return ["N/A"].

Return EXACTLY this JSON structure:
{
  "chief_complaints": ["array of strings or N/A"],
  "hpi": ["array of strings or N/A"],
  "current_medication": ["array of strings or N/A"],
  "medical_history": ["array of strings or N/A"],
  "allergies_intolerance": "NKDA" OR ["array of allergy strings"],
  "surgical_history": ["array of strings or N/A"],
  "hospitalization": ["array of strings or N/A"],
  "family_history": [{"relation": "string", "condition": "string", "contributory": "string"}],
  "social_history": "single comma-separated string or N/A",
  "ros": ["array of Denies... statements or N/A"]
}

Transcript:
${transcript}`;

    logger.info("Calling ChatGPT to extract intake information", {
      transcriptLength: transcript.length,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using GPT-4o for best results
      messages: [
        {
          role: "system",
          content:
            "You are a medical intake form processor creating SOAP notes. Extract only explicitly mentioned information from transcripts. Never assume or infer information. Follow the exact JSON format specified.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3, // Low temperature for factual extraction
      max_tokens: 3000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    logger.info("ChatGPT response received", {
      contentLength: content.length,
    });

    const structuredData = JSON.parse(content);

    // Validate that all required sections are present
    const requiredSections = [
      "chief_complaints",
      "hpi",
      "current_medication",
      "medical_history",
      "allergies_intolerance",
      "surgical_history",
      "hospitalization",
      "family_history",
      "social_history",
      "ros",
    ];

    for (const section of requiredSections) {
      if (!structuredData[section]) {
        logger.warn(`Missing section in ChatGPT response: ${section}`);
        if (section === "allergies_intolerance") {
          structuredData[section] = "NKDA";
        } else if (section === "family_history") {
          structuredData[section] = [{"relation": "N/A", "condition": "N/A", "contributory": ""}];
        } else if (section === "social_history") {
          structuredData[section] = "N/A";
        } else {
          structuredData[section] = ["N/A"];
        }
      }
    }

    return structuredData;
  } catch (error) {
    logger.error("Error extracting structured intake info from ChatGPT", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Generate PDF from structured intake information with patient demographics
 * @param {Object} structuredData - Structured intake information from ChatGPT
 * @param {Object} patientData - Patient demographics from Redox API
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function generatePDF(structuredData, patientData = null) {
  try {
    logger.info("Generating PDF from structured data");

    const content = [];

    // Patient Demographics Header (if provided)
    if (patientData) {
      // Calculate age from DOB
      let age = "";
      if (patientData.birthDate) {
        const birthDate = new Date(patientData.birthDate);
        const today = new Date();
        const ageYears = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age = `${ageYears - 1} Y`;
        } else {
          age = `${ageYears} Y`;
        }
      }

      // Format DOB
      const dobFormatted = patientData.birthDate
        ? new Date(patientData.birthDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
        : "";

      // Format encounter date
      const encounterDateFormatted = patientData.encounterDate
        ? new Date(patientData.encounterDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
        : "";

      content.push(
        {
          table: {
            widths: ['*'],
            body: [
              [
                {
                  stack: [
                    {
                      text: [
                        { text: 'Patient: ', bold: true, color: '#5B9BD5' }, // Sky blue
                        { text: patientData.name || '', color: '#000000' },
                        { text: '  DOB: ', bold: true, color: '#5B9BD5' },
                        { text: dobFormatted, color: '#000000' },
                        { text: '  Age: ', bold: true, color: '#5B9BD5' },
                        { text: age, color: '#000000' },
                        { text: '  Sex: ', bold: true, color: '#5B9BD5' },
                        { text: patientData.gender || '', color: '#000000' }
                      ],
                      fontSize: 9,
                      margin: [3, 2, 3, 1]
                    },
                    {
                      text: [
                        { text: 'Phone: ', bold: true, color: '#5B9BD5' },
                        { text: patientData.phone || '', color: '#000000' },
                        { text: '  Primary Insurance: ', bold: true, color: '#5B9BD5' },
                        { text: patientData.insuranceName || '', color: '#000000' }
                      ],
                      fontSize: 9,
                      margin: [3, 1, 3, 1]
                    },
                    {
                      text: [
                        { text: 'Address: ', bold: true, color: '#5B9BD5' },
                        { text: patientData.address || '', color: '#000000' }
                      ],
                      fontSize: 9,
                      margin: [3, 1, 3, 1]
                    },
                    {
                      text: [
                        { text: 'Encounter Date: ', bold: true, color: '#5B9BD5' },
                        { text: encounterDateFormatted, color: '#000000' }
                      ],
                      fontSize: 9,
                      margin: [3, 1, 3, 2]
                    }
                  ],
                  fillColor: '#E8E8E8',
                  border: [true, true, true, true]
                }
              ]
            ]
          },
          layout: {
            defaultBorder: false,
          },
          margin: [0, 0, 0, 8]
        }
      );
    }

    // Subjective Label
    content.push({
      text: "Subjective:",
      style: "subjectiveHeader",
      margin: [0, 0, 0, 4]
    });

    // Chief Complaint(s)
    content.push({
      text: "Chief Complaint(s):",
      style: "sectionHeader",
    });
    if (Array.isArray(structuredData.chief_complaints)) {
      content.push({
        ul: structuredData.chief_complaints,
        style: "bulletList",
      });
    } else {
      content.push({
        ul: ["N/A"],
        style: "bulletList",
      });
    }

    // HPI
    content.push({
      text: "HPI:",
      style: "sectionHeader",
    });
    if (Array.isArray(structuredData.hpi)) {
      content.push({
        ul: structuredData.hpi,
        style: "bulletList",
      });
    } else {
      content.push({
        ul: ["N/A"],
        style: "bulletList",
      });
    }

    // Current Medication
    content.push({
      text: "Current Medication:",
      style: "sectionHeader",
    });
    if (Array.isArray(structuredData.current_medication)) {
      content.push({
        ul: structuredData.current_medication,
        style: "bulletList",
      });
    } else {
      content.push({
        ul: ["N/A"],
        style: "bulletList",
      });
    }

    // Medical History
    content.push({
      text: "Medical History:",
      style: "sectionHeader",
    });
    if (Array.isArray(structuredData.medical_history)) {
      content.push({
        ul: structuredData.medical_history,
        style: "bulletList",
      });
    } else {
      content.push({
        ul: ["N/A"],
        style: "bulletList",
      });
    }

    // Allergies/Intolerance
    content.push({
      text: "Allergies/Intolerance:",
      style: "sectionHeader",
    });
    if (structuredData.allergies_intolerance === "NKDA") {
      content.push({
        text: "     N.K.D.A.",
        style: "indentedText",
        margin: [20, 0, 0, 3]
      });
    } else if (Array.isArray(structuredData.allergies_intolerance)) {
      content.push({
        ul: structuredData.allergies_intolerance,
        style: "bulletList",
      });
    } else {
      content.push({
        text: "     N.K.D.A.",
        style: "indentedText",
        margin: [20, 0, 0, 3]
      });
    }

    // Surgical History
    content.push({
      text: "Surgical History:",
      style: "sectionHeader",
    });
    if (Array.isArray(structuredData.surgical_history)) {
      content.push({
        ul: structuredData.surgical_history,
        style: "bulletList",
      });
    } else {
      content.push({
        ul: ["N/A"],
        style: "bulletList",
      });
    }

    // Hospitalization
    content.push({
      text: "Hospitalization:",
      style: "sectionHeader",
    });
    if (Array.isArray(structuredData.hospitalization)) {
      content.push({
        ul: structuredData.hospitalization,
        style: "bulletList",
      });
    } else {
      content.push({
        ul: ["N/A"],
        style: "bulletList",
      });
    }

    // Family History
    content.push({
      text: "Family History:",
      style: "sectionHeader",
    });
    if (Array.isArray(structuredData.family_history) && structuredData.family_history.length > 0) {
      const familyHistoryItems = [];
      structuredData.family_history.forEach(item => {
        if (item.relation === "N/A") {
          familyHistoryItems.push("N/A");
        } else {
          const mainText = `${item.relation}: ${item.condition}`;
          familyHistoryItems.push(mainText);
          if (item.contributory) {
            familyHistoryItems.push({ text: item.contributory, margin: [20, 0, 0, 0] });
          }
        }
      });
      content.push({
        stack: familyHistoryItems.map(item =>
          typeof item === 'string'
            ? { text: "     " + item, margin: [20, 0, 0, 1], fontSize: 10, color: '#333333' }
            : { text: "          " + item.text, margin: [40, 0, 0, 1], fontSize: 10, color: '#333333' }
        ),
        margin: [0, 0, 0, 3]
      });
    } else {
      content.push({
        ul: ["N/A"],
        style: "bulletList",
      });
    }

    // Social History
    content.push({
      text: "Social History:",
      style: "sectionHeader",
    });
    if (structuredData.social_history && structuredData.social_history !== "N/A") {
      // Check if it needs "Migrated Social History:" sub-header
      content.push({
        text: "     Migrated Social History:",
        bold: false,
        fontSize: 10,
        color: '#333333',
        margin: [20, 0, 0, 1]
      });
      content.push({
        text: "          " + structuredData.social_history,
        fontSize: 10,
        color: '#333333',
        margin: [40, 0, 0, 3]
      });
    } else {
      content.push({
        ul: ["N/A"],
        style: "bulletList",
      });
    }

    // ROS (Review of Systems)
    content.push({
      text: "ROS:",
      style: "rosHeader",
      margin: [0, 2, 0, 3]
    });
    if (Array.isArray(structuredData.ros) && structuredData.ros.length > 0) {
      structuredData.ros.forEach(item => {
        content.push({
          text: "     " + item,
          fontSize: 10,
          color: '#333333',
          margin: [20, 0, 0, 1]
        });
      });
    } else {
      content.push({
        text: "     N/A",
        fontSize: 10,
        color: '#333333',
        margin: [20, 0, 0, 1]
      });
    }

    // Define document
    const docDefinition = {
      pageSize: {
        width: 792,  // 11 inches in points (landscape)
        height: 612  // 8.5 inches in points (landscape)
      },
      pageOrientation: 'landscape',
      pageMargins: [30, 30, 30, 30],
      content: content,
      styles: {
        subjectiveHeader: {
          fontSize: 11,
          bold: true,
          color: "#000000", // Black for Subjective
        },
        sectionHeader: {
          fontSize: 10,
          bold: true,
          color: "#D2691E", // Orange for all section headers
          margin: [0, 3, 0, 2],
        },
        rosHeader: {
          fontSize: 10,
          bold: true,
          color: "#D2691E", // Orange for ROS
        },
        bulletList: {
          fontSize: 10,
          color: '#333333',
          margin: [0, 0, 0, 3],
        },
        indentedText: {
          fontSize: 10,
          color: '#333333',
        }
      },
      defaultStyle: {
        font: "Roboto",
        lineHeight: 1.1,
      },
    };

    // Create PDF
    return new Promise((resolve, reject) => {
      const pdfDocGenerator = pdfMake.createPdf(docDefinition);

      pdfDocGenerator.getBuffer((buffer) => {
        logger.info("PDF generated successfully", {
          sizeBytes: buffer.length,
        });
        resolve(buffer);
      }, (error) => {
        logger.error("Error generating PDF", {
          error: error.message,
        });
        reject(error);
      });
    });
  } catch (error) {
    logger.error("Error in PDF generation", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Generate intake form PDF from transcript with patient demographics
 * @param {string} transcript - The call transcript
 * @param {Object} patientData - Optional patient demographics data
 * @param {string} patientData.name - Patient name (LastName, FirstName format)
 * @param {string} patientData.birthDate - Patient date of birth
 * @param {string} patientData.gender - Patient gender
 * @param {string} patientData.phone - Patient phone number
 * @param {string} patientData.insuranceName - Primary insurance name
 * @param {string} patientData.insuranceMemberId - Insurance payer ID
 * @param {string} patientData.address - Patient address
 * @param {string} patientData.encounterDate - Encounter/appointment date
 * @returns {Promise<string>} - Base64 encoded PDF
 */
async function generateIntakeFormPDF(transcript, patientData = null) {
  try {
    logger.info("Starting intake form PDF generation", {
      transcriptLength: transcript.length,
      hasPatientData: !!patientData,
    });

    // Step 1: Extract structured information using ChatGPT
    const structuredData = await extractStructuredIntakeInfo(transcript);

    // Step 2: Generate PDF from structured data with patient demographics
    const pdfBuffer = await generatePDF(structuredData, patientData);

    // Step 3: Convert to base64
    const base64PDF = pdfBuffer.toString("base64");

    logger.info("Intake form PDF generation completed", {
      base64Length: base64PDF.length,
    });

    return base64PDF;
  } catch (error) {
    logger.error("Error generating intake form PDF", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

module.exports = {
  generateIntakeFormPDF,
  extractStructuredIntakeInfo,
  generatePDF,
};
