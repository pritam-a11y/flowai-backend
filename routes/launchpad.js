const express = require("express");
const router = express.Router();
const multer = require("multer");
const jwtMiddleware = require("../middleware/jwt");
const { validateOrgAccess } = require("../middleware/orgAccess");
const requireFeaturePermission = require("../middleware/featureAccess");
const logger = require("../utils/logger");
const db = require("../db/connection");
const s3DocumentService = require("../services/s3DocumentService");
const OpenAI = require("openai");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
} = require("docx");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Allowed file types
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `File type ${file.mimetype} not allowed. Allowed types: PDF, DOC, DOCX, XLS, XLSX, TXT, JPEG, PNG, GIF, WEBP`,
        ),
      );
    }
  },
});

/**
 * @swagger
 * tags:
 *   name: Launchpad
 *   description: Organization launchpad configuration endpoints
 */

/**
 * Fetch complete organization data from new database structure
 */
const fetchOrganizationData = async (orgId, userRole) => {
  try {
    // Fetch organization basic info
    const orgResult = await db.query(
      `SELECT org_id, name, created_at, updated_at
       FROM organisations 
       WHERE org_id = $1`,
      [orgId],
    );

    if (orgResult.rows.length === 0) {
      throw new Error("Organization not found");
    }

    const organization = orgResult.rows[0];

    // Fetch account details
    const accountDetailsResult = await db.query(
      `SELECT id, org_id, account_name, website_address, headquarters_address,
              decision_makers, influencers, scheduling_structure, rcm_structure,
              order_entry_team, scheduling_team, patient_intake_team, rcm_team,
              order_entry_team_size, scheduling_team_size, 
              patient_intake_team_size, rcm_team_size,
              monthly_orders_count, monthly_patients_scheduled, 
              monthly_patients_checked_in,
              emr_ris_systems, telephony_ccas_systems, 
              scheduling_phone_numbers,
              insurance_verification_system, insurance_verification_details,
              additional_info, clinical_notes, documents,
              created_at, updated_at
       FROM org_account_details 
       WHERE org_id = $1`,
      [orgId],
    );

    // Fetch locations
    const locationsResult = await db.query(
      `SELECT id, org_id, name, address_line1, address_line2, 
              city, state, zip_code,
              weekday_hours, weekend_hours, location_id, 
              specialties_services, parking_directions, documents,
              is_active, created_at, updated_at
       FROM org_locations 
       WHERE org_id = $1 AND is_active = true
       ORDER BY name`,
      [orgId],
    );

    const specialtyResult = await db.query(
      `SELECT id, org_id, specialty_name, location_ids, 
              physician_names_source_type, physician_names_source_name,
              new_patients_source_type, new_patients_source_name,
              physician_locations_source_type, physician_locations_source_name,
              physician_credentials_source_type, physician_credentials_source_name,
              services, services_offered_source_type, services_offered_source_name,
              patient_prep_source_type, patient_prep_source_name,
              patient_faqs_source_type, patient_faqs_source_name,
              documents, is_active, created_at, updated_at
       FROM org_speciality_services 
       WHERE org_id = $1 AND is_active = true
       ORDER BY specialty_name`,
      [orgId],
    );

    // Fetch insurance info
    const insuranceResult = await db.query(
      `SELECT id, org_id, accepted_payers_source, accepted_payers_source_details,
              insurance_verification_source, insurance_verification_source_details,
              patient_copay_source, patient_copay_source_details,
              documents, is_active, created_at, updated_at
       FROM org_insurance 
       WHERE org_id = $1 AND is_active = true`,
      [orgId],
    );

    // Build response with new structure
    const organizationData = {
      organization: organization,
      account_details: accountDetailsResult.rows[0] || null,
      locations: locationsResult.rows,
      speciality_services: specialtyResult.rows,
      insurance: insuranceResult.rows[0] || null,
      metadata: {
        last_updated: organization.updated_at || new Date().toISOString(),
        org_id: orgId,
        user_role: userRole,
        can_edit: requireFeaturePermission("launchpad", "write"),
      },
    };

    return organizationData;
  } catch (error) {
    logger.error("Error fetching organization data", {
      error: error.message,
      orgId: orgId,
    });
    throw error;
  }
};

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/fetch-data:
 *   post:
 *     summary: Fetch complete organization launchpad data
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: org_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Organization ID
 *     responses:
 *       200:
 *         description: Organization launchpad data
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
 *                     organization:
 *                       type: object
 *                     account_details:
 *                       type: object
 *                     locations:
 *                       type: array
 *                     speciality_services:
 *                       type: array
 *                     insurance:
 *                       type: object
 *       403:
 *         description: Access denied
 *       404:
 *         description: Organization not found
 */
router.post(
  "/:org_id/fetch-data",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "read"),
  async (req, res) => {
    try {
      const orgId = parseInt(req.params.org_id);

      logger.info("Fetching organization launchpad data", {
        org_id: orgId,
        user_id: req.user.userId,
      });

      const organizationData = await fetchOrganizationData(
        orgId,
        req.user.role,
      );

      res.json({
        success: true,
        data: organizationData,
      });
    } catch (error) {
      logger.error("Error fetching organization data", {
        error: error.message,
        user_id: req.user.userId,
      });

      if (error.message === "Organization not found") {
        return res.status(404).json({
          success: false,
          error: "Organization not found",
        });
      }

      res.status(500).json({
        success: false,
        error: "Failed to fetch organization data",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/update-account-details:
 *   post:
 *     summary: Update organization account details
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/update-account-details",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const { data } = req.body;
      const orgId = parseInt(req.params.org_id);

      logger.info("Updating organization account details", {
        org_id: orgId,
        user_id: req.user.userId,
      });

      // Check if account details exist
      const existingResult = await db.query(
        `SELECT id FROM org_account_details WHERE org_id = $1`,
        [orgId],
      );

      if (existingResult.rows.length === 0) {
        // Insert new record
        await db.query(
          `INSERT INTO org_account_details (
            org_id, account_name, website_address, headquarters_address,
            decision_makers, influencers, 
            scheduling_structure, rcm_structure,
            order_entry_team, scheduling_team, patient_intake_team, rcm_team,
            order_entry_team_size, scheduling_team_size, 
            patient_intake_team_size, rcm_team_size,
            monthly_orders_count, monthly_patients_scheduled, 
            monthly_patients_checked_in,
            emr_ris_systems, telephony_ccas_systems, 
            scheduling_phone_numbers,
            insurance_verification_system, insurance_verification_details,
            additional_info, clinical_notes, documents,
            created_by, updated_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 
            $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 
            $23, $24, $25, $26, $27, $28, $28
          )`,
          [
            orgId,
            data.account_name,
            data.website_address,
            data.headquarters_address,
            JSON.stringify(data.decision_makers || []),
            JSON.stringify(data.influencers || []),
            data.scheduling_structure,
            data.rcm_structure,
            JSON.stringify(data.order_entry_team || []),
            JSON.stringify(data.scheduling_team || []),
            JSON.stringify(data.patient_intake_team || []),
            JSON.stringify(data.rcm_team || []),
            data.order_entry_team_size,
            data.scheduling_team_size,
            data.patient_intake_team_size,
            data.rcm_team_size,
            data.monthly_orders_count,
            data.monthly_patients_scheduled,
            data.monthly_patients_checked_in,
            JSON.stringify(data.emr_ris_systems || []),
            JSON.stringify(data.telephony_ccas_systems || []),
            JSON.stringify(data.scheduling_phone_numbers || []),
            data.insurance_verification_system,
            data.insurance_verification_details,
            data.additional_info,
            data.clinical_notes,
            JSON.stringify(data.documents || []),
            req.user.userId,
          ],
        );
      } else {
        // Update existing record
        await db.query(
          `UPDATE org_account_details SET
            account_name = $2,
            website_address = $3,
            headquarters_address = $4,
            decision_makers = $5,
            influencers = $6,
            scheduling_structure = $7,
            rcm_structure = $8,
            order_entry_team = $9,
            scheduling_team = $10,
            patient_intake_team = $11,
            rcm_team = $12,
            order_entry_team_size = $13,
            scheduling_team_size = $14,
            patient_intake_team_size = $15,
            rcm_team_size = $16,
            monthly_orders_count = $17,
            monthly_patients_scheduled = $18,
            monthly_patients_checked_in = $19,
            emr_ris_systems = $20,
            telephony_ccas_systems = $21,
            scheduling_phone_numbers = $22,
            insurance_verification_system = $23,
            insurance_verification_details = $24,
            additional_info = $25,
            clinical_notes = $26,
            documents = $27,
            updated_by = $28,
            updated_at = CURRENT_TIMESTAMP
          WHERE org_id = $1`,
          [
            orgId,
            data.account_name,
            data.website_address,
            data.headquarters_address,
            JSON.stringify(data.decision_makers || []),
            JSON.stringify(data.influencers || []),
            data.scheduling_structure,
            data.rcm_structure,
            JSON.stringify(data.order_entry_team || []),
            JSON.stringify(data.scheduling_team || []),
            JSON.stringify(data.patient_intake_team || []),
            JSON.stringify(data.rcm_team || []),
            data.order_entry_team_size,
            data.scheduling_team_size,
            data.patient_intake_team_size,
            data.rcm_team_size,
            data.monthly_orders_count,
            data.monthly_patients_scheduled,
            data.monthly_patients_checked_in,
            JSON.stringify(data.emr_ris_systems || []),
            JSON.stringify(data.telephony_ccas_systems || []),
            JSON.stringify(data.scheduling_phone_numbers || []),
            data.insurance_verification_system,
            data.insurance_verification_details,
            data.additional_info,
            data.clinical_notes,
            JSON.stringify(data.documents || []),
            req.user.userId,
          ],
        );
      }

      // Fetch and return updated data
      const organizationData = await fetchOrganizationData(
        orgId,
        req.user.role,
      );

      res.json({
        success: true,
        data: organizationData,
      });
    } catch (error) {
      logger.error("Error updating account details", {
        error: error.message,
        user_id: req.user.userId,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update account details",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/update-locations:
 *   post:
 *     summary: Update organization locations
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/update-locations",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const { locations } = req.body;
      const orgId = parseInt(req.params.org_id);

      logger.info("Updating organization locations", {
        org_id: orgId,
        user_id: req.user.userId,
        location_count: locations?.length || 0,
      });

      // Start transaction
      await db.query("BEGIN");

      try {
        // Soft delete existing locations
        await db.query(
          `UPDATE org_locations 
           SET is_active = false, 
               updated_by = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE org_id = $1 AND is_active = true`,
          [orgId, req.user.userId],
        );

        // Insert new locations
        if (Array.isArray(locations) && locations.length > 0) {
          for (const location of locations) {
            await db.query(
              `INSERT INTO org_locations (
                org_id, name, address_line1, address_line2, 
                city, state, zip_code, 
                weekday_hours, weekend_hours, location_id,
                specialties_services, parking_directions, documents,
                is_active, created_by, updated_by
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
                $11, $12, $13, $14, $15, $15
              )`,
              [
                orgId,
                location.name,
                location.address_line1,
                location.address_line2,
                location.city,
                location.state,
                location.zip_code,
                location.weekday_hours,
                location.weekend_hours,
                location.location_id,
                JSON.stringify(location.specialties_services || []),
                location.parking_directions,
                JSON.stringify(location.documents || []),
                true,
                req.user.userId,
              ],
            );
          }
        }

        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }

      // Fetch and return updated data
      const organizationData = await fetchOrganizationData(
        orgId,
        req.user.role,
      );

      res.json({
        success: true,
        data: organizationData,
      });
    } catch (error) {
      logger.error("Error updating locations", {
        error: error.message,
        user_id: req.user.userId,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update locations",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/update-specialties:
 *   post:
 *     summary: Update organization specialty services
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/update-specialties",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const { speciality_services } = req.body;
      const orgId = parseInt(req.params.org_id);

      logger.info("Updating organization specialty services", {
        org_id: orgId,
        user_id: req.user.userId,
      });

      // Start transaction
      await db.query("BEGIN");

      try {
        // Soft delete existing specialties
        await db.query(
          `UPDATE org_speciality_services 
           SET is_active = false, 
               updated_by = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE org_id = $1 AND is_active = true`,
          [orgId, req.user.userId],
        );

        // Insert new specialties
        if (
          Array.isArray(speciality_services) &&
          speciality_services.length > 0
        ) {
          for (const specialty of speciality_services) {
            // Update the INSERT query
            await db.query(
              `INSERT INTO org_speciality_services (
                org_id, specialty_name, location_ids,
                physician_names_source_type, physician_names_source_name,
                new_patients_source_type, new_patients_source_name,
                physician_locations_source_type, physician_locations_source_name,
                physician_credentials_source_type, physician_credentials_source_name,
                services, services_offered_source_type, services_offered_source_name,
                patient_prep_source_type, patient_prep_source_name,
                patient_faqs_source_type, patient_faqs_source_name,
                documents, is_active, created_by, updated_by
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
                $11, $12, $13, $14, $15, $16, $17, $18, $19, 
                $20, $21, $21
              )`,
              [
                orgId,
                specialty.specialty_name,
                specialty.location_ids || [],
                specialty.physician_names_source_type,
                specialty.physician_names_source_name,
                specialty.new_patients_source_type,
                specialty.new_patients_source_name,
                specialty.physician_locations_source_type,
                specialty.physician_locations_source_name,
                specialty.physician_credentials_source_type,
                specialty.physician_credentials_source_name,
                JSON.stringify(specialty.services || []),
                specialty.services_offered_source_type,
                specialty.services_offered_source_name,
                specialty.patient_prep_source_type,
                specialty.patient_prep_source_name,
                specialty.patient_faqs_source_type,
                specialty.patient_faqs_source_name,
                JSON.stringify(specialty.documents || []),
                true,
                req.user.userId,
              ],
            );
          }
        }

        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }

      // Fetch and return updated data
      const organizationData = await fetchOrganizationData(
        orgId,
        req.user.role,
      );

      res.json({
        success: true,
        data: organizationData,
      });
    } catch (error) {
      logger.error("Error updating specialty services", {
        error: error.message,
        user_id: req.user.userId,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update specialty services",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/update-insurance:
 *   post:
 *     summary: Update organization insurance information
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/update-insurance",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const { insurance } = req.body;
      const orgId = parseInt(req.params.org_id);

      logger.info("Updating organization insurance info", {
        org_id: orgId,
        user_id: req.user.userId,
      });

      // Check if insurance record exists
      const existingResult = await db.query(
        `SELECT id FROM org_insurance WHERE org_id = $1`,
        [orgId],
      );

      if (existingResult.rows.length === 0) {
        // Insert new record
        await db.query(
          `INSERT INTO org_insurance (
            org_id, 
            accepted_payers_source, accepted_payers_source_details,
            insurance_verification_source, insurance_verification_source_details,
            patient_copay_source, patient_copay_source_details,
            documents, is_active, created_by, updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
          [
            orgId,
            insurance.accepted_payers_source,
            insurance.accepted_payers_source_details,
            insurance.insurance_verification_source,
            insurance.insurance_verification_source_details,
            insurance.patient_copay_source,
            insurance.patient_copay_source_details,
            JSON.stringify(insurance.documents || []),
            true,
            req.user.userId,
          ],
        );
      } else {
        // Update existing record
        await db.query(
          `UPDATE org_insurance SET
            accepted_payers_source = $2,
            accepted_payers_source_details = $3,
            insurance_verification_source = $4,
            insurance_verification_source_details = $5,
            patient_copay_source = $6,
            patient_copay_source_details = $7,
            documents = $8,
            updated_by = $9,
            updated_at = CURRENT_TIMESTAMP
          WHERE org_id = $1`,
          [
            orgId,
            insurance.accepted_payers_source,
            insurance.accepted_payers_source_details,
            insurance.insurance_verification_source,
            insurance.insurance_verification_source_details,
            insurance.patient_copay_source,
            insurance.patient_copay_source_details,
            JSON.stringify(insurance.documents || []),
            req.user.userId,
          ],
        );
      }

      // Fetch and return updated data
      const organizationData = await fetchOrganizationData(
        orgId,
        req.user.role,
      );

      res.json({
        success: true,
        data: organizationData,
      });
    } catch (error) {
      logger.error("Error updating insurance info", {
        error: error.message,
        user_id: req.user.userId,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update insurance info",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/save-all:
 *   post:
 *     summary: Save all organization launchpad sections at once
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/save-all",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const { account_details, locations, speciality_services, insurance } =
        req.body;
      const orgId = parseInt(req.params.org_id);

      logger.info("Updating all organization launchpad sections", {
        org_id: orgId,
        user_id: req.user.userId,
      });

      // Start transaction
      await db.query("BEGIN");

      try {
        // Update account details if provided
        if (account_details) {
          const existingAccount = await db.query(
            `SELECT id FROM org_account_details WHERE org_id = $1`,
            [orgId],
          );

          if (existingAccount.rows.length === 0) {
            // Insert new
            await db.query(
              `INSERT INTO org_account_details (
                org_id, account_name, website_address, headquarters_address,
                decision_makers, influencers, scheduling_structure, rcm_structure,
                order_entry_team, scheduling_team, patient_intake_team, rcm_team,
                order_entry_team_size, scheduling_team_size, 
                patient_intake_team_size, rcm_team_size,
                monthly_orders_count, monthly_patients_scheduled, 
                monthly_patients_checked_in,
                emr_ris_systems, telephony_ccas_systems, scheduling_phone_numbers,
                insurance_verification_system, insurance_verification_details,
                additional_info, clinical_notes, documents,
                created_by, updated_by
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 
                $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, 
                $23, $24, $25, $26, $27, $28, $28
              )`,
              [
                orgId,
                account_details.account_name,
                account_details.website_address,
                account_details.headquarters_address,
                JSON.stringify(account_details.decision_makers || []),
                JSON.stringify(account_details.influencers || []),
                account_details.scheduling_structure,
                account_details.rcm_structure,
                JSON.stringify(account_details.order_entry_team || []),
                JSON.stringify(account_details.scheduling_team || []),
                JSON.stringify(account_details.patient_intake_team || []),
                JSON.stringify(account_details.rcm_team || []),
                account_details.order_entry_team_size,
                account_details.scheduling_team_size,
                account_details.patient_intake_team_size,
                account_details.rcm_team_size,
                account_details.monthly_orders_count,
                account_details.monthly_patients_scheduled,
                account_details.monthly_patients_checked_in,
                JSON.stringify(account_details.emr_ris_systems || []),
                JSON.stringify(account_details.telephony_ccas_systems || []),
                JSON.stringify(account_details.scheduling_phone_numbers || []),
                account_details.insurance_verification_system,
                account_details.insurance_verification_details,
                account_details.additional_info,
                account_details.clinical_notes,
                JSON.stringify(account_details.documents || []),
                req.user.userId,
              ],
            );
          } else {
            // Update existing
            await db.query(
              `UPDATE org_account_details SET
                account_name = $2,
                website_address = $3,
                headquarters_address = $4,
                decision_makers = $5,
                influencers = $6,
                scheduling_structure = $7,
                rcm_structure = $8,
                order_entry_team = $9,
                scheduling_team = $10,
                patient_intake_team = $11,
                rcm_team = $12,
                order_entry_team_size = $13,
                scheduling_team_size = $14,
                patient_intake_team_size = $15,
                rcm_team_size = $16,
                monthly_orders_count = $17,
                monthly_patients_scheduled = $18,
                monthly_patients_checked_in = $19,
                emr_ris_systems = $20,
                telephony_ccas_systems = $21,
                scheduling_phone_numbers = $22,
                insurance_verification_system = $23,
                insurance_verification_details = $24,
                additional_info = $25,
                clinical_notes = $26,
                documents = $27,
                updated_by = $28,
                updated_at = CURRENT_TIMESTAMP
              WHERE org_id = $1`,
              [
                orgId,
                account_details.account_name,
                account_details.website_address,
                account_details.headquarters_address,
                JSON.stringify(account_details.decision_makers || []),
                JSON.stringify(account_details.influencers || []),
                account_details.scheduling_structure,
                account_details.rcm_structure,
                JSON.stringify(account_details.order_entry_team || []),
                JSON.stringify(account_details.scheduling_team || []),
                JSON.stringify(account_details.patient_intake_team || []),
                JSON.stringify(account_details.rcm_team || []),
                account_details.order_entry_team_size,
                account_details.scheduling_team_size,
                account_details.patient_intake_team_size,
                account_details.rcm_team_size,
                account_details.monthly_orders_count,
                account_details.monthly_patients_scheduled,
                account_details.monthly_patients_checked_in,
                JSON.stringify(account_details.emr_ris_systems || []),
                JSON.stringify(account_details.telephony_ccas_systems || []),
                JSON.stringify(account_details.scheduling_phone_numbers || []),
                account_details.insurance_verification_system,
                account_details.insurance_verification_details,
                account_details.additional_info,
                account_details.clinical_notes,
                JSON.stringify(account_details.documents || []),
                req.user.userId,
              ],
            );
          }
        }

        // Update locations if provided
        if (locations && Array.isArray(locations)) {
          // Soft delete existing
          await db.query(
            `UPDATE org_locations 
             SET is_active = false, updated_by = $2, updated_at = CURRENT_TIMESTAMP
             WHERE org_id = $1 AND is_active = true`,
            [orgId, req.user.userId],
          );

          // Insert new
          for (const location of locations) {
            await db.query(
              `INSERT INTO org_locations (
                org_id, name, address_line1, address_line2, 
                city, state, zip_code, 
                weekday_hours, weekend_hours, location_id,
                specialties_services, parking_directions, documents,
                is_active, created_by, updated_by
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
                $11, $12, $13, $14, $15, $15
              )`,
              [
                orgId,
                location.name,
                location.address_line1,
                location.address_line2,
                location.city,
                location.state,
                location.zip_code,
                location.weekday_hours,
                location.weekend_hours,
                location.location_id,
                JSON.stringify(location.specialties_services || []),
                location.parking_directions,
                JSON.stringify(location.documents || []),
                true,
                req.user.userId,
              ],
            );
          }
        }

        // Update specialty services if provided
        if (speciality_services && Array.isArray(speciality_services)) {
          // Soft delete existing
          await db.query(
            `UPDATE org_speciality_services 
             SET is_active = false, updated_by = $2, updated_at = CURRENT_TIMESTAMP
             WHERE org_id = $1 AND is_active = true`,
            [orgId, req.user.userId],
          );

          // Insert new
          for (const specialty of speciality_services) {
            await db.query(
              `INSERT INTO org_speciality_services (
                org_id, specialty_name, location_ids,
                physician_names_source, physician_names_source_other,
                new_patients_source, new_patients_source_other,
                physician_locations_source, physician_locations_source_other,
                physician_credentials_source, physician_credentials_source_other,
                services, services_offered_source, services_offered_source_other,
                patient_prep_source, patient_prep_source_other,
                patient_faqs_source, patient_faqs_source_other,
                documents, is_active, created_by, updated_by
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
                $11, $12, $13, $14, $15, $16, $17, $18, $19, 
                $20, $21, $21
              )`,
              [
                orgId,
                specialty.specialty_name,
                specialty.location_ids || [],
                specialty.physician_names_source,
                specialty.physician_names_source_other,
                specialty.new_patients_source,
                specialty.new_patients_source_other,
                specialty.physician_locations_source,
                specialty.physician_locations_source_other,
                specialty.physician_credentials_source,
                specialty.physician_credentials_source_other,
                JSON.stringify(specialty.services || []),
                specialty.services_offered_source,
                specialty.services_offered_source_other,
                specialty.patient_prep_source,
                specialty.patient_prep_source_other,
                specialty.patient_faqs_source,
                specialty.patient_faqs_source_other,
                JSON.stringify(specialty.documents || []),
                true,
                req.user.userId,
              ],
            );
          }
        }

        // Update insurance if provided
        if (insurance) {
          const existingInsurance = await db.query(
            `SELECT id FROM org_insurance WHERE org_id = $1`,
            [orgId],
          );

          if (existingInsurance.rows.length === 0) {
            // Insert new
            await db.query(
              `INSERT INTO org_insurance (
                org_id, 
                accepted_payers_source, accepted_payers_source_details,
                insurance_verification_source, insurance_verification_source_details,
                patient_copay_source, patient_copay_source_details,
                documents, is_active, created_by, updated_by
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
              [
                orgId,
                insurance.accepted_payers_source,
                insurance.accepted_payers_source_details,
                insurance.insurance_verification_source,
                insurance.insurance_verification_source_details,
                insurance.patient_copay_source,
                insurance.patient_copay_source_details,
                JSON.stringify(insurance.documents || []),
                true,
                req.user.userId,
              ],
            );
          } else {
            // Update existing
            await db.query(
              `UPDATE org_insurance SET
                accepted_payers_source = $2,
                accepted_payers_source_details = $3,
                insurance_verification_source = $4,
                insurance_verification_source_details = $5,
                patient_copay_source = $6,
                patient_copay_source_details = $7,
                documents = $8,
                updated_by = $9,
                updated_at = CURRENT_TIMESTAMP
              WHERE org_id = $1`,
              [
                orgId,
                insurance.accepted_payers_source,
                insurance.accepted_payers_source_details,
                insurance.insurance_verification_source,
                insurance.insurance_verification_source_details,
                insurance.patient_copay_source,
                insurance.patient_copay_source_details,
                JSON.stringify(insurance.documents || []),
                req.user.userId,
              ],
            );
          }
        }

        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }

      // Fetch and return updated data
      const organizationData = await fetchOrganizationData(
        orgId,
        req.user.role,
      );

      res.json({
        success: true,
        data: organizationData,
      });
    } catch (error) {
      logger.error("Error updating all sections", {
        error: error.message,
        user_id: req.user.userId,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update organization data",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/account-details/upload-document:
 *   post:
 *     summary: Upload a document for account details
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/account-details/upload-document",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  upload.single("file"),
  async (req, res) => {
    try {
      const orgId = parseInt(req.params.org_id);
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          error: "No file uploaded",
        });
      }

      // Upload to S3
      const uploadResult = await s3DocumentService.uploadDocument(file.buffer, {
        filename: file.originalname,
        mimetype: file.mimetype,
        orgId: orgId,
        section: "account_details",
        uploadedBy: req.user.userId,
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Failed to upload document");
      }

      // Prepare document object
      const documentData = {
        name: file.originalname,
        url: uploadResult.document.url,
        uploaded_at: new Date().toISOString(),
        uploaded_by: req.user.userId,
      };

      // Update org_account_details
      const existingResult = await db.query(
        `SELECT documents FROM org_account_details WHERE org_id = $1`,
        [orgId],
      );

      if (existingResult.rows.length === 0) {
        await db.query(
          `INSERT INTO org_account_details (org_id, documents, created_by, updated_by) 
           VALUES ($1, $2, $3, $3)`,
          [orgId, JSON.stringify([documentData]), req.user.userId],
        );
      } else {
        const existingDocs = existingResult.rows[0].documents || [];
        const updatedDocs = [...existingDocs, documentData];

        await db.query(
          `UPDATE org_account_details 
           SET documents = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
           WHERE org_id = $3`,
          [JSON.stringify(updatedDocs), req.user.userId, orgId],
        );
      }

      res.json({
        success: true,
        message: "Document uploaded successfully",
        document: documentData,
      });
    } catch (error) {
      logger.error("Error uploading account details document", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: error.message || "Failed to upload document",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/account-details/delete-document:
 *   post:
 *     summary: Delete a document from account details
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/account-details/delete-document",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const orgId = parseInt(req.params.org_id);
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: "Document URL is required",
        });
      }

      const result = await db.query(
        `SELECT documents FROM org_account_details WHERE org_id = $1`,
        [orgId],
      );

      if (result.rows.length === 0 || !result.rows[0].documents) {
        return res.status(404).json({
          success: false,
          error: "No documents found",
        });
      }

      const documents = result.rows[0].documents;
      const updatedDocs = documents.filter((doc) => doc.url !== url);

      if (documents.length === updatedDocs.length) {
        return res.status(404).json({
          success: false,
          error: "Document not found",
        });
      }

      await db.query(
        `UPDATE org_account_details 
         SET documents = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
         WHERE org_id = $3`,
        [JSON.stringify(updatedDocs), req.user.userId, orgId],
      );

      res.json({
        success: true,
        message: "Document deleted successfully",
      });
    } catch (error) {
      logger.error("Error deleting account details document", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: error.message || "Failed to delete document",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/locations/upload-document:
 *   post:
 *     summary: Upload a document for all locations
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/locations/upload-document",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  upload.single("file"),
  async (req, res) => {
    try {
      const orgId = parseInt(req.params.org_id);
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          error: "No file uploaded",
        });
      }

      // Upload to S3
      const uploadResult = await s3DocumentService.uploadDocument(file.buffer, {
        filename: file.originalname,
        mimetype: file.mimetype,
        orgId: orgId,
        section: "locations",
        uploadedBy: req.user.userId,
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Failed to upload document");
      }

      // Prepare document object
      const documentData = {
        name: file.originalname,
        url: uploadResult.document.url,
        uploaded_at: new Date().toISOString(),
        uploaded_by: req.user.userId,
      };

      // Update all locations for this org_id
      const locationsResult = await db.query(
        `SELECT id, documents FROM org_locations WHERE org_id = $1 AND is_active = true`,
        [orgId],
      );

      if (locationsResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "No active locations found for this organization",
        });
      }

      // Update each location
      await db.query("BEGIN");
      try {
        for (const location of locationsResult.rows) {
          const existingDocs = location.documents || [];
          const updatedDocs = [...existingDocs, documentData];

          await db.query(
            `UPDATE org_locations 
             SET documents = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [JSON.stringify(updatedDocs), req.user.userId, location.id],
          );
        }
        await db.query("COMMIT");
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }

      res.json({
        success: true,
        message: `Document uploaded successfully to ${locationsResult.rows.length} location(s)`,
        document: documentData,
      });
    } catch (error) {
      logger.error("Error uploading locations document", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: error.message || "Failed to upload document",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/locations/delete-document:
 *   post:
 *     summary: Delete a document from all locations
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/locations/delete-document",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const orgId = parseInt(req.params.org_id);
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: "Document URL is required",
        });
      }

      const locationsResult = await db.query(
        `SELECT id, documents FROM org_locations WHERE org_id = $1 AND is_active = true`,
        [orgId],
      );

      if (locationsResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "No active locations found",
        });
      }

      await db.query("BEGIN");
      try {
        let documentFound = false;

        for (const location of locationsResult.rows) {
          if (location.documents && location.documents.length > 0) {
            const updatedDocs = location.documents.filter(
              (doc) => doc.url !== url,
            );

            if (updatedDocs.length < location.documents.length) {
              documentFound = true;
              await db.query(
                `UPDATE org_locations 
                 SET documents = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3`,
                [JSON.stringify(updatedDocs), req.user.userId, location.id],
              );
            }
          }
        }

        if (!documentFound) {
          await db.query("ROLLBACK");
          return res.status(404).json({
            success: false,
            error: "Document not found in any location",
          });
        }

        await db.query("COMMIT");
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }

      res.json({
        success: true,
        message: "Document deleted from all locations successfully",
      });
    } catch (error) {
      logger.error("Error deleting locations document", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: error.message || "Failed to delete document",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/specialties/upload-document:
 *   post:
 *     summary: Upload a document for all specialties
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/specialties/upload-document",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  upload.single("file"),
  async (req, res) => {
    try {
      const orgId = parseInt(req.params.org_id);
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          error: "No file uploaded",
        });
      }

      // Upload to S3
      const uploadResult = await s3DocumentService.uploadDocument(file.buffer, {
        filename: file.originalname,
        mimetype: file.mimetype,
        orgId: orgId,
        section: "specialties",
        uploadedBy: req.user.userId,
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Failed to upload document");
      }

      // Prepare document object
      const documentData = {
        name: file.originalname,
        url: uploadResult.document.url,
        uploaded_at: new Date().toISOString(),
        uploaded_by: req.user.userId,
      };

      // Update all specialties for this org_id
      const specialtiesResult = await db.query(
        `SELECT id, documents FROM org_speciality_services WHERE org_id = $1 AND is_active = true`,
        [orgId],
      );

      if (specialtiesResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "No active specialties found for this organization",
        });
      }

      // Update each specialty
      await db.query("BEGIN");
      try {
        for (const specialty of specialtiesResult.rows) {
          const existingDocs = specialty.documents || [];
          const updatedDocs = [...existingDocs, documentData];

          await db.query(
            `UPDATE org_speciality_services 
             SET documents = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [JSON.stringify(updatedDocs), req.user.userId, specialty.id],
          );
        }
        await db.query("COMMIT");
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }

      res.json({
        success: true,
        message: `Document uploaded successfully to ${specialtiesResult.rows.length} specialty(s)`,
        document: documentData,
      });
    } catch (error) {
      logger.error("Error uploading specialties document", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: error.message || "Failed to upload document",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/specialties/delete-document:
 *   post:
 *     summary: Delete a document from all specialties
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/specialties/delete-document",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const orgId = parseInt(req.params.org_id);
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: "Document URL is required",
        });
      }

      const specialtiesResult = await db.query(
        `SELECT id, documents FROM org_speciality_services WHERE org_id = $1 AND is_active = true`,
        [orgId],
      );

      if (specialtiesResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "No active specialties found",
        });
      }

      await db.query("BEGIN");
      try {
        let documentFound = false;

        for (const specialty of specialtiesResult.rows) {
          if (specialty.documents && specialty.documents.length > 0) {
            const updatedDocs = specialty.documents.filter(
              (doc) => doc.url !== url,
            );

            if (updatedDocs.length < specialty.documents.length) {
              documentFound = true;
              await db.query(
                `UPDATE org_speciality_services 
                 SET documents = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3`,
                [JSON.stringify(updatedDocs), req.user.userId, specialty.id],
              );
            }
          }
        }

        if (!documentFound) {
          await db.query("ROLLBACK");
          return res.status(404).json({
            success: false,
            error: "Document not found in any specialty",
          });
        }

        await db.query("COMMIT");
      } catch (err) {
        await db.query("ROLLBACK");
        throw err;
      }

      res.json({
        success: true,
        message: "Document deleted from all specialties successfully",
      });
    } catch (error) {
      logger.error("Error deleting specialties document", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: error.message || "Failed to delete document",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/insurance/upload-document:
 *   post:
 *     summary: Upload a document for insurance
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/insurance/upload-document",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  upload.single("file"),
  async (req, res) => {
    try {
      const orgId = parseInt(req.params.org_id);
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          error: "No file uploaded",
        });
      }

      // Upload to S3
      const uploadResult = await s3DocumentService.uploadDocument(file.buffer, {
        filename: file.originalname,
        mimetype: file.mimetype,
        orgId: orgId,
        section: "insurance",
        uploadedBy: req.user.userId,
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Failed to upload document");
      }

      // Prepare document object
      const documentData = {
        name: file.originalname,
        url: uploadResult.document.url,
        uploaded_at: new Date().toISOString(),
        uploaded_by: req.user.userId,
      };

      // Update org_insurance
      const existingResult = await db.query(
        `SELECT documents FROM org_insurance WHERE org_id = $1`,
        [orgId],
      );

      if (existingResult.rows.length === 0) {
        await db.query(
          `INSERT INTO org_insurance (org_id, documents, is_active, created_by, updated_by) 
           VALUES ($1, $2, true, $3, $3)`,
          [orgId, JSON.stringify([documentData]), req.user.userId],
        );
      } else {
        const existingDocs = existingResult.rows[0].documents || [];
        const updatedDocs = [...existingDocs, documentData];

        await db.query(
          `UPDATE org_insurance 
           SET documents = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
           WHERE org_id = $3`,
          [JSON.stringify(updatedDocs), req.user.userId, orgId],
        );
      }

      res.json({
        success: true,
        message: "Document uploaded successfully",
        document: documentData,
      });
    } catch (error) {
      logger.error("Error uploading insurance document", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: error.message || "Failed to upload document",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/insurance/delete-document:
 *   post:
 *     summary: Delete a document from insurance
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/insurance/delete-document",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const orgId = parseInt(req.params.org_id);
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: "Document URL is required",
        });
      }

      const result = await db.query(
        `SELECT documents FROM org_insurance WHERE org_id = $1`,
        [orgId],
      );

      if (result.rows.length === 0 || !result.rows[0].documents) {
        return res.status(404).json({
          success: false,
          error: "No documents found",
        });
      }

      const documents = result.rows[0].documents;
      const updatedDocs = documents.filter((doc) => doc.url !== url);

      if (documents.length === updatedDocs.length) {
        return res.status(404).json({
          success: false,
          error: "Document not found",
        });
      }

      await db.query(
        `UPDATE org_insurance 
         SET documents = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
         WHERE org_id = $3`,
        [JSON.stringify(updatedDocs), req.user.userId, orgId],
      );

      res.json({
        success: true,
        message: "Document deleted successfully",
      });
    } catch (error) {
      logger.error("Error deleting insurance document", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: error.message || "Failed to delete document",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/create-curated-kb:
 *   post:
 *     summary: Create a curated knowledge base document using AI
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/create-curated-kb",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const orgId = parseInt(req.params.org_id);

      logger.info("Creating curated KB document", {
        org_id: orgId,
        user_id: req.user.userId,
      });

      // Fetch complete organization data
      const organizationData = await fetchOrganizationData(
        orgId,
        req.user.role,
      );

      // Prepare data for OpenAI
      const dataForAI = {
        organization: organizationData.organization,
        account_details: organizationData.account_details,
        locations: organizationData.locations,
        speciality_services: organizationData.speciality_services,
        insurance: organizationData.insurance,
      };

      // Create OpenAI prompt
      const prompt = `You are a medical documentation expert. Create a comprehensive knowledge base document for a healthcare organization based on the following data.

      The document should include:
      1. General Information section with organization name, website, contact details, accepted insurance
      2. Locations table with address, phone, hours for each location
      3. Parking & Accessibility information
      4. Specialty Services sections with detailed information about each service including:
         - Description of the service
         - Preparation requirements for patients
         - Frequently asked questions
      5. Patient FAQs organized by categories:
         - General Questions
         - Insurance, Billing & Payment
         - Scheduling & Appointments
         - Preparation & Instructions
         - During the Exam
         - Safety Concerns
         - Results & Follow-up
         - Clinic Logistics
         - Special Populations
         - After the Exam

      Organization Data:
      ${JSON.stringify(dataForAI, null, 2)}

      Create a well-structured, professional document that patients can use as a comprehensive resource. Include all relevant information from the data provided. Format the response as structured JSON with sections and subsections.`;

      // Call OpenAI API with new syntax
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are a medical documentation expert creating patient-friendly knowledge base documents.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 8000,
      });

      const aiResponse = completion.choices[0].message.content;

      // Parse AI response (assuming it returns structured content)
      let structuredContent;
      try {
        structuredContent = JSON.parse(aiResponse);
      } catch (e) {
        // If not JSON, use the text directly
        structuredContent = { content: aiResponse };
      }

      // Create DOCX document
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: await createDocumentContent(
              organizationData,
              structuredContent,
            ),
          },
        ],
      });

      // Generate document buffer
      const buffer = await Packer.toBuffer(doc);

      // Create filename
      const timestamp = Date.now();
      const filename = `${organizationData.organization.name.replace(/[^a-zA-Z0-9]/g, "_")}_KB_${timestamp}.docx`;

      // Upload to S3
      const uploadResult = await s3DocumentService.uploadDocument(buffer, {
        filename: filename,
        mimetype:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        orgId: orgId,
        section: "organisation_kb",
        uploadedBy: req.user.userId,
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Failed to upload document");
      }

      // Prepare document object
      const documentData = {
        name: filename,
        url: uploadResult.document.url,
        type: "curated_kb",
        uploaded_at: new Date().toISOString(),
        uploaded_by: req.user.userId,
        s3_key: uploadResult.document.s3_key,
      };

      // Update organisations table
      const existingResult = await db.query(
        `SELECT documents FROM organisations WHERE org_id = $1`,
        [orgId],
      );

      let updatedDocs;
      if (existingResult.rows[0].documents) {
        updatedDocs = [...existingResult.rows[0].documents, documentData];
      } else {
        updatedDocs = [documentData];
      }

      await db.query(
        `UPDATE organisations 
         SET documents = $1, updated_at = CURRENT_TIMESTAMP
         WHERE org_id = $2`,
        [JSON.stringify(updatedDocs), orgId],
      );

      logger.info("Curated KB document created successfully", {
        org_id: orgId,
        document_url: documentData.url,
      });

      res.json({
        success: true,
        message: "Knowledge base document created successfully",
        document: {
          name: documentData.name,
          url: documentData.url,
          type: documentData.type,
        },
      });
    } catch (error) {
      logger.error("Error creating curated KB", {
        error: error.message,
        stack: error.stack,
        org_id: req.params.org_id,
        user_id: req.user.userId,
      });
      res.status(500).json({
        success: false,
        error: error.message || "Failed to create knowledge base document",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/delete-curated-kb:
 *   post:
 *     summary: Delete a curated knowledge base document
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/delete-curated-kb",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const orgId = parseInt(req.params.org_id);
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: "Document URL is required",
        });
      }

      logger.info("Deleting curated KB document", {
        org_id: orgId,
        url: url,
        user_id: req.user.userId,
      });

      // Get existing documents
      const result = await db.query(
        `SELECT documents FROM organisations WHERE org_id = $1`,
        [orgId],
      );

      if (!result.rows[0].documents || result.rows[0].documents.length === 0) {
        return res.status(404).json({
          success: false,
          error: "No documents found",
        });
      }

      // Find the document to delete
      const documents = result.rows[0].documents;
      const documentToDelete = documents.find((doc) => doc.url === url);

      if (!documentToDelete) {
        return res.status(404).json({
          success: false,
          error: "Document not found",
        });
      }

      // Delete from S3 if s3_key exists
      if (documentToDelete.s3_key) {
        try {
          await s3DocumentService.deleteDocument(documentToDelete.s3_key);
          logger.info("Document deleted from S3", {
            s3_key: documentToDelete.s3_key,
          });
        } catch (s3Error) {
          logger.error("Error deleting from S3, continuing with DB removal", {
            error: s3Error.message,
            s3_key: documentToDelete.s3_key,
          });
        }
      }

      // Remove from documents array
      const updatedDocs = documents.filter((doc) => doc.url !== url);

      // Update database
      await db.query(
        `UPDATE organisations 
         SET documents = $1, updated_at = CURRENT_TIMESTAMP
         WHERE org_id = $2`,
        [JSON.stringify(updatedDocs), orgId],
      );

      logger.info("Curated KB document deleted successfully", {
        org_id: orgId,
        document_name: documentToDelete.name,
      });

      res.json({
        success: true,
        message: "Knowledge base document deleted successfully",
      });
    } catch (error) {
      logger.error("Error deleting curated KB", {
        error: error.message,
        org_id: req.params.org_id,
        user_id: req.user.userId,
      });
      res.status(500).json({
        success: false,
        error: error.message || "Failed to delete knowledge base document",
      });
    }
  },
);

// Keep the helper function createDocumentContent as is (same as before)
async function createDocumentContent(orgData, aiContent) {
  const children = [];

  // Title
  children.push(
    new Paragraph({
      text: `${orgData.organization.name} - Knowledge Base`,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
  );

  // General Information Section
  children.push(
    new Paragraph({
      text: "General Information",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    }),
  );

  if (orgData.account_details) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Website: ", bold: true }),
          new TextRun(orgData.account_details.website_address || "N/A"),
        ],
        spacing: { after: 120 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Headquarters: ", bold: true }),
          new TextRun(orgData.account_details.headquarters_address || "N/A"),
        ],
        spacing: { after: 120 },
      }),
    );
  }

  // Locations Section
  if (orgData.locations && orgData.locations.length > 0) {
    children.push(
      new Paragraph({
        text: "Locations & Hours",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
    );

    // Create locations table
    const locationRows = [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ text: "Location", bold: true })],
            width: { size: 20, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: "Address", bold: true })],
            width: { size: 35, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: "Weekday Hours", bold: true })],
            width: { size: 22.5, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ text: "Weekend Hours", bold: true })],
            width: { size: 22.5, type: WidthType.PERCENTAGE },
          }),
        ],
      }),
    ];

    orgData.locations.forEach((location) => {
      locationRows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph(location.name || "")],
            }),
            new TableCell({
              children: [
                new Paragraph(
                  `${location.address_line1 || ""} ${location.address_line2 || ""}, ${location.city || ""}, ${location.state || ""} ${location.zip_code || ""}`,
                ),
              ],
            }),
            new TableCell({
              children: [new Paragraph(location.weekday_hours || "")],
            }),
            new TableCell({
              children: [new Paragraph(location.weekend_hours || "")],
            }),
          ],
        }),
      );
    });

    children.push(
      new Table({
        rows: locationRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      }),
    );
  }

  // Specialty Services Section
  if (orgData.speciality_services && orgData.speciality_services.length > 0) {
    children.push(
      new Paragraph({
        text: "Specialty Services",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
    );

    orgData.speciality_services.forEach((specialty) => {
      children.push(
        new Paragraph({
          text: specialty.specialty_name,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
        }),
      );

      if (specialty.services && Array.isArray(specialty.services)) {
        specialty.services.forEach((service) => {
          children.push(
            new Paragraph({
              text: service.name,
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 200, after: 100 },
            }),
          );

          if (service.patient_prep_requirements) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: "Preparation: ", bold: true }),
                  new TextRun(service.patient_prep_requirements),
                ],
                spacing: { after: 80 },
              }),
            );
          }

          if (service.faq) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: "FAQ: ", bold: true }),
                  new TextRun(service.faq),
                ],
                spacing: { after: 80 },
              }),
            );
          }
        });
      }
    });
  }

  // Insurance Information
  if (orgData.insurance) {
    children.push(
      new Paragraph({
        text: "Insurance Information",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Accepted Payers: ", bold: true }),
          new TextRun(
            orgData.insurance.accepted_payers_source_details ||
              "Contact for details",
          ),
        ],
        spacing: { after: 120 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Verification System: ", bold: true }),
          new TextRun(orgData.insurance.insurance_verification_source || "N/A"),
        ],
        spacing: { after: 120 },
      }),
    );
  }

  // Add AI-generated content if available
  if (aiContent && aiContent.content) {
    children.push(
      new Paragraph({
        text: "Additional Information",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        text: aiContent.content,
        spacing: { after: 120 },
      }),
    );
  }

  return children;
}

module.exports = router;
