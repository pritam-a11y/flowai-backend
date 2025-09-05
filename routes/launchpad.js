const express = require("express");
const router = express.Router();
const jwtMiddleware = require("../middleware/jwt");
const logger = require("../utils/logger");
const db = require("../db/connection");

/**
 * @swagger
 * tags:
 *   name: Launchpad
 *   description: Practice launchpad configuration endpoints
 */

// Role permissions for launchpad
const LAUNCHPAD_PERMISSIONS = {
  "super-admin": { read: true, write: true },
  observer: { read: true, write: false },
  member: { read: true, write: true },
  "customer-admin": { read: true, write: true },
  "core-team-member": { read: true, write: false },
  "analytics-user": { read: false, write: false },
};

/**
 * Check if user has permission to access launchpad
 */
const checkLaunchpadAccess = (role, action) => {
  const permissions = LAUNCHPAD_PERMISSIONS[role];
  if (!permissions) return false;

  if (action === "read") return permissions.read;
  if (action === "write") return permissions.write;
  return false;
};

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
    hours: workspace.hours || {
      is_scheduling_same_as_clinical: true,
      holidays: "",
      emergency_instructions: "",
      after_hours_instructions: "",
      clinic_hours: {},
      scheduling_hours: {},
    },
    metadata: {
      lastUpdated: new Date().toISOString(),
      workspaceId: workspaceId,
      userRole: userRole,
      canEdit: checkLaunchpadAccess(userRole, "write"),
    },
  };
};

/**
 * @swagger
 * /api/v1/launchpad/fetch-data:
 *   post:
 *     summary: Fetch launchpad configuration data
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workspaceId:
 *                 type: integer
 *                 description: Optional workspace ID (uses user's default if not provided)
 *     responses:
 *       200:
 *         description: Launchpad configuration data
 *       403:
 *         description: Access denied
 *       404:
 *         description: Workspace not found
 */
router.post("/fetch-data", jwtMiddleware, async (req, res) => {
  try {
    const { workspaceId } = req.body;
    const userWorkspaceId = workspaceId || req.user.workspaceId;

    // Check if user has read access
    if (!checkLaunchpadAccess(req.user.role, "read")) {
      return res.status(403).json({
        success: false,
        error:
          "Access denied: You don't have permission to view launchpad data",
      });
    }

    // Validate workspace access
    if (workspaceId && workspaceId !== req.user.workspaceId) {
      return res.status(403).json({
        success: false,
        error: "Access denied: You don't have access to this workspace",
      });
    }

    logger.info("Fetching launchpad data", {
      workspaceId: userWorkspaceId,
      userId: req.user.userId,
    });

    const launchpadData = await fetchLaunchpadData(
      userWorkspaceId,
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
});

/**
 * @swagger
 * /api/v1/launchpad/update-basic-info:
 *   post:
 *     summary: Update basic info section
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               workspaceId:
 *                 type: integer
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
router.post("/update-basic-info", jwtMiddleware, async (req, res) => {
  try {
    const { workspaceId, data } = req.body;
    const userWorkspaceId = workspaceId || req.user.workspaceId;

    // Check if user has write access
    if (!checkLaunchpadAccess(req.user.role, "write")) {
      return res.status(403).json({
        success: false,
        error:
          "Access denied: You don't have permission to update launchpad data",
      });
    }

    // Validate workspace access
    if (workspaceId && workspaceId !== req.user.workspaceId) {
      return res.status(403).json({
        success: false,
        error: "Access denied: You don't have access to this workspace",
      });
    }

    // Validate data structure
    const basicInfo = {
      primary_practice_name: data?.primaryPracticeName || "",
      alternative_names: Array.isArray(data?.alternativeNames)
        ? data.alternativeNames
        : [],
    };

    logger.info("Updating basic info", {
      workspaceId: userWorkspaceId,
      userId: req.user.userId,
    });

    await db.query(
      `UPDATE workspaces 
       SET basic_info = $2, updated_at = NOW() 
       WHERE id = $1`,
      [userWorkspaceId, JSON.stringify(basicInfo)],
    );

    // Fetch and return updated data
    const launchpadData = await fetchLaunchpadData(
      userWorkspaceId,
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
});

/**
 * @swagger
 * /api/v1/launchpad/update-locations:
 *   post:
 *     summary: Update locations section
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               workspaceId:
 *                 type: integer
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
 *     responses:
 *       200:
 *         description: Updated launchpad data
 *       403:
 *         description: Access denied
 */
router.post("/update-locations", jwtMiddleware, async (req, res) => {
  try {
    const { workspaceId, data } = req.body;
    const userWorkspaceId = workspaceId || req.user.workspaceId;

    // Check if user has write access
    if (!checkLaunchpadAccess(req.user.role, "write")) {
      return res.status(403).json({
        success: false,
        error:
          "Access denied: You don't have permission to update launchpad data",
      });
    }

    // Validate workspace access
    if (workspaceId && workspaceId !== req.user.workspaceId) {
      return res.status(403).json({
        success: false,
        error: "Access denied: You don't have access to this workspace",
      });
    }

    // Validate and format locations data
    const locations = {
      locations: Array.isArray(data)
        ? data.map((loc) => ({
            location_name: loc.location_name || "",
            street_address: loc.street_address || "",
            phone: loc.phone || "",
            city: loc.city || "",
            state: loc.state || "",
            zip: loc.zip || "",
          }))
        : [],
    };

    logger.info("Updating locations", {
      workspaceId: userWorkspaceId,
      userId: req.user.userId,
      locationCount: locations.locations.length,
    });

    await db.query(
      `UPDATE workspaces 
       SET locations = $2, updated_at = NOW() 
       WHERE id = $1`,
      [userWorkspaceId, JSON.stringify(locations)],
    );

    // Fetch and return updated data
    const launchpadData = await fetchLaunchpadData(
      userWorkspaceId,
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
});

/**
 * @swagger
 * /api/v1/launchpad/update-providers:
 *   post:
 *     summary: Update providers section
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               workspaceId:
 *                 type: integer
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
router.post("/update-providers", jwtMiddleware, async (req, res) => {
  try {
    const { workspaceId, data } = req.body;
    const userWorkspaceId = workspaceId || req.user.workspaceId;

    // Check if user has write access
    if (!checkLaunchpadAccess(req.user.role, "write")) {
      return res.status(403).json({
        success: false,
        error:
          "Access denied: You don't have permission to update launchpad data",
      });
    }

    // Validate workspace access
    if (workspaceId && workspaceId !== req.user.workspaceId) {
      return res.status(403).json({
        success: false,
        error: "Access denied: You don't have access to this workspace",
      });
    }

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
      workspaceId: userWorkspaceId,
      userId: req.user.userId,
      providerCount: providers.providers.length,
      languageCount: providers.supported_language.length,
    });

    await db.query(
      `UPDATE workspaces 
       SET providers = $2, updated_at = NOW() 
       WHERE id = $1`,
      [userWorkspaceId, JSON.stringify(providers)],
    );

    // Fetch and return updated data
    const launchpadData = await fetchLaunchpadData(
      userWorkspaceId,
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
});

/**
 * @swagger
 * /api/v1/launchpad/update-hours:
 *   post:
 *     summary: Update hours section
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               workspaceId:
 *                 type: integer
 *               data:
 *                 type: object
 *                 properties:
 *                   is_scheduling_same_as_clinical:
 *                     type: boolean
 *                   holidays:
 *                     type: string
 *                   emergency_instructions:
 *                     type: string
 *                   after_hours_instructions:
 *                     type: string
 *                   clinic_hours:
 *                     type: object
 *                   scheduling_hours:
 *                     type: object
 *     responses:
 *       200:
 *         description: Updated launchpad data
 *       403:
 *         description: Access denied
 */
router.post("/update-hours", jwtMiddleware, async (req, res) => {
  try {
    const { workspaceId, data } = req.body;
    const userWorkspaceId = workspaceId || req.user.workspaceId;

    // Check if user has write access
    if (!checkLaunchpadAccess(req.user.role, "write")) {
      return res.status(403).json({
        success: false,
        error:
          "Access denied: You don't have permission to update launchpad data",
      });
    }

    // Validate workspace access
    if (workspaceId && workspaceId !== req.user.workspaceId) {
      return res.status(403).json({
        success: false,
        error: "Access denied: You don't have access to this workspace",
      });
    }

    // Validate and format hours data
    const hours = {
      is_scheduling_same_as_clinical:
        typeof data?.is_scheduling_same_as_clinical === "boolean"
          ? data.is_scheduling_same_as_clinical
          : true,
      holidays: data?.holidays || "",
      emergency_instructions: data?.emergency_instructions || "",
      after_hours_instructions: data?.after_hours_instructions || "",
      clinic_hours: data?.clinic_hours || {},
      scheduling_hours: data?.scheduling_hours || {},
    };

    logger.info("Updating hours", {
      workspaceId: userWorkspaceId,
      userId: req.user.userId,
    });

    await db.query(
      `UPDATE workspaces 
       SET hours = $2, updated_at = NOW() 
       WHERE id = $1`,
      [userWorkspaceId, JSON.stringify(hours)],
    );

    // Fetch and return updated data
    const launchpadData = await fetchLaunchpadData(
      userWorkspaceId,
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
});

/**
 * @swagger
 * /api/v1/launchpad/save-all:
 *   post:
 *     summary: Save all launchpad sections at once
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *             properties:
 *               workspaceId:
 *                 type: integer
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
 *     responses:
 *       200:
 *         description: Updated launchpad data
 *       403:
 *         description: Access denied
 */
router.post("/save-all", jwtMiddleware, async (req, res) => {
  try {
    const { workspaceId, data } = req.body;
    const userWorkspaceId = workspaceId || req.user.workspaceId;

    // Check if user has write access
    if (!checkLaunchpadAccess(req.user.role, "write")) {
      return res.status(403).json({
        success: false,
        error:
          "Access denied: You don't have permission to update launchpad data",
      });
    }

    // Validate workspace access
    if (workspaceId && workspaceId !== req.user.workspaceId) {
      return res.status(403).json({
        success: false,
        error: "Access denied: You don't have access to this workspace",
      });
    }

    logger.info("Updating all launchpad sections", {
      workspaceId: userWorkspaceId,
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

    const hours = data?.hours
      ? {
          is_scheduling_same_as_clinical:
            typeof data.hours.is_scheduling_same_as_clinical === "boolean"
              ? data.hours.is_scheduling_same_as_clinical
              : true,
          holidays: data.hours.holidays || "",
          emergency_instructions: data.hours.emergency_instructions || "",
          after_hours_instructions: data.hours.after_hours_instructions || "",
          clinic_hours: data.hours.clinic_hours || {},
          scheduling_hours: data.hours.scheduling_hours || {},
        }
      : null;

    // Build update query dynamically based on provided sections
    const updates = [];
    const values = [userWorkspaceId];
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
      userWorkspaceId,
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
});

module.exports = router;
