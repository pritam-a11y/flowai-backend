const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");
const axios = require("axios");

/**
 * Creates an offline intake request for a patient
 * @param {Object} db - Database connection
 * @param {string} patientId - Patient ID from Redox
 * @param {number} orgId - Organization ID
 * @param {string} speciality - Medical speciality
 * @returns {Promise<Object>} - Created intake request with unique hash
 */
async function createOfflineIntakeRequest(db, patientId, orgId, speciality) {
  try {
    // Validate required parameters
    if (!patientId || !orgId || !speciality) {
      throw new Error(
        "Missing required parameters: patientId, orgId, and speciality are required",
      );
    }

    // Generate unique hash for this request
    const uniqueHash = uuidv4();

    logger.info("Creating offline intake request", {
      patientId,
      orgId,
      speciality,
      uniqueHash,
    });

    // Start transaction
    await db.query("BEGIN");

    try {
      // 1. First, fetch the org_intake_forms_id from org_intake_forms table
      const intakeFormQuery = `
        SELECT id 
        FROM org_intake_forms 
        WHERE org_id = $1 
        AND speciality = $2 
        LIMIT 1
      `;

      const intakeFormResult = await db.query(intakeFormQuery, [
        orgId,
        speciality,
      ]);

      let orgIntakeFormsId = null;

      if (intakeFormResult.rows.length === 0) {
        logger.warn("No intake form found for org and speciality", {
          orgId,
          speciality,
        });
        // Continue without org_intake_forms_id (it's nullable)
      } else {
        orgIntakeFormsId = intakeFormResult.rows[0].id;
        logger.info("Found intake form", {
          orgId,
          speciality,
          orgIntakeFormsId,
        });
      }

      // 2. Check if an active request already exists for this patient/org/speciality
      const existingRequestQuery = `
        SELECT id, unique_hash, status, created_at
        FROM offline_intake_requests
        WHERE patient_id = $1 
        AND org_id = $2 
        AND speciality = $3
        AND status IN ('pending', 'in_progress')
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const existingRequest = await db.query(existingRequestQuery, [
        patientId,
        orgId,
        speciality,
      ]);

      if (existingRequest.rows.length > 0) {
        // Return existing active request
        await db.query("COMMIT");

        logger.info("Found existing active intake request", {
          requestId: existingRequest.rows[0].id,
          uniqueHash: existingRequest.rows[0].unique_hash,
          status: existingRequest.rows[0].status,
        });

        return {
          success: true,
          isNew: false,
          data: {
            id: existingRequest.rows[0].id,
            uniqueHash: existingRequest.rows[0].unique_hash,
            status: existingRequest.rows[0].status,
            createdAt: existingRequest.rows[0].created_at,
            message: "Existing active intake request found",
          },
        };
      }

      // 3. Create new offline intake request
      const insertQuery = `
        INSERT INTO offline_intake_requests (
          patient_id,
          org_id,
          speciality,
          org_intake_forms_id,
          unique_hash,
          status,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `;

      const insertResult = await db.query(insertQuery, [
        patientId,
        orgId,
        speciality,
        orgIntakeFormsId,
        uniqueHash,
        "pending",
      ]);

      if (insertResult.rows.length === 0) {
        throw new Error("Failed to create offline intake request");
      }

      const createdRequest = insertResult.rows[0];

      // Commit transaction
      await db.query("COMMIT");

      logger.info("Successfully created offline intake request", {
        requestId: createdRequest.id,
        uniqueHash: createdRequest.unique_hash,
        patientId,
        orgId,
        speciality,
        orgIntakeFormsId,
      });

      // Generate the intake form URL
      const intakeFormUrl = generateIntakeFormUrl(uniqueHash);

      // Optionally create a shortened URL
      const finalUrl = await createTinyUrl(intakeFormUrl);

      return {
        success: true,
        isNew: true,
        data: {
          id: createdRequest.id,
          uniqueHash: createdRequest.unique_hash,
          patientId: createdRequest.patient_id,
          orgId: createdRequest.org_id,
          speciality: createdRequest.speciality,
          orgIntakeFormsId: createdRequest.org_intake_forms_id,
          status: createdRequest.status,
          createdAt: createdRequest.created_at,
          intakeFormUrl: finalUrl,
          originalUrl: intakeFormUrl,
        },
      };
    } catch (error) {
      // Rollback transaction on error
      await db.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    logger.error("Error creating offline intake request", {
      error: error.message,
      stack: error.stack,
      patientId,
      orgId,
      speciality,
    });

    return {
      success: false,
      error: error.message,
      data: null,
    };
  }
}

/**
 * Generates the intake form URL for a given unique hash
 * @param {string} uniqueHash - The unique hash for the intake request
 * @returns {string} - The complete intake form URL
 */
function generateIntakeFormUrl(uniqueHash) {
  // Use environment variable if set, otherwise use default dev URL
  const baseUrl =
    process.env.INTAKE_FORM_BASE_URL || "https://dev.myflowai.com";
  return `${baseUrl}/intake/${uniqueHash}`;
}

/**
 * Creates a shortened URL using various URL shortening services
 * @param {string} longUrl - The long URL to shorten
 * @returns {Promise<string>} - The shortened URL or original if shortening fails
 */
async function createTinyUrl(longUrl) {
  try {
    const urlShortenerService = process.env.URL_SHORTENER_SERVICE || "tinyurl"; // 'bitly' or 'tinyurl'

    if (urlShortenerService === "bitly") {
      return await createBitlyUrl(longUrl);
    } else if (urlShortenerService === "tinyurl") {
      return await createTinyUrlService(longUrl);
    } else {
      // Fallback to simple custom short URL
      return await createCustomShortUrl(longUrl);
    }
  } catch (error) {
    logger.warn("Failed to create short URL, using original", {
      error: error.message,
      originalUrl: longUrl,
    });
    return longUrl;
  }
}

/**
 * Creates a shortened URL using Bitly
 * @param {string} longUrl - The long URL to shorten
 * @returns {Promise<string>} - The shortened URL
 */
async function createBitlyUrl(longUrl) {
  try {
    const bitlyToken = process.env.BITLY_ACCESS_TOKEN;

    if (!bitlyToken) {
      logger.warn("Bitly access token not configured");
      return longUrl;
    }

    const response = await axios.post(
      "https://api-ssl.bitly.com/v4/shorten",
      {
        long_url: longUrl,
        domain: "bit.ly",
      },
      {
        headers: {
          Authorization: `Bearer ${bitlyToken}`,
          "Content-Type": "application/json",
        },
        timeout: 3000,
      },
    );

    if (response.data && response.data.link) {
      logger.info("Successfully created Bitly URL", {
        originalUrl: longUrl,
        shortUrl: response.data.link,
      });
      return response.data.link;
    }

    return longUrl;
  } catch (error) {
    logger.error("Bitly API error", { error: error.message });
    return longUrl;
  }
}

/**
 * Creates a shortened URL using TinyURL
 * @param {string} longUrl - The long URL to shorten
 * @returns {Promise<string>} - The shortened URL
 */
async function createTinyUrlService(longUrl) {
  try {
    const tinyUrlApiKey =
      "ZU3i5w8JnS62ZVqhKWoEQpWOrdIEHWh4T4mQaNz8zdMUuXw7yiYJzWokKwqg";

    if (!tinyUrlApiKey) {
      logger.warn("TinyURL API key not configured");
      return longUrl;
    }

    const response = await axios.post(
      "https://api.tinyurl.com/create",
      {
        url: longUrl,
        domain: "tinyurl.com",
        description: "Patient Intake Form",
      },
      {
        headers: {
          Authorization: `Bearer ${tinyUrlApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 3000,
      },
    );

    if (response.data && response.data.data && response.data.data.tiny_url) {
      logger.info("Successfully created TinyURL", {
        originalUrl: longUrl,
        tinyUrl: response.data.data.tiny_url,
      });
      return response.data.data.tiny_url;
    }

    return longUrl;
  } catch (error) {
    logger.error("TinyURL API error", { error: error.message });
    return longUrl;
  }
}

/**
 * Creates a custom short URL using your own domain
 * @param {string} longUrl - The long URL to shorten
 * @returns {Promise<string>} - The shortened URL
 */
async function createCustomShortUrl(longUrl) {
  try {
    // Extract the UUID from the URL
    const uuidMatch = longUrl.match(/\/intake\/([a-f0-9-]+)$/i);

    if (!uuidMatch) {
      return longUrl;
    }

    const uuid = uuidMatch[1];
    // Create a shorter version using first 8 characters of UUID
    const shortCode = uuid.substring(0, 8);

    // Use a shorter domain if configured
    const shortDomain = process.env.SHORT_DOMAIN || "https://dev.myflowai.com";
    const customShortUrl = `${shortDomain}/i/${shortCode}`;

    logger.info("Created custom short URL", {
      originalUrl: longUrl,
      shortUrl: customShortUrl,
    });

    // Note: You would need to implement the redirect logic on your server
    // to handle /i/{shortCode} and redirect to /intake/{fullUuid}

    return customShortUrl;
  } catch (error) {
    logger.error("Custom short URL error", { error: error.message });
    return longUrl;
  }
}

/**
 * Updates the status of an offline intake request
 * @param {Object} db - Database connection
 * @param {string} uniqueHash - Unique hash of the request
 * @param {string} status - New status ('pending', 'in_progress', 'completed', 'expired')
 * @param {Object} formData - Optional form data (for completed status)
 * @returns {Promise<Object>} - Updated request
 */
async function updateIntakeRequestStatus(
  db,
  uniqueHash,
  status,
  formData = null,
) {
  try {
    let updateQuery;
    let queryParams;

    if (status === "completed" && formData) {
      updateQuery = `
        UPDATE offline_intake_requests
        SET status = $2,
            form_data = $3,
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE unique_hash = $1
        RETURNING *
      `;
      queryParams = [uniqueHash, status, JSON.stringify(formData)];
    } else {
      updateQuery = `
        UPDATE offline_intake_requests
        SET status = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE unique_hash = $1
        RETURNING *
      `;
      queryParams = [uniqueHash, status];
    }

    const result = await db.query(updateQuery, queryParams);

    if (result.rows.length === 0) {
      throw new Error("Intake request not found");
    }

    logger.info("Updated intake request status", {
      uniqueHash,
      newStatus: status,
      hasFormData: !!formData,
    });

    return {
      success: true,
      data: result.rows[0],
    };
  } catch (error) {
    logger.error("Error updating intake request status", {
      error: error.message,
      uniqueHash,
      status,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Gets an offline intake request by unique hash
 * @param {Object} db - Database connection
 * @param {string} uniqueHash - Unique hash of the request
 * @returns {Promise<Object>} - The intake request
 */
async function getIntakeRequestByHash(db, uniqueHash) {
  try {
    const query = `
      SELECT 
        oir.*,
        oif.intake_form_json
      FROM offline_intake_requests oir
      LEFT JOIN org_intake_forms oif 
        ON oir.org_intake_forms_id = oif.id
      WHERE oir.unique_hash = $1
    `;

    const result = await db.query(query, [uniqueHash]);

    if (result.rows.length === 0) {
      return {
        success: false,
        error: "Intake request not found",
      };
    }

    return {
      success: true,
      data: result.rows[0],
    };
  } catch (error) {
    logger.error("Error fetching intake request", {
      error: error.message,
      uniqueHash,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  createOfflineIntakeRequest,
  updateIntakeRequestStatus,
  getIntakeRequestByHash,
  generateIntakeFormUrl,
  createTinyUrl,
};
