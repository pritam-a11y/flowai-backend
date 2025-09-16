const express = require("express");
const router = express.Router();
const db = require("../db/connection");
const logger = require("../utils/logger");
const jwtMiddleware = require("../middleware/jwt").withOptions;
const createOrgAccessMiddleware = require("../middleware/orgAccess");
const requireFeaturePermission = require("../middleware/featureAccess");

// Apply JWT middleware to all routes
router.use(jwtMiddleware());

/**
 * @swagger
 * tags:
 *   name: SchedulingAgent
 *   description: Scheduling Agent management endpoints
 */

/**
 * @swagger
 * /api/v1/scheduling-agent/{org_id}:
 *   get:
 *     summary: Get complete scheduling agent configuration
 *     tags: [SchedulingAgent]
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
 *         description: Complete scheduling agent configuration
 *       404:
 *         description: Scheduling agent not found
 */
router.get(
  "/:org_id",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "read"),
  async (req, res) => {
    try {
      const { org_id } = req.params;

      const query = `
        SELECT 
          id,
          org_id,
          agent_id,
          agent_name,
          language,
          voice,
          agent_instructions,
          human_transfer_criteria,
          appointment_types,
          new_patient_duration,
          followup_duration,
          procedure_specific,
          procedure_duration,
          max_new_patients_per_day,
          max_followups_per_day,
          patient_types_accepted,
          referral_requirements,
          accept_walkins,
          allow_same_day,
          same_day_cutoff_time,
          min_cancellation_hours,
          no_show_fee,
          provider_preferences,
          workflows,
          current_version,
          is_active,
          created_at,
          updated_at
        FROM org_scheduling_agent
        WHERE org_id = $1
        LIMIT 1
      `;

      const result = await db.query(query, [org_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Scheduling agent not found for this organization",
        });
      }

      const agentData = result.rows[0];

      // Parse JSON fields if they're strings
      const jsonFields = [
        "appointment_types",
        "patient_types_accepted",
        "referral_requirements",
        "provider_preferences",
        "workflows",
      ];
      jsonFields.forEach((field) => {
        if (agentData[field] && typeof agentData[field] === "string") {
          try {
            agentData[field] = JSON.parse(agentData[field]);
          } catch (e) {
            agentData[field] = field === "workflows" ? [] : {};
          }
        }
      });

      logger.info("Scheduling agent data retrieved", {
        org_id,
        agent_id: agentData.agent_id,
      });

      res.json({
        success: true,
        data: agentData,
      });
    } catch (error) {
      logger.error("Error retrieving scheduling agent", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to retrieve scheduling agent data",
      });
    }
  },
);

// ===========================
// APPOINTMENT SETUP TAB
// ===========================

/**
 * @swagger
 * /api/v1/scheduling-agent/{org_id}/appointment-setup:
 *   put:
 *     summary: Update appointment setup configuration
 *     tags: [SchedulingAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               appointment_types:
 *                 type: object
 *               new_patient_duration:
 *                 type: string
 *                 example: "45 minutes"
 *               followup_duration:
 *                 type: string
 *                 example: "20 minutes"
 *               procedure_specific:
 *                 type: string
 *               procedure_duration:
 *                 type: string
 *               max_new_patients_per_day:
 *                 type: integer
 *               max_followups_per_day:
 *                 type: integer
 */
router.put(
  "/:org_id/appointment-setup",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const {
        appointment_types,
        new_patient_duration,
        followup_duration,
        procedure_specific,
        procedure_duration,
        max_new_patients_per_day,
        max_followups_per_day,
      } = req.body;

      // Build dynamic update query
      const updateFields = [];
      const updateValues = [org_id];
      let paramCount = 2;

      if (appointment_types !== undefined) {
        updateFields.push(`appointment_types = $${paramCount}`);
        updateValues.push(
          typeof appointment_types === "object"
            ? JSON.stringify(appointment_types)
            : appointment_types,
        );
        paramCount++;
      }

      if (new_patient_duration !== undefined) {
        updateFields.push(`new_patient_duration = $${paramCount}`);
        updateValues.push(new_patient_duration);
        paramCount++;
      }

      if (followup_duration !== undefined) {
        updateFields.push(`followup_duration = $${paramCount}`);
        updateValues.push(followup_duration);
        paramCount++;
      }

      if (procedure_specific !== undefined) {
        updateFields.push(`procedure_specific = $${paramCount}`);
        updateValues.push(procedure_specific);
        paramCount++;
      }

      if (procedure_duration !== undefined) {
        updateFields.push(`procedure_duration = $${paramCount}`);
        updateValues.push(procedure_duration);
        paramCount++;
      }

      if (max_new_patients_per_day !== undefined) {
        updateFields.push(`max_new_patients_per_day = $${paramCount}`);
        updateValues.push(max_new_patients_per_day);
        paramCount++;
      }

      if (max_followups_per_day !== undefined) {
        updateFields.push(`max_followups_per_day = $${paramCount}`);
        updateValues.push(max_followups_per_day);
        paramCount++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No fields to update",
        });
      }

      updateFields.push(`updated_by = $${paramCount}`);
      updateValues.push(req.user.userId);
      updateFields.push("updated_at = CURRENT_TIMESTAMP");

      const updateQuery = `
        UPDATE org_scheduling_agent
        SET ${updateFields.join(", ")}
        WHERE org_id = $1
        RETURNING id, updated_at, current_version
      `;

      const result = await db.query(updateQuery, updateValues);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Scheduling agent not found",
        });
      }

      logger.info("Appointment setup updated", {
        org_id,
        updated_fields: Object.keys(req.body),
        updated_by: req.user.userId,
      });

      res.json({
        success: true,
        message: "Appointment setup updated successfully",
        data: result.rows[0],
      });
    } catch (error) {
      logger.error("Error updating appointment setup", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update appointment setup",
      });
    }
  },
);

// ===========================
// PATIENT & ELIGIBILITY TAB
// ===========================

/**
 * @swagger
 * /api/v1/scheduling-agent/{org_id}/patient-eligibility:
 *   put:
 *     summary: Update patient eligibility configuration
 *     tags: [SchedulingAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               patient_types_accepted:
 *                 type: object
 *                 properties:
 *                   new_patients:
 *                     type: boolean
 *                   existing_patients:
 *                     type: boolean
 *                   self_pay:
 *                     type: boolean
 *                   hmo:
 *                     type: boolean
 *                   ppo:
 *                     type: boolean
 *                   medicare:
 *                     type: boolean
 *                   medicaid:
 *                     type: boolean
 *               referral_requirements:
 *                 type: object
 *                 properties:
 *                   services_requiring_referrals:
 *                     type: array
 *                     items:
 *                       type: string
 *                   insurance_plans_requiring_referrals:
 *                     type: array
 *                     items:
 *                       type: string
 */
router.put(
  "/:org_id/patient-eligibility",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { patient_types_accepted, referral_requirements } = req.body;

      const updateFields = [];
      const updateValues = [org_id];
      let paramCount = 2;

      if (patient_types_accepted !== undefined) {
        updateFields.push(`patient_types_accepted = $${paramCount}`);
        updateValues.push(
          typeof patient_types_accepted === "object"
            ? JSON.stringify(patient_types_accepted)
            : patient_types_accepted,
        );
        paramCount++;
      }

      if (referral_requirements !== undefined) {
        updateFields.push(`referral_requirements = $${paramCount}`);
        updateValues.push(
          typeof referral_requirements === "object"
            ? JSON.stringify(referral_requirements)
            : referral_requirements,
        );
        paramCount++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No fields to update",
        });
      }

      updateFields.push(`updated_by = $${paramCount}`);
      updateValues.push(req.user.userId);
      updateFields.push("updated_at = CURRENT_TIMESTAMP");

      const updateQuery = `
        UPDATE org_scheduling_agent
        SET ${updateFields.join(", ")}
        WHERE org_id = $1
        RETURNING id, updated_at, current_version
      `;

      const result = await db.query(updateQuery, updateValues);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Scheduling agent not found",
        });
      }

      logger.info("Patient eligibility updated", {
        org_id,
        updated_by: req.user.userId,
      });

      res.json({
        success: true,
        message: "Patient eligibility settings updated successfully",
        data: result.rows[0],
      });
    } catch (error) {
      logger.error("Error updating patient eligibility", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update patient eligibility",
      });
    }
  },
);

// ===========================
// SCHEDULING POLICIES TAB
// ===========================

/**
 * @swagger
 * /api/v1/scheduling-agent/{org_id}/scheduling-policies:
 *   put:
 *     summary: Update scheduling policies
 *     tags: [SchedulingAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accept_walkins:
 *                 type: boolean
 *               allow_same_day:
 *                 type: boolean
 *               same_day_cutoff_time:
 *                 type: string
 *                 format: time
 *                 example: "14:00:00"
 *               min_cancellation_hours:
 *                 type: integer
 *                 example: 24
 *               no_show_fee:
 *                 type: number
 *                 example: 50.00
 */
router.put(
  "/:org_id/scheduling-policies",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const {
        accept_walkins,
        allow_same_day,
        same_day_cutoff_time,
        min_cancellation_hours,
        no_show_fee,
      } = req.body;

      const updateFields = [];
      const updateValues = [org_id];
      let paramCount = 2;

      if (accept_walkins !== undefined) {
        updateFields.push(`accept_walkins = $${paramCount}`);
        updateValues.push(accept_walkins);
        paramCount++;
      }

      if (allow_same_day !== undefined) {
        updateFields.push(`allow_same_day = $${paramCount}`);
        updateValues.push(allow_same_day);
        paramCount++;
      }

      if (same_day_cutoff_time !== undefined) {
        updateFields.push(`same_day_cutoff_time = $${paramCount}`);
        updateValues.push(same_day_cutoff_time);
        paramCount++;
      }

      if (min_cancellation_hours !== undefined) {
        updateFields.push(`min_cancellation_hours = $${paramCount}`);
        updateValues.push(min_cancellation_hours);
        paramCount++;
      }

      if (no_show_fee !== undefined) {
        updateFields.push(`no_show_fee = $${paramCount}`);
        updateValues.push(no_show_fee);
        paramCount++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No fields to update",
        });
      }

      updateFields.push(`updated_by = $${paramCount}`);
      updateValues.push(req.user.userId);
      updateFields.push("updated_at = CURRENT_TIMESTAMP");

      const updateQuery = `
        UPDATE org_scheduling_agent
        SET ${updateFields.join(", ")}
        WHERE org_id = $1
        RETURNING id, updated_at, current_version
      `;

      const result = await db.query(updateQuery, updateValues);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Scheduling agent not found",
        });
      }

      logger.info("Scheduling policies updated", {
        org_id,
        updated_by: req.user.userId,
      });

      res.json({
        success: true,
        message: "Scheduling policies updated successfully",
        data: result.rows[0],
      });
    } catch (error) {
      logger.error("Error updating scheduling policies", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update scheduling policies",
      });
    }
  },
);

// ===========================
// PROVIDER PREFERENCES TAB
// ===========================

/**
 * @swagger
 * /api/v1/scheduling-agent/{org_id}/provider-preferences:
 *   put:
 *     summary: Update provider preferences and restrictions
 *     tags: [SchedulingAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider_preferences:
 *                 type: object
 *                 properties:
 *                   blackout_dates:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         provider:
 *                           type: string
 *                         dates:
 *                           type: array
 *                           items:
 *                             type: string
 *                             format: date
 *                   established_patients_only_days:
 *                     type: string
 *                   custom_scheduling_rules:
 *                     type: string
 */
router.put(
  "/:org_id/provider-preferences",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { provider_preferences } = req.body;

      if (!provider_preferences) {
        return res.status(400).json({
          success: false,
          error: "Provider preferences are required",
        });
      }

      const updateQuery = `
        UPDATE org_scheduling_agent
        SET 
          provider_preferences = $2,
          updated_by = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE org_id = $1
        RETURNING id, updated_at, current_version
      `;

      const result = await db.query(updateQuery, [
        org_id,
        typeof provider_preferences === "object"
          ? JSON.stringify(provider_preferences)
          : provider_preferences,
        req.user.userId,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Scheduling agent not found",
        });
      }

      logger.info("Provider preferences updated", {
        org_id,
        updated_by: req.user.userId,
      });

      res.json({
        success: true,
        message: "Provider preferences updated successfully",
        data: result.rows[0],
      });
    } catch (error) {
      logger.error("Error updating provider preferences", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update provider preferences",
      });
    }
  },
);

// ===========================
// WORKFLOWS TAB
// ===========================

/**
 * @swagger
 * /api/v1/scheduling-agent/{org_id}/workflows:
 *   put:
 *     summary: Update workflows configuration
 *     tags: [SchedulingAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workflows:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     trigger:
 *                       type: string
 *                     actions:
 *                       type: array
 *                       items:
 *                         type: object
 */
router.put(
  "/:org_id/workflows",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { workflows } = req.body;

      if (!Array.isArray(workflows)) {
        return res.status(400).json({
          success: false,
          error: "Workflows must be an array",
        });
      }

      const updateQuery = `
        UPDATE org_scheduling_agent
        SET 
          workflows = $2,
          updated_by = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE org_id = $1
        RETURNING id, workflows, updated_at, current_version
      `;

      const result = await db.query(updateQuery, [
        org_id,
        JSON.stringify(workflows),
        req.user.userId,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Scheduling agent not found",
        });
      }

      logger.info("Workflows updated", {
        org_id,
        workflow_count: workflows.length,
        updated_by: req.user.userId,
      });

      res.json({
        success: true,
        message: "Workflows updated successfully",
        data: {
          workflows: result.rows[0].workflows,
          updated_at: result.rows[0].updated_at,
        },
      });
    } catch (error) {
      logger.error("Error updating workflows", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update workflows",
      });
    }
  },
);

// ===========================
// AGENT CONFIG TAB
// ===========================

/**
 * @swagger
 * /api/v1/scheduling-agent/{org_id}/agent-config:
 *   put:
 *     summary: Update agent configuration (name, voice, language, instructions)
 *     tags: [SchedulingAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               agent_name:
 *                 type: string
 *               language:
 *                 type: string
 *               voice:
 *                 type: string
 *               agent_instructions:
 *                 type: string
 *               human_transfer_criteria:
 *                 type: string
 */
router.put(
  "/:org_id/agent-config",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const {
        agent_name,
        language,
        voice,
        agent_instructions,
        human_transfer_criteria,
      } = req.body;

      const updateFields = [];
      const updateValues = [org_id];
      let paramCount = 2;

      if (agent_name !== undefined) {
        updateFields.push(`agent_name = $${paramCount}`);
        updateValues.push(agent_name);
        paramCount++;
      }

      if (language !== undefined) {
        updateFields.push(`language = $${paramCount}`);
        updateValues.push(language);
        paramCount++;
      }

      if (voice !== undefined) {
        updateFields.push(`voice = $${paramCount}`);
        updateValues.push(voice);
        paramCount++;
      }

      if (agent_instructions !== undefined) {
        updateFields.push(`agent_instructions = $${paramCount}`);
        updateValues.push(agent_instructions);
        paramCount++;
      }

      if (human_transfer_criteria !== undefined) {
        updateFields.push(`human_transfer_criteria = $${paramCount}`);
        updateValues.push(human_transfer_criteria);
        paramCount++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No fields to update",
        });
      }

      updateFields.push(`updated_by = $${paramCount}`);
      updateValues.push(req.user.userId);
      updateFields.push("updated_at = CURRENT_TIMESTAMP");

      const updateQuery = `
        UPDATE org_scheduling_agent
        SET ${updateFields.join(", ")}
        WHERE org_id = $1
        RETURNING *
      `;

      const result = await db.query(updateQuery, updateValues);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Scheduling agent not found",
        });
      }

      logger.info("Agent configuration updated", {
        org_id,
        updated_fields: Object.keys(req.body),
        updated_by: req.user.userId,
      });

      res.json({
        success: true,
        message: "Agent configuration updated successfully",
        data: result.rows[0],
      });
    } catch (error) {
      logger.error("Error updating agent configuration", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update agent configuration",
      });
    }
  },
);

// ===========================
// INDIVIDUAL FIELD UPDATES
// ===========================

/**
 * @swagger
 * /api/v1/scheduling-agent/{org_id}/update-voice:
 *   put:
 *     summary: Update agent voice only
 *     tags: [SchedulingAgent]
 */
router.put(
  "/:org_id/update-voice",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { voice } = req.body;

      if (!voice) {
        return res.status(400).json({
          success: false,
          error: "Voice is required",
        });
      }

      const updateQuery = `
        UPDATE org_scheduling_agent
        SET 
          voice = $2,
          updated_by = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE org_id = $1
        RETURNING id, voice, updated_at, current_version
      `;

      const result = await db.query(updateQuery, [
        org_id,
        voice,
        req.user.userId,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Scheduling agent not found",
        });
      }

      res.json({
        success: true,
        message: "Voice updated successfully",
        data: result.rows[0],
      });
    } catch (error) {
      logger.error("Error updating voice", { error: error.message });
      res.status(500).json({
        success: false,
        error: "Failed to update voice",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/scheduling-agent/{org_id}/update-all:
 *   put:
 *     summary: Update all scheduling agent configuration at once
 *     tags: [SchedulingAgent]
 *     security:
 *       - bearerAuth: []
 *     description: Updates all fields in a single request. Used for "Save All" functionality.
 */
router.put(
  "/:org_id/update-all",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const updateData = req.body;

      // Build dynamic update query for all possible fields
      const updateFields = [];
      const updateValues = [org_id];
      let paramCount = 2;

      // Agent config fields
      const configFields = [
        "agent_name",
        "language",
        "voice",
        "agent_instructions",
        "human_transfer_criteria",
      ];

      // Appointment setup fields
      const appointmentFields = [
        "appointment_types",
        "new_patient_duration",
        "followup_duration",
        "procedure_specific",
        "procedure_duration",
        "max_new_patients_per_day",
        "max_followups_per_day",
      ];

      // Patient eligibility fields
      const eligibilityFields = [
        "patient_types_accepted",
        "referral_requirements",
      ];

      // Scheduling policy fields
      const policyFields = [
        "accept_walkins",
        "allow_same_day",
        "same_day_cutoff_time",
        "min_cancellation_hours",
        "no_show_fee",
      ];

      // Provider preference fields
      const providerFields = ["provider_preferences"];

      // Workflow fields
      const workflowFields = ["workflows"];

      // Process all fields
      const allFields = [
        ...configFields,
        ...appointmentFields,
        ...eligibilityFields,
        ...policyFields,
        ...providerFields,
        ...workflowFields,
      ];

      allFields.forEach((field) => {
        if (updateData[field] !== undefined) {
          updateFields.push(`${field} = $${paramCount}`);

          // Handle JSON fields
          if (
            [
              "appointment_types",
              "patient_types_accepted",
              "referral_requirements",
              "provider_preferences",
              "workflows",
            ].includes(field)
          ) {
            updateValues.push(
              typeof updateData[field] === "object"
                ? JSON.stringify(updateData[field])
                : updateData[field],
            );
          } else {
            updateValues.push(updateData[field]);
          }
          paramCount++;
        }
      });

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No fields to update",
        });
      }

      // Add updated_by and updated_at
      updateFields.push(`updated_by = $${paramCount}`);
      updateValues.push(req.user.userId);
      updateFields.push("updated_at = CURRENT_TIMESTAMP");

      const updateQuery = `
        UPDATE org_scheduling_agent
        SET ${updateFields.join(", ")}
        WHERE org_id = $1
        RETURNING *
      `;

      const result = await db.query(updateQuery, updateValues);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Scheduling agent not found",
        });
      }

      const updatedAgent = result.rows[0];

      // Parse JSON fields for response
      const jsonFields = [
        "appointment_types",
        "patient_types_accepted",
        "referral_requirements",
        "provider_preferences",
        "workflows",
      ];
      jsonFields.forEach((field) => {
        if (updatedAgent[field] && typeof updatedAgent[field] === "string") {
          try {
            updatedAgent[field] = JSON.parse(updatedAgent[field]);
          } catch (e) {
            // Keep as is if parse fails
          }
        }
      });

      logger.info("Scheduling agent fully updated", {
        org_id,
        updated_field_count: updateFields.length - 2, // Minus updated_by and updated_at
        updated_by: req.user.userId,
        version: updatedAgent.current_version,
      });

      res.json({
        success: true,
        message: "Scheduling agent configuration updated successfully",
        data: updatedAgent,
      });
    } catch (error) {
      logger.error("Error updating scheduling agent", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update scheduling agent configuration",
      });
    }
  },
);

module.exports = router;
