const express = require("express");
const router = express.Router();
const multer = require("multer");
const jwtMiddleware = require("../middleware/jwt");
const { validateOrgAccess } = require("../middleware/orgAccess");
const requireFeaturePermission = require("../middleware/featureAccess");
const logger = require("../utils/logger");
const db = require("../db/connection");
const s3DocumentService = require("../services/s3DocumentService");

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
      `SELECT org_id, org_name, created_at, updated_at
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

    // Fetch specialty services
    const specialtyResult = await db.query(
      `SELECT id, org_id, specialty_name, location_ids, 
              physician_names_source, physician_names_source_other,
              new_patients_source, new_patients_source_other,
              physician_locations_source, physician_locations_source_other,
              physician_credentials_source, physician_credentials_source_other,
              services, services_offered_source, services_offered_source_other,
              patient_prep_source, patient_prep_source_other,
              patient_faqs_source, patient_faqs_source_other,
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

// ============= DOCUMENT UPLOAD ENDPOINTS =============

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/upload-document:
 *   post:
 *     summary: Upload a document for any launchpad section
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
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - section
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Document file to upload
 *               section:
 *                 type: string
 *                 enum: [account_details, locations, speciality_services, insurance]
 *                 description: Section where document belongs
 *               location_id:
 *                 type: integer
 *                 description: Location ID (required for locations section)
 *               specialty_id:
 *                 type: integer
 *                 description: Specialty ID (required for speciality_services section)
 *               document_name:
 *                 type: string
 *                 description: Optional custom name for the document
 *               description:
 *                 type: string
 *                 description: Optional description of the document
 *     responses:
 *       200:
 *         description: Document uploaded successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.post(
  "/:org_id/upload-document",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  upload.single("file"),
  async (req, res) => {
    try {
      const orgId = parseInt(req.params.org_id);
      const { section, location_id, specialty_id, document_name, description } =
        req.body;
      const file = req.file;

      // Validate required fields
      if (!file) {
        return res.status(400).json({
          success: false,
          error: "No file uploaded",
        });
      }

      if (!section) {
        return res.status(400).json({
          success: false,
          error: "Section is required",
        });
      }

      // Validate section
      const validSections = [
        "account_details",
        "locations",
        "speciality_services",
        "insurance",
      ];
      if (!validSections.includes(section)) {
        return res.status(400).json({
          success: false,
          error: `Invalid section. Must be one of: ${validSections.join(", ")}`,
        });
      }

      logger.info("Processing document upload", {
        org_id: orgId,
        section: section,
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        user_id: req.user.userId,
      });

      // Upload to S3
      const uploadResult = await s3DocumentService.uploadDocument(file.buffer, {
        filename: document_name || file.originalname,
        mimetype: file.mimetype,
        orgId: orgId,
        section: section,
        uploadedBy: req.user.userId,
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Failed to upload document");
      }

      // Prepare document object for database
      const documentData = {
        ...uploadResult.document,
        custom_name: document_name || null,
        description: description || null,
      };

      // Update the appropriate table based on section
      await db.query("BEGIN");

      try {
        let updateSuccess = false;

        if (section === "locations" && location_id) {
          // Update specific location
          const locResult = await db.query(
            `SELECT documents FROM org_locations WHERE org_id = $1 AND id = $2 AND is_active = true`,
            [orgId, parseInt(location_id)],
          );

          if (locResult.rows.length > 0) {
            const existingDocs = locResult.rows[0].documents || [];
            const updatedDocs = [...existingDocs, documentData];

            await db.query(
              `UPDATE org_locations 
               SET documents = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
               WHERE org_id = $3 AND id = $4`,
              [
                JSON.stringify(updatedDocs),
                req.user.userId,
                orgId,
                parseInt(location_id),
              ],
            );
            updateSuccess = true;
          }
        } else if (section === "speciality_services" && specialty_id) {
          // Update specific specialty
          const specResult = await db.query(
            `SELECT documents FROM org_speciality_services WHERE org_id = $1 AND id = $2 AND is_active = true`,
            [orgId, parseInt(specialty_id)],
          );

          if (specResult.rows.length > 0) {
            const existingDocs = specResult.rows[0].documents || [];
            const updatedDocs = [...existingDocs, documentData];

            await db.query(
              `UPDATE org_speciality_services 
               SET documents = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
               WHERE org_id = $3 AND id = $4`,
              [
                JSON.stringify(updatedDocs),
                req.user.userId,
                orgId,
                parseInt(specialty_id),
              ],
            );
            updateSuccess = true;
          }
        } else if (section === "account_details" || section === "insurance") {
          // Update account_details or insurance table
          const tableName =
            section === "account_details"
              ? "org_account_details"
              : "org_insurance";

          const checkResult = await db.query(
            `SELECT documents FROM ${tableName} WHERE org_id = $1`,
            [orgId],
          );

          if (checkResult.rows.length === 0) {
            // Create new record
            if (section === "account_details") {
              await db.query(
                `INSERT INTO org_account_details (org_id, documents, created_by, updated_by) 
                 VALUES ($1, $2, $3, $3)`,
                [orgId, JSON.stringify([documentData]), req.user.userId],
              );
            } else {
              await db.query(
                `INSERT INTO org_insurance (org_id, documents, is_active, created_by, updated_by) 
                 VALUES ($1, $2, true, $3, $3)`,
                [orgId, JSON.stringify([documentData]), req.user.userId],
              );
            }
            updateSuccess = true;
          } else {
            const existingDocs = checkResult.rows[0].documents || [];
            const updatedDocs = [...existingDocs, documentData];

            await db.query(
              `UPDATE ${tableName} 
               SET documents = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
               WHERE org_id = $3`,
              [JSON.stringify(updatedDocs), req.user.userId, orgId],
            );
            updateSuccess = true;
          }
        }

        if (!updateSuccess) {
          throw new Error(
            `Cannot update documents for ${section}. Missing required IDs or record not found.`,
          );
        }

        await db.query("COMMIT");

        logger.info("Document uploaded and linked successfully", {
          org_id: orgId,
          section: section,
          document_id: documentData.id,
        });

        res.json({
          success: true,
          message: "Document uploaded successfully",
          document: documentData,
        });
      } catch (dbError) {
        await db.query("ROLLBACK");
        // Try to clean up S3 upload if DB update failed
        try {
          await s3DocumentService.deleteDocument(uploadResult.document.s3_key);
        } catch (cleanupError) {
          logger.error("Failed to cleanup S3 after DB error", {
            error: cleanupError.message,
          });
        }
        throw dbError;
      }
    } catch (error) {
      logger.error("Error uploading document", {
        error: error.message,
        stack: error.stack,
        org_id: req.params.org_id,
        user_id: req.user.userId,
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
 * /api/v1/launchpad/{org_id}/delete-document:
 *   post:
 *     summary: Delete a document from any launchpad section
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/:org_id/delete-document",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const orgId = parseInt(req.params.org_id);
      const { section, document_id, location_id, specialty_id } = req.body;

      if (!section || !document_id) {
        return res.status(400).json({
          success: false,
          error: "Section and document_id are required",
        });
      }

      logger.info("Processing document deletion", {
        org_id: orgId,
        section: section,
        document_id: document_id,
        user_id: req.user.userId,
      });

      await db.query("BEGIN");

      try {
        let documentToDelete = null;
        let updateSuccess = false;

        if (section === "locations" && location_id) {
          const locResult = await db.query(
            `SELECT documents FROM org_locations WHERE org_id = $1 AND id = $2`,
            [orgId, parseInt(location_id)],
          );

          if (locResult.rows.length > 0) {
            const documents = locResult.rows[0].documents || [];
            documentToDelete = documents.find((doc) => doc.id === document_id);

            if (documentToDelete) {
              const updatedDocs = documents.filter(
                (doc) => doc.id !== document_id,
              );
              await db.query(
                `UPDATE org_locations 
                 SET documents = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE org_id = $3 AND id = $4`,
                [
                  JSON.stringify(updatedDocs),
                  req.user.userId,
                  orgId,
                  parseInt(location_id),
                ],
              );
              updateSuccess = true;
            }
          }
        } else if (section === "speciality_services" && specialty_id) {
          const specResult = await db.query(
            `SELECT documents FROM org_speciality_services WHERE org_id = $1 AND id = $2`,
            [orgId, parseInt(specialty_id)],
          );

          if (specResult.rows.length > 0) {
            const documents = specResult.rows[0].documents || [];
            documentToDelete = documents.find((doc) => doc.id === document_id);

            if (documentToDelete) {
              const updatedDocs = documents.filter(
                (doc) => doc.id !== document_id,
              );
              await db.query(
                `UPDATE org_speciality_services 
                 SET documents = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE org_id = $3 AND id = $4`,
                [
                  JSON.stringify(updatedDocs),
                  req.user.userId,
                  orgId,
                  parseInt(specialty_id),
                ],
              );
              updateSuccess = true;
            }
          }
        } else if (section === "account_details" || section === "insurance") {
          const tableName =
            section === "account_details"
              ? "org_account_details"
              : "org_insurance";

          const result = await db.query(
            `SELECT documents FROM ${tableName} WHERE org_id = $1`,
            [orgId],
          );

          if (result.rows.length > 0) {
            const documents = result.rows[0].documents || [];
            documentToDelete = documents.find((doc) => doc.id === document_id);

            if (documentToDelete) {
              const updatedDocs = documents.filter(
                (doc) => doc.id !== document_id,
              );
              await db.query(
                `UPDATE ${tableName} 
                 SET documents = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE org_id = $3`,
                [JSON.stringify(updatedDocs), req.user.userId, orgId],
              );
              updateSuccess = true;
            }
          }
        }

        if (!documentToDelete) {
          throw new Error("Document not found");
        }

        // Delete from S3
        try {
          await s3DocumentService.deleteDocument(documentToDelete.s3_key);
        } catch (s3Error) {
          logger.error("Error deleting from S3, continuing with DB removal", {
            error: s3Error.message,
            s3_key: documentToDelete.s3_key,
          });
        }

        await db.query("COMMIT");

        logger.info("Document deleted successfully", {
          org_id: orgId,
          section: section,
          document_id: document_id,
        });

        res.json({
          success: true,
          message: "Document deleted successfully",
        });
      } catch (dbError) {
        await db.query("ROLLBACK");
        throw dbError;
      }
    } catch (error) {
      logger.error("Error deleting document", {
        error: error.message,
        org_id: req.params.org_id,
        user_id: req.user.userId,
      });

      res.status(500).json({
        success: false,
        error: error.message || "Failed to delete document",
      });
    }
  },
);

module.exports = router;
