const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const db = require("../db/connection");
const { updateIntakeRequestStatus } = require("../utils/offlineIntakeRequest");
const RedoxTransformer = require("../utils/redoxTransformer");
const RedoxAPIService = require("../services/redoxApiService");
const AuthService = require("../services/authService");

/**
 * @swagger
 * /api/v1/intake/{hash}:
 *   get:
 *     summary: Get intake form by unique hash
 *     tags: [Intake Forms]
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Unique hash identifier for the intake form
 *     responses:
 *       200:
 *         description: Intake form data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     requestId:
 *                       type: integer
 *                     status:
 *                       type: string
 *                     organization:
 *                       type: object
 *                       properties:
 *                         orgId:
 *                           type: integer
 *                         orgName:
 *                           type: string
 *                         logoUrl:
 *                           type: string
 *                         speciality:
 *                           type: string
 *                     intakeForm:
 *                       type: object
 *                       description: JSON structure of the intake form
 *                     patientId:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid hash format
 *       404:
 *         description: Intake form not found
 *       410:
 *         description: Intake form link has expired
 *       409:
 *         description: Intake form already completed
 */
router.get("/:hash", async (req, res, next) => {
  try {
    const { hash } = req.params;

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(hash)) {
      logger.warn("Invalid hash format provided", { hash });
      return res.status(400).json({
        success: false,
        error: "Invalid intake form link format",
      });
    }

    logger.info("Fetching intake form", { hash });

    // Start transaction
    await db.query("BEGIN");

    try {
      // Fetch the intake request
      const requestQuery = `
        SELECT 
          id,
          patient_id,
          org_id,
          speciality,
          org_intake_forms_id,
          unique_hash,
          status,
          created_at,
          updated_at,
          completed_at,
          form_data
        FROM offline_intake_requests
        WHERE unique_hash = $1
      `;

      const requestResult = await db.query(requestQuery, [hash]);

      if (requestResult.rows.length === 0) {
        await db.query("ROLLBACK");
        logger.warn("Intake request not found", { hash });
        return res.status(404).json({
          success: false,
          error: "Intake form not found",
        });
      }

      const intakeRequest = requestResult.rows[0];

      // Check if link is expired (12 hours from creation)
      const createdAt = new Date(intakeRequest.created_at);
      const now = new Date();
      const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);

      if (hoursSinceCreation > 12) {
        // Update status to expired if not already
        if (intakeRequest.status !== "expired") {
          const updateQuery = `
            UPDATE offline_intake_requests
            SET status = 'expired',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `;
          await db.query(updateQuery, [intakeRequest.id]);
          await db.query("COMMIT");

          logger.info("Intake form link expired", {
            hash,
            hoursSinceCreation,
            createdAt: intakeRequest.created_at,
          });
        } else {
          await db.query("ROLLBACK");
        }

        return res.status(410).json({
          success: false,
          error: "This intake form link has expired",
          details: {
            expiredAt: new Date(
              createdAt.getTime() + 12 * 60 * 60 * 1000,
            ).toISOString(),
            createdAt: intakeRequest.created_at,
          },
        });
      }

      // Check if form is already completed
      if (intakeRequest.status === "completed") {
        await db.query("ROLLBACK");
        logger.info("Intake form already completed", { hash });
        return res.status(409).json({
          success: false,
          error: "This intake form has already been submitted",
          completedAt: intakeRequest.completed_at,
        });
      }

      // Check if form is expired (status check)
      if (intakeRequest.status === "expired") {
        await db.query("ROLLBACK");
        return res.status(410).json({
          success: false,
          error: "This intake form link has expired",
        });
      }

      // If status is pending or in_progress, fetch organization and form data
      if (
        intakeRequest.status === "pending" ||
        intakeRequest.status === "in_progress"
      ) {
        // Update status to in_progress if it was pending
        if (intakeRequest.status === "pending") {
          const updateStatusQuery = `
            UPDATE offline_intake_requests
            SET status = 'in_progress',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `;
          await db.query(updateStatusQuery, [intakeRequest.id]);

          logger.info("Updated intake request status to in_progress", {
            requestId: intakeRequest.id,
            hash,
          });
        }

        // Fetch organization data
        const orgQuery = `
          SELECT 
            org_id,
            name as org_name,
            logo_url,
            api_key,
            retell_workspace_id,
            documents
          FROM organisations
          WHERE org_id = $1
        `;

        const orgResult = await db.query(orgQuery, [intakeRequest.org_id]);

        if (orgResult.rows.length === 0) {
          await db.query("ROLLBACK");
          logger.error("Organization not found for intake request", {
            orgId: intakeRequest.org_id,
            hash,
          });
          return res.status(500).json({
            success: false,
            error: "Organization configuration not found",
          });
        }

        const organization = orgResult.rows[0];

        // Fetch intake form JSON
        const formQuery = `
          SELECT 
            id,
            intake_form_json,
            speciality,
            created_at as form_created_at,
            updated_at as form_updated_at
          FROM org_intake_forms
          WHERE org_id = $1 AND speciality = $2
          LIMIT 1
        `;

        const formResult = await db.query(formQuery, [
          intakeRequest.org_id,
          intakeRequest.speciality,
        ]);

        let intakeFormJson = null;
        if (formResult.rows.length > 0) {
          intakeFormJson = formResult.rows[0].intake_form_json;
          logger.info("Found intake form template", {
            orgId: intakeRequest.org_id,
            speciality: intakeRequest.speciality,
            formId: formResult.rows[0].id,
          });
        } else {
          logger.warn("No intake form template found", {
            orgId: intakeRequest.org_id,
            speciality: intakeRequest.speciality,
          });
          // Continue without form template - frontend can use a default
        }

        await db.query("COMMIT");

        // Prepare response
        const responseData = {
          success: true,
          data: {
            requestId: intakeRequest.id,
            status:
              intakeRequest.status === "pending"
                ? "in_progress"
                : intakeRequest.status,
            patientId: intakeRequest.patient_id,
            organization: {
              orgId: organization.org_id,
              orgName: organization.org_name,
              logoUrl: organization.logo_url || null,
              speciality: intakeRequest.speciality,
            },
            intakeForm: intakeFormJson,
            createdAt: intakeRequest.created_at,
            expiresAt: new Date(
              createdAt.getTime() + 12 * 60 * 60 * 1000,
            ).toISOString(),
            hoursRemaining: Math.max(0, 12 - hoursSinceCreation).toFixed(1),
          },
        };

        logger.info("Successfully retrieved intake form data", {
          hash,
          orgName: organization.org_name,
          status: responseData.data.status,
        });

        res.json(responseData);
      } else {
        // Unexpected status
        await db.query("ROLLBACK");
        logger.error("Unexpected intake request status", {
          hash,
          status: intakeRequest.status,
        });

        return res.status(500).json({
          success: false,
          error: "Invalid intake form status",
        });
      }
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    logger.error("Error fetching intake form", {
      error: error.message,
      stack: error.stack,
      hash: req.params.hash,
    });
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/intake/{hash}/status:
 *   get:
 *     summary: Get just the status of an intake form
 *     tags: [Intake Forms]
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Unique hash identifier for the intake form
 *     responses:
 *       200:
 *         description: Status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: string
 *                   enum: [pending, in_progress, completed, expired]
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 completedAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Intake form not found
 */
router.get("/:hash/status", async (req, res, next) => {
  try {
    const { hash } = req.params;

    const query = `
      SELECT status, created_at, completed_at
      FROM offline_intake_requests
      WHERE unique_hash = $1
    `;

    const result = await db.query(query, [hash]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Intake form not found",
      });
    }

    const request = result.rows[0];

    // Check if expired
    const createdAt = new Date(request.created_at);
    const now = new Date();
    const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);

    let status = request.status;
    if (hoursSinceCreation > 12 && status !== "completed") {
      status = "expired";
    }

    res.json({
      success: true,
      status: status,
      createdAt: request.created_at,
      completedAt: request.completed_at,
    });
  } catch (error) {
    logger.error("Error checking intake form status", {
      error: error.message,
      hash: req.params.hash,
    });
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/intake/{hash}/verify:
 *   post:
 *     summary: Verify patient identity for intake form access
 *     tags: [Intake Forms]
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Unique hash identifier for the intake form
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date_of_birth
 *               - first_name
 *               - last_name
 *             properties:
 *               date_of_birth:
 *                 type: string
 *                 pattern: '^(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])/[0-9]{4}$'
 *                 example: "03/15/1990"
 *                 description: Date of birth in MM/DD/YYYY format
 *               first_name:
 *                 type: string
 *                 example: "John"
 *                 description: Patient's first name
 *               last_name:
 *                 type: string
 *                 example: "Doe"
 *                 description: Patient's last name
 *     responses:
 *       200:
 *         description: Verification successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 verified:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     patientId:
 *                       type: string
 *                     canProceed:
 *                       type: boolean
 *       400:
 *         description: Invalid input data
 *       404:
 *         description: Intake form not found
 *       410:
 *         description: Intake form expired
 *       401:
 *         description: Verification failed
 */
router.post("/:hash/verify", async (req, res, next) => {
  try {
    const { hash } = req.params;
    const { date_of_birth, first_name, last_name } = req.body;

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(hash)) {
      logger.warn("Invalid hash format for verification", { hash });
      return res.status(400).json({
        success: false,
        error: "Invalid intake form link format",
      });
    }

    // Validate required fields
    if (!date_of_birth || !first_name || !last_name) {
      logger.warn("Missing required verification fields", { hash });
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: date_of_birth, first_name, and last_name are required",
      });
    }

    // Convert date format from MM/DD/YYYY to YYYY-MM-DD
    const dateParts = date_of_birth.split("/");
    if (dateParts.length !== 3) {
      logger.warn("Invalid date format", { date_of_birth, hash });
      return res.status(400).json({
        success: false,
        error: "Invalid date format. Expected MM/DD/YYYY",
      });
    }
    const formattedDob = `${dateParts[2]}-${dateParts[0].padStart(2, "0")}-${dateParts[1].padStart(2, "0")}`;

    // Retrieve the intake request from database
    const intakeQuery = `
      SELECT 
        id,
        patient_id,
        org_id,
        status,
        created_at
      FROM offline_intake_requests
      WHERE unique_hash = $1
    `;

    const intakeResult = await db.query(intakeQuery, [hash]);

    if (intakeResult.rows.length === 0) {
      logger.warn("Intake request not found for hash", { hash });
      return res.status(404).json({
        success: false,
        error: "Intake form not found",
      });
    }

    const intakeRequest = intakeResult.rows[0];

    // Check if link is expired (12 hours from creation)
    const createdAt = new Date(intakeRequest.created_at);
    const now = new Date();
    const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);

    if (hoursSinceCreation > 12) {
      logger.info("Intake form link expired during verification", {
        hash,
        hoursSinceCreation,
      });
      return res.status(410).json({
        success: false,
        error: "This intake form link has expired",
      });
    }

    // Check if form is already completed
    if (intakeRequest.status === "completed") {
      logger.info("Intake form already completed", { hash });
      return res.status(409).json({
        success: false,
        error: "This intake form has already been submitted",
      });
    }

    try {
      // Generate new access token for verification
      const authService = new AuthService();
      const accessToken = await authService.getAccessToken();

      // Create search parameters for patient search
      const searchParams = RedoxTransformer.createPatientSearchByDobNameParams(
        formattedDob,
        first_name,
        last_name
      );

      logger.info("Searching for patient with Redox", {
        hash,
        dob: formattedDob,
        firstName: first_name,
        lastName: last_name,
      });

      // Search for patient using Redox API
      const searchResponse = await RedoxAPIService.makeRequest(
        "POST",
        "/Patient/_search",
        null,
        searchParams,
        accessToken
      );

      // Transform and extract patient list from response
      const patients = RedoxTransformer.transformPatientSearchResponse(searchResponse);

      logger.info("Patient search completed", {
        hash,
        patientsFound: patients.length,
        storedPatientId: intakeRequest.patient_id,
      });

      // Check if any of the found patients match the stored patient ID
      const matchingPatient = patients.find(
        (patient) => patient.patientId === intakeRequest.patient_id
      );

      if (matchingPatient) {
        logger.info("Patient verification successful", {
          hash,
          patientId: intakeRequest.patient_id,
        });

        res.json({
          success: true,
          verified: true,
          message: "Patient verification successful",
          data: {
            patientId: intakeRequest.patient_id,
            canProceed: true,
          },
        });
      } else {
        logger.warn("Patient verification failed - no matching patient", {
          hash,
          storedPatientId: intakeRequest.patient_id,
          foundPatientIds: patients.map((p) => p.patientId),
        });

        res.status(401).json({
          success: false,
          verified: false,
          message: "Patient verification failed",
          data: {
            canProceed: false,
          },
        });
      }
    } catch (redoxError) {
      logger.error("Error calling Redox API for patient verification", {
        error: redoxError.message,
        hash,
      });

      // Return cannot proceed on any Redox API error
      return res.status(401).json({
        success: false,
        verified: false,
        message: "Unable to verify patient information",
        data: {
          canProceed: false,
        },
      });
    }
  } catch (error) {
    logger.error("Error during patient verification", {
      error: error.message,
      stack: error.stack,
      hash: req.params.hash,
    });
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/intake/{hash}/submit:
 *   post:
 *     summary: Submit completed intake form
 *     tags: [Intake Forms]
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Unique hash identifier for the intake form
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Completed form data (structure depends on form template)
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Form submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     requestId:
 *                       type: integer
 *                     submittedAt:
 *                       type: string
 *                       format: date-time
 *                     confirmationNumber:
 *                       type: string
 *       400:
 *         description: Invalid submission data
 *       404:
 *         description: Intake form not found
 *       409:
 *         description: Form already submitted
 *       410:
 *         description: Form link expired
 */
router.post("/:hash/submit", async (req, res, next) => {
  try {
    const { hash } = req.params;
    const formData = req.body;

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(hash)) {
      logger.warn("Invalid hash format for submission", { hash });
      return res.status(400).json({
        success: false,
        error: "Invalid intake form link format",
      });
    }

    logger.info("Intake form submission attempt", {
      hash,
      hasFormData: !!formData && Object.keys(formData).length > 0,
    });

    //send data to redox

    res.json({
      success: true,
      message: "Intake form submission endpoint ready (logic not implemented)",
      data: {
        requestId: null,
        submittedAt: new Date().toISOString(),
        confirmationNumber: `INT-TEMP-${Date.now()}`,
      },
    });
  } catch (error) {
    logger.error("Error during intake form submission", {
      error: error.message,
      stack: error.stack,
      hash: req.params.hash,
    });
    next(error);
  }
});

module.exports = router;
