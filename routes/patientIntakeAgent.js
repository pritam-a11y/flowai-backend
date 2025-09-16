const express = require("express");
const router = express.Router();
const db = require("../db/connection");
const logger = require("../utils/logger");
const jwtMiddleware = require("../middleware/jwt").withOptions;
const createOrgAccessMiddleware = require("../middleware/orgAccess");
const requireFeaturePermission = require("../middleware/featureAccess");
const { v4: uuidv4 } = require("uuid");

// Apply JWT middleware to all routes
router.use(jwtMiddleware());

/**
 * @swagger
 * tags:
 *   name: PatientIntakeAgent
 *   description: Patient Intake Agent management endpoints
 */

/**
 * @swagger
 * /api/v1/patient-intake-agent/{org_id}:
 *   get:
 *     summary: Get complete patient intake agent configuration
 *     tags: [PatientIntakeAgent]
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
 *         description: Complete patient intake agent configuration
 *       404:
 *         description: Patient intake agent not found
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
          intake_forms,
          modality_forms,
          custom_forms,
          field_requirements,
          special_instructions,
          delivery_methods,
          signature_consent,
          workflows,
          current_version,
          is_active,
          created_at,
          updated_at
        FROM org_patient_intake_agent
        WHERE org_id = $1
        LIMIT 1
      `;

      const result = await db.query(query, [org_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Patient intake agent not found for this organization",
        });
      }

      const agentData = result.rows[0];

      // Parse JSON fields if they're strings
      const jsonFields = [
        "intake_forms",
        "modality_forms",
        "custom_forms",
        "field_requirements",
        "special_instructions",
        "delivery_methods",
        "signature_consent",
        "workflows",
      ];

      jsonFields.forEach((field) => {
        if (agentData[field] && typeof agentData[field] === "string") {
          try {
            agentData[field] = JSON.parse(agentData[field]);
          } catch (e) {
            agentData[field] = [
              "workflows",
              "intake_forms",
              "modality_forms",
              "custom_forms",
            ].includes(field)
              ? []
              : {};
          }
        }
      });

      logger.info("Patient intake agent data retrieved", {
        org_id,
        agent_id: agentData.agent_id,
      });

      res.json({
        success: true,
        data: agentData,
      });
    } catch (error) {
      logger.error("Error retrieving patient intake agent", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to retrieve patient intake agent data",
      });
    }
  },
);

// ===========================
// FORMS & QUESTIONNAIRES TAB
// ===========================

/**
 * @swagger
 * /api/v1/patient-intake-agent/{org_id}/forms:
 *   put:
 *     summary: Update intake forms configuration
 *     tags: [PatientIntakeAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               intake_forms:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     type:
 *                       type: string
 *                       enum: [adaptive, consent, custom]
 *                     enabled:
 *                       type: boolean
 *                     template:
 *                       type: string
 *                     description:
 *                       type: string
 *               modality_forms:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     type:
 *                       type: string
 *                     procedure:
 *                       type: string
 *                     enabled:
 *                       type: boolean
 *               custom_forms:
 *                 type: array
 *                 items:
 *                   type: object
 */
router.put(
  "/:org_id/forms",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { intake_forms, modality_forms, custom_forms } = req.body;

      const updateFields = [];
      const updateValues = [org_id];
      let paramCount = 2;

      if (intake_forms !== undefined) {
        updateFields.push(`intake_forms = $${paramCount}`);
        updateValues.push(JSON.stringify(intake_forms));
        paramCount++;
      }

      if (modality_forms !== undefined) {
        updateFields.push(`modality_forms = $${paramCount}`);
        updateValues.push(JSON.stringify(modality_forms));
        paramCount++;
      }

      if (custom_forms !== undefined) {
        updateFields.push(`custom_forms = $${paramCount}`);
        updateValues.push(JSON.stringify(custom_forms));
        paramCount++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No forms to update",
        });
      }

      updateFields.push(`updated_by = $${paramCount}`);
      updateValues.push(req.user.userId);
      updateFields.push("updated_at = CURRENT_TIMESTAMP");

      const updateQuery = `
        UPDATE org_patient_intake_agent
        SET ${updateFields.join(", ")}
        WHERE org_id = $1
        RETURNING id, intake_forms, modality_forms, custom_forms, updated_at, current_version
      `;

      const result = await db.query(updateQuery, updateValues);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Patient intake agent not found",
        });
      }

      logger.info("Forms configuration updated", {
        org_id,
        updated_by: req.user.userId,
      });

      res.json({
        success: true,
        message: "Forms configuration updated successfully",
        data: result.rows[0],
      });
    } catch (error) {
      logger.error("Error updating forms configuration", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update forms configuration",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/patient-intake-agent/{org_id}/forms/toggle:
 *   put:
 *     summary: Toggle form enabled/disabled status
 *     tags: [PatientIntakeAgent]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               form_type:
 *                 type: string
 *                 enum: [intake_forms, modality_forms, custom_forms]
 *               form_id:
 *                 type: string
 *               enabled:
 *                 type: boolean
 */
router.put(
  "/:org_id/forms/toggle",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { form_type, form_id, enabled } = req.body;

      if (!form_type || !form_id || enabled === undefined) {
        return res.status(400).json({
          success: false,
          error: "form_type, form_id, and enabled are required",
        });
      }

      // Get current forms
      const getQuery = `
        SELECT ${form_type}
        FROM org_patient_intake_agent
        WHERE org_id = $1
      `;

      const getResult = await db.query(getQuery, [org_id]);

      if (getResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Patient intake agent not found",
        });
      }

      let forms = getResult.rows[0][form_type] || [];
      if (typeof forms === "string") {
        forms = JSON.parse(forms);
      }

      // Find and update the form
      const formIndex = forms.findIndex((f) => f.id === form_id);
      if (formIndex === -1) {
        return res.status(404).json({
          success: false,
          error: "Form not found",
        });
      }

      forms[formIndex].enabled = enabled;

      // Update in database
      const updateQuery = `
        UPDATE org_patient_intake_agent
        SET 
          ${form_type} = $2,
          updated_by = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE org_id = $1
        RETURNING id, updated_at
      `;

      await db.query(updateQuery, [
        org_id,
        JSON.stringify(forms),
        req.user.userId,
      ]);

      logger.info("Form toggle status updated", {
        org_id,
        form_type,
        form_id,
        enabled,
      });

      res.json({
        success: true,
        message: `Form ${enabled ? "enabled" : "disabled"} successfully`,
      });
    } catch (error) {
      logger.error("Error toggling form status", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to toggle form status",
      });
    }
  },
);

// ===========================
// FIELD & CONTENT RULES TAB
// ===========================

/**
 * @swagger
 * /api/v1/patient-intake-agent/{org_id}/field-requirements:
 *   put:
 *     summary: Update field requirements and special instructions
 *     tags: [PatientIntakeAgent]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               field_requirements:
 *                 type: object
 *                 properties:
 *                   patient_name:
 *                     type: string
 *                     enum: [required, optional]
 *                   date_of_birth:
 *                     type: string
 *                     enum: [required, optional]
 *                   phone_number:
 *                     type: string
 *                     enum: [required, optional]
 *                   email:
 *                     type: string
 *                     enum: [required, optional]
 *                   insurance_id:
 *                     type: string
 *                     enum: [required, optional]
 *                   emergency_contact:
 *                     type: string
 *                     enum: [required, optional]
 *                   preferred_language:
 *                     type: string
 *                     enum: [required, optional]
 *               special_instructions:
 *                 type: object
 *                 properties:
 *                   minors_instructions:
 *                     type: string
 *                   no_insurance_instructions:
 *                     type: string
 *                   language_barrier_instructions:
 *                     type: string
 */
router.put(
  "/:org_id/field-requirements",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { field_requirements, special_instructions } = req.body;

      const updateFields = [];
      const updateValues = [org_id];
      let paramCount = 2;

      if (field_requirements !== undefined) {
        updateFields.push(`field_requirements = $${paramCount}`);
        updateValues.push(
          typeof field_requirements === "object"
            ? JSON.stringify(field_requirements)
            : field_requirements,
        );
        paramCount++;
      }

      if (special_instructions !== undefined) {
        updateFields.push(`special_instructions = $${paramCount}`);
        updateValues.push(
          typeof special_instructions === "object"
            ? JSON.stringify(special_instructions)
            : special_instructions,
        );
        paramCount++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No field requirements to update",
        });
      }

      updateFields.push(`updated_by = $${paramCount}`);
      updateValues.push(req.user.userId);
      updateFields.push("updated_at = CURRENT_TIMESTAMP");

      const updateQuery = `
        UPDATE org_patient_intake_agent
        SET ${updateFields.join(", ")}
        WHERE org_id = $1
        RETURNING id, field_requirements, special_instructions, updated_at, current_version
      `;

      const result = await db.query(updateQuery, updateValues);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Patient intake agent not found",
        });
      }

      logger.info("Field requirements updated", {
        org_id,
        updated_by: req.user.userId,
      });

      res.json({
        success: true,
        message:
          "Field requirements and special instructions updated successfully",
        data: result.rows[0],
      });
    } catch (error) {
      logger.error("Error updating field requirements", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update field requirements",
      });
    }
  },
);

// ===========================
// DELIVERY METHODS TAB
// ===========================

/**
 * @swagger
 * /api/v1/patient-intake-agent/{org_id}/delivery-methods:
 *   put:
 *     summary: Update delivery methods and signature/consent settings
 *     tags: [PatientIntakeAgent]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               delivery_methods:
 *                 type: object
 *                 properties:
 *                   text_message_link:
 *                     type: boolean
 *                   voice_call:
 *                     type: boolean
 *                   qr_code:
 *                     type: boolean
 *                   email_link:
 *                     type: boolean
 *                   in_person_tablet:
 *                     type: boolean
 *               signature_consent:
 *                 type: object
 *                 properties:
 *                   digital_signature:
 *                     type: boolean
 *                   verbal_consent_recording:
 *                     type: boolean
 *                   consent_language:
 *                     type: string
 *                   consent_languages_available:
 *                     type: array
 *                     items:
 *                       type: string
 */
router.put(
  "/:org_id/delivery-methods",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { delivery_methods, signature_consent } = req.body;

      const updateFields = [];
      const updateValues = [org_id];
      let paramCount = 2;

      if (delivery_methods !== undefined) {
        updateFields.push(`delivery_methods = $${paramCount}`);
        updateValues.push(
          typeof delivery_methods === "object"
            ? JSON.stringify(delivery_methods)
            : delivery_methods,
        );
        paramCount++;
      }

      if (signature_consent !== undefined) {
        updateFields.push(`signature_consent = $${paramCount}`);
        updateValues.push(
          typeof signature_consent === "object"
            ? JSON.stringify(signature_consent)
            : signature_consent,
        );
        paramCount++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No delivery methods to update",
        });
      }

      updateFields.push(`updated_by = $${paramCount}`);
      updateValues.push(req.user.userId);
      updateFields.push("updated_at = CURRENT_TIMESTAMP");

      const updateQuery = `
        UPDATE org_patient_intake_agent
        SET ${updateFields.join(", ")}
        WHERE org_id = $1
        RETURNING id, delivery_methods, signature_consent, updated_at, current_version
      `;

      const result = await db.query(updateQuery, updateValues);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Patient intake agent not found",
        });
      }

      logger.info("Delivery methods updated", {
        org_id,
        updated_by: req.user.userId,
      });

      res.json({
        success: true,
        message: "Delivery methods and consent settings updated successfully",
        data: result.rows[0],
      });
    } catch (error) {
      logger.error("Error updating delivery methods", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update delivery methods",
      });
    }
  },
);

// ===========================
// WORKFLOWS TAB
// ===========================

/**
 * @swagger
 * /api/v1/patient-intake-agent/{org_id}/workflows:
 *   put:
 *     summary: Update workflows configuration
 *     tags: [PatientIntakeAgent]
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
        UPDATE org_patient_intake_agent
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
          error: "Patient intake agent not found",
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
 * /api/v1/patient-intake-agent/{org_id}/agent-config:
 *   put:
 *     summary: Update agent configuration (name, voice, language, instructions)
 *     tags: [PatientIntakeAgent]
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
        UPDATE org_patient_intake_agent
        SET ${updateFields.join(", ")}
        WHERE org_id = $1
        RETURNING *
      `;

      const result = await db.query(updateQuery, updateValues);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Patient intake agent not found",
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
// ADD/REMOVE CUSTOM FORMS
// ===========================

/**
 * @swagger
 * /api/v1/patient-intake-agent/{org_id}/forms/add-custom:
 *   post:
 *     summary: Add a new custom form
 *     tags: [PatientIntakeAgent]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - type
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *               description:
 *                 type: string
 *               fields:
 *                 type: array
 */
router.post(
  "/:org_id/forms/add-custom",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { name, type, description, fields } = req.body;

      if (!name || !type) {
        return res.status(400).json({
          success: false,
          error: "Name and type are required",
        });
      }

      // Get current custom forms
      const getQuery = `
        SELECT custom_forms
        FROM org_patient_intake_agent
        WHERE org_id = $1
      `;

      const getResult = await db.query(getQuery, [org_id]);

      if (getResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Patient intake agent not found",
        });
      }

      let customForms = getResult.rows[0].custom_forms || [];
      if (typeof customForms === "string") {
        customForms = JSON.parse(customForms);
      }

      // Add new custom form
      const newForm = {
        id: `form_${uuidv4()}`,
        name,
        type,
        description: description || "",
        fields: fields || [],
        enabled: true,
        created_at: new Date().toISOString(),
      };

      customForms.push(newForm);

      // Update in database
      const updateQuery = `
        UPDATE org_patient_intake_agent
        SET 
          custom_forms = $2,
          updated_by = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE org_id = $1
        RETURNING id, custom_forms
      `;

      await db.query(updateQuery, [
        org_id,
        JSON.stringify(customForms),
        req.user.userId,
      ]);

      logger.info("Custom form added", {
        org_id,
        form_id: newForm.id,
        form_name: name,
      });

      res.status(201).json({
        success: true,
        message: "Custom form added successfully",
        data: newForm,
      });
    } catch (error) {
      logger.error("Error adding custom form", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to add custom form",
      });
    }
  },
);

// ===========================
// UPDATE ALL AT ONCE
// ===========================

/**
 * @swagger
 * /api/v1/patient-intake-agent/{org_id}/update-all:
 *   put:
 *     summary: Update all patient intake agent configuration at once
 *     tags: [PatientIntakeAgent]
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

      const updateFields = [];
      const updateValues = [org_id];
      let paramCount = 2;

      // All possible fields
      const allFields = [
        // Agent config
        "agent_name",
        "language",
        "voice",
        "agent_instructions",
        "human_transfer_criteria",
        // Forms
        "intake_forms",
        "modality_forms",
        "custom_forms",
        // Field requirements
        "field_requirements",
        "special_instructions",
        // Delivery methods
        "delivery_methods",
        "signature_consent",
        // Workflows
        "workflows",
      ];

      allFields.forEach((field) => {
        if (updateData[field] !== undefined) {
          updateFields.push(`${field} = $${paramCount}`);

          // Handle JSON fields
          const jsonFields = [
            "intake_forms",
            "modality_forms",
            "custom_forms",
            "field_requirements",
            "special_instructions",
            "delivery_methods",
            "signature_consent",
            "workflows",
          ];

          if (jsonFields.includes(field)) {
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

      updateFields.push(`updated_by = $${paramCount}`);
      updateValues.push(req.user.userId);
      updateFields.push("updated_at = CURRENT_TIMESTAMP");

      const updateQuery = `
        UPDATE org_patient_intake_agent
        SET ${updateFields.join(", ")}
        WHERE org_id = $1
        RETURNING *
      `;

      const result = await db.query(updateQuery, updateValues);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Patient intake agent not found",
        });
      }

      const updatedAgent = result.rows[0];

      // Parse JSON fields for response
      const jsonFields = [
        "intake_forms",
        "modality_forms",
        "custom_forms",
        "field_requirements",
        "special_instructions",
        "delivery_methods",
        "signature_consent",
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

      logger.info("Patient intake agent fully updated", {
        org_id,
        updated_field_count: updateFields.length - 2,
        updated_by: req.user.userId,
        version: updatedAgent.current_version,
      });

      res.json({
        success: true,
        message: "Patient intake agent configuration updated successfully",
        data: updatedAgent,
      });
    } catch (error) {
      logger.error("Error updating patient intake agent", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update patient intake agent configuration",
      });
    }
  },
);

module.exports = router;
