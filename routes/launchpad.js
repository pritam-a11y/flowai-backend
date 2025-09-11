const express = require("express");
const router = express.Router();
const jwtMiddleware = require("../middleware/jwt");
const { validateOrgAccess } = require("../middleware/workspaceAccess");
const requireFeaturePermission = require("../middleware/featureAccess");
const logger = require("../utils/logger");
const db = require("../db/connection");

/**
 * @swagger
 * tags:
 *   name: Launchpad
 *   description: Practice launchpad configuration endpoints
 */

/**
 * Fetch current launchpad data from database
 */
const fetchLaunchpadData = async (workspaceId, userRole) => {
  const result = await db.query(
    `SELECT basic_info, locations, providers, hours 
     FROM workspaces 
     WHERE id = $1`,
    [workspaceId],
  );

  if (result.rows.length === 0) {
    throw new Error("Workspace not found");
  }

  const workspace = result.rows[0];

  // Extract hours data with proper defaults
  const hoursData = workspace.hours || {
    hours: [],
    emergency_instructions: "",
    after_hours_instructions: "",
  };

  // Build launchpad data with proper null checks and formatting
  return {
    basicInfo: workspace.basic_info || {
      primaryPracticeName: "",
      alternativeNames: [],
    },
    locations: workspace.locations?.locations || [],
    providers: {
      providers: workspace.providers?.providers || [],
      supported_language: workspace.providers?.supported_language || [],
    },
    hours: hoursData, // Return the entire hours object
    metadata: {
      lastUpdated: new Date().toISOString(),
      workspaceId: workspaceId,
      userRole: userRole,
      canEdit: requireFeaturePermission("launchpad", "write"),
    },
  };
};

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/fetch-data:
 *   post:
 *     summary: Fetch launchpad configuration data for an organization
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: org_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Organization/Workspace ID
 *     responses:
 *       200:
 *         description: Launchpad configuration data
 *       403:
 *         description: Access denied
 *       404:
 *         description: Workspace not found
 */
router.post(
  "/:org_id/fetch-data",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "read"),
  async (req, res) => {
    try {
      const workspaceId = req.workspaceId; // Set by validateOrgAccess

      logger.info("Fetching launchpad data", {
        workspaceId: workspaceId,
        userId: req.user.userId,
      });

      const launchpadData = await fetchLaunchpadData(
        workspaceId,
        req.user.role,
      );

      res.json({
        success: true,
        data: launchpadData,
      });
    } catch (error) {
      logger.error("Error fetching launchpad data", {
        error: error.message,
        userId: req.user.userId,
      });

      if (error.message === "Workspace not found") {
        return res.status(404).json({
          success: false,
          error: "Workspace not found",
        });
      }

      res.status(500).json({
        success: false,
        error: "Failed to fetch launchpad data",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/update-basic-info:
 *   post:
 *     summary: Update basic info section for an organization
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: org_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Organization/Workspace ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               data:
 *                 type: object
 *                 properties:
 *                   primaryPracticeName:
 *                     type: string
 *                   alternativeNames:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       200:
 *         description: Updated launchpad data
 *       403:
 *         description: Access denied
 */
router.post(
  "/:org_id/update-basic-info",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const { data } = req.body;
      const workspaceId = req.workspaceId; // Set by validateOrgAccess

      // Validate data structure
      const basicInfo = {
        primary_practice_name: data?.primaryPracticeName || "",
        alternative_names: Array.isArray(data?.alternativeNames)
          ? data.alternativeNames
          : [],
      };

      logger.info("Updating basic info", {
        workspaceId: workspaceId,
        userId: req.user.userId,
      });

      await db.query(
        `UPDATE workspaces 
         SET basic_info = $2, updated_at = NOW() 
         WHERE id = $1`,
        [workspaceId, JSON.stringify(basicInfo)],
      );

      // Fetch and return updated data
      const launchpadData = await fetchLaunchpadData(
        workspaceId,
        req.user.role,
      );

      res.json({
        success: true,
        data: launchpadData,
      });
    } catch (error) {
      logger.error("Error updating basic info", {
        error: error.message,
        userId: req.user.userId,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update basic info",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/update-locations:
 *   post:
 *     summary: Update locations section for an organization
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: org_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Organization/Workspace ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               data:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     location_name:
 *                       type: string
 *                     street_address:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     city:
 *                       type: string
 *                     state:
 *                       type: string
 *                     zip:
 *                       type: string
 *                     parking_directions:
 *                       type: string
 *                     inpatient:
 *                       type: boolean
 *                     services_provided:
 *                       type: array
 *                       items:
 *                         type: string
 *     responses:
 *       200:
 *         description: Updated launchpad data
 *       403:
 *         description: Access denied
 */
router.post(
  "/:org_id/update-locations",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const { data } = req.body;
      const workspaceId = req.workspaceId;

      // Validate and format locations data with new fields
      const locations = {
        locations: Array.isArray(data)
          ? data.map((loc) => ({
              location_name: loc.location_name || "",
              street_address: loc.street_address || "",
              phone: loc.phone || "",
              city: loc.city || "",
              state: loc.state || "",
              zip: loc.zip || "",
              // New fields
              parking_directions: loc.parking_directions || "",
              inpatient:
                typeof loc.inpatient === "boolean" ? loc.inpatient : false,
              services_provided: Array.isArray(loc.services_provided)
                ? loc.services_provided
                : [],
            }))
          : [],
      };

      logger.info("Updating locations", {
        workspaceId: workspaceId,
        userId: req.user.userId,
        locationCount: locations.locations.length,
      });

      await db.query(
        `UPDATE workspaces 
         SET locations = $2, updated_at = NOW() 
         WHERE id = $1`,
        [workspaceId, JSON.stringify(locations)],
      );

      // Fetch and return updated data
      const launchpadData = await fetchLaunchpadData(
        workspaceId,
        req.user.role,
      );

      res.json({
        success: true,
        data: launchpadData,
      });
    } catch (error) {
      logger.error("Error updating locations", {
        error: error.message,
        userId: req.user.userId,
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
 * /api/v1/launchpad/{org_id}/update-providers:
 *   post:
 *     summary: Update providers section for an organization
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: org_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Organization/Workspace ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               data:
 *                 type: object
 *                 properties:
 *                   providers:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         first_name:
 *                           type: string
 *                         last_name:
 *                           type: string
 *                         specialty:
 *                           type: string
 *                         npi_number:
 *                           type: string
 *                         clinic_locations:
 *                           type: array
 *                           items:
 *                             type: string
 *                   supported_language:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       200:
 *         description: Updated launchpad data
 *       403:
 *         description: Access denied
 */
router.post(
  "/:org_id/update-providers",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const { data } = req.body;
      const workspaceId = req.workspaceId; // Set by validateOrgAccess

      // Validate and format providers data
      const providers = {
        providers: Array.isArray(data?.providers)
          ? data.providers.map((provider) => ({
              first_name: provider.first_name || "",
              last_name: provider.last_name || "",
              specialty: provider.specialty || "",
              npi_number: provider.npi_number || "",
              clinic_locations: Array.isArray(provider.clinic_locations)
                ? provider.clinic_locations
                : [],
            }))
          : [],
        supported_language: Array.isArray(data?.supported_language)
          ? data.supported_language
          : [],
      };

      logger.info("Updating providers", {
        workspaceId: workspaceId,
        userId: req.user.userId,
        providerCount: providers.providers.length,
        languageCount: providers.supported_language.length,
      });

      await db.query(
        `UPDATE workspaces 
         SET providers = $2, updated_at = NOW() 
         WHERE id = $1`,
        [workspaceId, JSON.stringify(providers)],
      );

      // Fetch and return updated data
      const launchpadData = await fetchLaunchpadData(
        workspaceId,
        req.user.role,
      );

      res.json({
        success: true,
        data: launchpadData,
      });
    } catch (error) {
      logger.error("Error updating providers", {
        error: error.message,
        userId: req.user.userId,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update providers",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/update-hours:
 *   post:
 *     summary: Update hours section for an organization
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: org_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Organization/Workspace ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               data:
 *                 type: object
 *                 properties:
 *                   hours:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         location_name:
 *                           type: string
 *                         is_scheduling_same_as_clinical:
 *                           type: boolean
 *                         holidays:
 *                           type: string
 *                         clinic_hours:
 *                           type: object
 *                         scheduling_hours:
 *                           type: object
 *                   emergency_instructions:
 *                     type: string
 *                   after_hours_instructions:
 *                     type: string
 *     responses:
 *       200:
 *         description: Updated launchpad data
 *       403:
 *         description: Access denied
 */
router.post(
  "/:org_id/update-hours",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const { data } = req.body;
      const workspaceId = req.workspaceId; // Set by validateOrgAccess

      // Validate and format hours data
      const hours = {
        hours: Array.isArray(data?.hours)
          ? data.hours.map((location) => ({
              location_name: location.location_name || "",
              is_scheduling_same_as_clinical:
                typeof location.is_scheduling_same_as_clinical === "boolean"
                  ? location.is_scheduling_same_as_clinical
                  : true,
              holidays: location.holidays || "",
              clinic_hours: location.clinic_hours || {},
              scheduling_hours: location.scheduling_hours || {},
            }))
          : [],
        emergency_instructions: data?.emergency_instructions || "",
        after_hours_instructions: data?.after_hours_instructions || "",
      };

      logger.info("Updating hours", {
        workspaceId: workspaceId,
        userId: req.user.userId,
        locationCount: hours.hours.length,
      });

      await db.query(
        `UPDATE workspaces 
         SET hours = $2, updated_at = NOW() 
         WHERE id = $1`,
        [workspaceId, JSON.stringify(hours)],
      );

      // Fetch and return updated data
      const launchpadData = await fetchLaunchpadData(
        workspaceId,
        req.user.role,
      );

      res.json({
        success: true,
        data: launchpadData,
      });
    } catch (error) {
      logger.error("Error updating hours", {
        error: error.message,
        userId: req.user.userId,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update hours",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/launchpad/{org_id}/save-all:
 *   post:
 *     summary: Save all launchpad sections at once for an organization
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: org_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Organization/Workspace ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               data:
 *                 type: object
 *                 properties:
 *                   basicInfo:
 *                     type: object
 *                   locations:
 *                     type: array
 *                   providers:
 *                     type: object
 *                   hours:
 *                     type: object
 *                     properties:
 *                       hours:
 *                         type: array
 *                       emergency_instructions:
 *                         type: string
 *                       after_hours_instructions:
 *                         type: string
 *     responses:
 *       200:
 *         description: Updated launchpad data
 *       403:
 *         description: Access denied
 */
router.post(
  "/:org_id/save-all",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("launchpad", "write"),
  async (req, res) => {
    try {
      const { data } = req.body;
      const workspaceId = req.workspaceId; // Set by validateOrgAccess

      logger.info("Updating all launchpad sections", {
        workspaceId: workspaceId,
        userId: req.user.userId,
      });

      // Format all sections
      const basicInfo = data?.basicInfo
        ? {
            primary_practice_name: data.basicInfo.primaryPracticeName || "",
            alternative_names: Array.isArray(data.basicInfo.alternativeNames)
              ? data.basicInfo.alternativeNames
              : [],
          }
        : null;

      const locations = data?.locations
        ? {
            locations: Array.isArray(data.locations)
              ? data.locations.map((loc) => ({
                  location_name: loc.location_name || "",
                  street_address: loc.street_address || "",
                  phone: loc.phone || "",
                  city: loc.city || "",
                  state: loc.state || "",
                  zip: loc.zip || "",
                  parking_directions: loc.parking_directions || "",
                  inpatient:
                    typeof loc.inpatient === "boolean" ? loc.inpatient : false,
                  services_provided: Array.isArray(loc.services_provided)
                    ? loc.services_provided
                    : [],
                }))
              : [],
          }
        : null;

      const providers = data?.providers
        ? {
            providers: Array.isArray(data.providers.providers)
              ? data.providers.providers.map((provider) => ({
                  first_name: provider.first_name || "",
                  last_name: provider.last_name || "",
                  specialty: provider.specialty || "",
                  npi_number: provider.npi_number || "",
                  clinic_locations: Array.isArray(provider.clinic_locations)
                    ? provider.clinic_locations
                    : [],
                }))
              : [],
            supported_language: Array.isArray(data.providers.supported_language)
              ? data.providers.supported_language
              : [],
          }
        : null;

      // Hours is now an object with hours array and instructions
      const hours = data?.hours
        ? {
            hours: Array.isArray(data.hours.hours)
              ? data.hours.hours.map((location) => ({
                  location_name: location.location_name || "",
                  is_scheduling_same_as_clinical:
                    typeof location.is_scheduling_same_as_clinical === "boolean"
                      ? location.is_scheduling_same_as_clinical
                      : true,
                  holidays: location.holidays || "",
                  clinic_hours: location.clinic_hours || {},
                  scheduling_hours: location.scheduling_hours || {},
                }))
              : [],
            emergency_instructions: data.hours.emergency_instructions || "",
            after_hours_instructions: data.hours.after_hours_instructions || "",
          }
        : null;

      // Build update query dynamically based on provided sections
      const updates = [];
      const values = [workspaceId];
      let paramCount = 1;

      if (basicInfo) {
        paramCount++;
        updates.push(`basic_info = $${paramCount}`);
        values.push(JSON.stringify(basicInfo));
      }

      if (locations) {
        paramCount++;
        updates.push(`locations = $${paramCount}`);
        values.push(JSON.stringify(locations));
      }

      if (providers) {
        paramCount++;
        updates.push(`providers = $${paramCount}`);
        values.push(JSON.stringify(providers));
      }

      if (hours) {
        paramCount++;
        updates.push(`hours = $${paramCount}`);
        values.push(JSON.stringify(hours));
      }

      if (updates.length > 0) {
        updates.push("updated_at = NOW()");
        const updateQuery = `UPDATE workspaces SET ${updates.join(", ")} WHERE id = $1`;

        await db.query(updateQuery, values);
      }

      // Fetch and return updated data
      const launchpadData = await fetchLaunchpadData(
        workspaceId,
        req.user.role,
      );

      res.json({
        success: true,
        data: launchpadData,
      });
    } catch (error) {
      logger.error("Error updating all sections", {
        error: error.message,
        userId: req.user.userId,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update launchpad data",
      });
    }
  },
);

module.exports = router;
