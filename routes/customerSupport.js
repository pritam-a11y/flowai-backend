const express = require("express");
const router = express.Router();
const db = require("../db/connection");
const logger = require("../utils/logger");
const jwtMiddleware = require("../middleware/jwt").withOptions;
const createOrgAccessMiddleware = require("../middleware/orgAccess");
const requireFeaturePermission = require("../middleware/featureAccess");
const multer = require("multer");
const s3DocumentService = require("../services/s3DocumentService");

// Configure multer for file uploads (add after router initialization)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedMimeTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid file type. Allowed types: PDF, DOC, DOCX, XLS, XLSX, TXT, JPEG, PNG, GIF, WEBP`,
        ),
        false,
      );
    }
  },
});

// Apply JWT middleware to all routes
router.use(jwtMiddleware());

/**
 * @swagger
 * tags:
 *   name: CustomerSupportAgent
 *   description: Customer Support Agent management endpoints
 */

/**
 * @swagger
 * /api/v1/customer-support-agent/{org_id}:
 *   get:
 *     summary: Get all customer support agent data including FAQs
 *     tags: [CustomerSupportAgent]
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
 *         description: Customer support agent complete configuration
 *       404:
 *         description: Agent configuration not found
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
          faqs,
          documents,  -- Add documents to the query
          current_version,
          is_active,
          created_at,
          updated_at,
          created_by,
          updated_by
        FROM org_customer_support_agent
        WHERE org_id = $1
        LIMIT 1
      `;

      const result = await db.query(query, [org_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Customer support agent not found for this organization",
        });
      }

      const agentData = result.rows[0];

      // Ensure FAQs is properly parsed if it's a string
      if (typeof agentData.faqs === "string") {
        try {
          agentData.faqs = JSON.parse(agentData.faqs);
        } catch (e) {
          agentData.faqs = [];
        }
      }

      // Ensure documents is properly parsed if it's a string
      if (typeof agentData.documents === "string") {
        try {
          agentData.documents = JSON.parse(agentData.documents);
        } catch (e) {
          agentData.documents = [];
        }
      }

      // Ensure documents is an array
      if (!Array.isArray(agentData.documents)) {
        agentData.documents = [];
      }

      logger.info("Customer support agent data retrieved", {
        org_id,
        agent_id: agentData.agent_id,
        has_faqs: agentData.faqs && agentData.faqs.length > 0,
        document_count: agentData.documents.length,
      });

      res.json({
        success: true,
        data: agentData,
      });
    } catch (error) {
      logger.error("Error retrieving customer support agent", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to retrieve customer support agent data",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/customer-support-agent/{org_id}/update-faqs:
 *   put:
 *     summary: Update all FAQs for the customer support agent
 *     tags: [CustomerSupportAgent]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - faqs
 *             properties:
 *               faqs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     question:
 *                       type: string
 *                     answer:
 *                       type: string
 *     responses:
 *       200:
 *         description: FAQs updated successfully
 */
router.put(
  "/:org_id/update-faqs",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { faqs } = req.body;

      if (!Array.isArray(faqs)) {
        return res.status(400).json({
          success: false,
          error: "FAQs must be an array",
        });
      }

      // Validate FAQ structure
      for (let i = 0; i < faqs.length; i++) {
        const faq = faqs[i];
        if (!faq.question || !faq.answer) {
          return res.status(400).json({
            success: false,
            error: `FAQ at index ${i} must have both question and answer`,
          });
        }
      }

      const updateQuery = `
        UPDATE org_customer_support_agent
        SET 
          faqs = $2,
          updated_by = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE org_id = $1
        RETURNING id, faqs, updated_at
      `;

      const result = await db.query(updateQuery, [
        org_id,
        JSON.stringify(faqs),
        req.user.userId,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Customer support agent not found",
        });
      }

      logger.info("FAQs updated", {
        org_id,
        faq_count: faqs.length,
        updated_by: req.user.userId,
      });

      res.json({
        success: true,
        message: "FAQs updated successfully",
        data: {
          faqs: result.rows[0].faqs,
          updated_at: result.rows[0].updated_at,
        },
      });
    } catch (error) {
      logger.error("Error updating FAQs", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update FAQs",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/customer-support-agent/{org_id}/update-voice:
 *   put:
 *     summary: Update agent voice
 *     tags: [CustomerSupportAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - voice
 *             properties:
 *               voice:
 *                 type: string
 *                 example: "Alex"
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
        UPDATE org_customer_support_agent
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
          error: "Customer support agent not found",
        });
      }

      logger.info("Agent voice updated", {
        org_id,
        voice,
        updated_by: req.user.userId,
        version: result.rows[0].current_version,
      });

      res.json({
        success: true,
        message: "Voice updated successfully",
        data: {
          voice: result.rows[0].voice,
          updated_at: result.rows[0].updated_at,
          current_version: result.rows[0].current_version,
        },
      });
    } catch (error) {
      logger.error("Error updating voice", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update voice",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/customer-support-agent/{org_id}/update-name:
 *   put:
 *     summary: Update agent name
 *     tags: [CustomerSupportAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - agent_name
 *             properties:
 *               agent_name:
 *                 type: string
 *                 example: "Alex - Customer Support Assistant"
 */
router.put(
  "/:org_id/update-name",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { agent_name } = req.body;

      if (!agent_name) {
        return res.status(400).json({
          success: false,
          error: "Agent name is required",
        });
      }

      const updateQuery = `
        UPDATE org_customer_support_agent
        SET 
          agent_name = $2,
          updated_by = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE org_id = $1
        RETURNING id, agent_name, updated_at, current_version
      `;

      const result = await db.query(updateQuery, [
        org_id,
        agent_name,
        req.user.userId,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Customer support agent not found",
        });
      }

      logger.info("Agent name updated", {
        org_id,
        agent_name,
        updated_by: req.user.userId,
        version: result.rows[0].current_version,
      });

      res.json({
        success: true,
        message: "Agent name updated successfully",
        data: {
          agent_name: result.rows[0].agent_name,
          updated_at: result.rows[0].updated_at,
          current_version: result.rows[0].current_version,
        },
      });
    } catch (error) {
      logger.error("Error updating agent name", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update agent name",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/customer-support-agent/{org_id}/update-language:
 *   put:
 *     summary: Update agent language
 *     tags: [CustomerSupportAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - language
 *             properties:
 *               language:
 *                 type: string
 *                 example: "English"
 */
router.put(
  "/:org_id/update-language",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { language } = req.body;

      if (!language) {
        return res.status(400).json({
          success: false,
          error: "Language is required",
        });
      }

      const updateQuery = `
        UPDATE org_customer_support_agent
        SET 
          language = $2,
          updated_by = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE org_id = $1
        RETURNING id, language, updated_at, current_version
      `;

      const result = await db.query(updateQuery, [
        org_id,
        language,
        req.user.userId,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Customer support agent not found",
        });
      }

      logger.info("Agent language updated", {
        org_id,
        language,
        updated_by: req.user.userId,
        version: result.rows[0].current_version,
      });

      res.json({
        success: true,
        message: "Language updated successfully",
        data: {
          language: result.rows[0].language,
          updated_at: result.rows[0].updated_at,
          current_version: result.rows[0].current_version,
        },
      });
    } catch (error) {
      logger.error("Error updating language", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update language",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/customer-support-agent/{org_id}/update-instructions:
 *   put:
 *     summary: Update agent instructions
 *     tags: [CustomerSupportAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - agent_instructions
 *             properties:
 *               agent_instructions:
 *                 type: string
 *                 description: Detailed agent instructions in markdown format
 */
router.put(
  "/:org_id/update-instructions",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { agent_instructions } = req.body;

      if (!agent_instructions) {
        return res.status(400).json({
          success: false,
          error: "Agent instructions are required",
        });
      }

      const updateQuery = `
        UPDATE org_customer_support_agent
        SET 
          agent_instructions = $2,
          updated_by = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE org_id = $1
        RETURNING id, updated_at, current_version
      `;

      const result = await db.query(updateQuery, [
        org_id,
        agent_instructions,
        req.user.userId,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Customer support agent not found",
        });
      }

      logger.info("Agent instructions updated", {
        org_id,
        updated_by: req.user.userId,
        version: result.rows[0].current_version,
        instructions_length: agent_instructions.length,
      });

      res.json({
        success: true,
        message: "Agent instructions updated successfully",
        data: {
          updated_at: result.rows[0].updated_at,
          current_version: result.rows[0].current_version,
        },
      });
    } catch (error) {
      logger.error("Error updating agent instructions", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update agent instructions",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/customer-support-agent/{org_id}/update-human-transfer:
 *   put:
 *     summary: Update human transfer criteria
 *     tags: [CustomerSupportAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - human_transfer_criteria
 *             properties:
 *               human_transfer_criteria:
 *                 type: string
 *                 description: Criteria for transferring to human agent
 */
router.put(
  "/:org_id/update-human-transfer",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { human_transfer_criteria } = req.body;

      if (!human_transfer_criteria) {
        return res.status(400).json({
          success: false,
          error: "Human transfer criteria is required",
        });
      }

      const updateQuery = `
        UPDATE org_customer_support_agent
        SET 
          human_transfer_criteria = $2,
          updated_by = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE org_id = $1
        RETURNING id, updated_at, current_version
      `;

      const result = await db.query(updateQuery, [
        org_id,
        human_transfer_criteria,
        req.user.userId,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Customer support agent not found",
        });
      }

      logger.info("Human transfer criteria updated", {
        org_id,
        updated_by: req.user.userId,
        version: result.rows[0].current_version,
      });

      res.json({
        success: true,
        message: "Human transfer criteria updated successfully",
        data: {
          updated_at: result.rows[0].updated_at,
          current_version: result.rows[0].current_version,
        },
      });
    } catch (error) {
      logger.error("Error updating human transfer criteria", {
        error: error.message,
        org_id: req.params.org_id,
      });
      res.status(500).json({
        success: false,
        error: "Failed to update human transfer criteria",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/customer-support-agent/{org_id}/upload-document:
 *   post:
 *     summary: Upload a document for the customer support agent
 *     tags: [CustomerSupportAgent]
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
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Document file to upload
 *     responses:
 *       200:
 *         description: Document uploaded successfully
 *       400:
 *         description: Invalid file or request
 *       413:
 *         description: File too large
 */
router.post(
  "/:org_id/upload-document",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  upload.single("file"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          error: "No file uploaded",
        });
      }

      logger.info("Uploading document for customer support agent", {
        org_id,
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      });

      // Upload to S3
      const uploadResult = await s3DocumentService.uploadDocument(file.buffer, {
        filename: file.originalname,
        mimetype: file.mimetype,
        orgId: org_id,
        section: "customer_support",
        uploadedBy: req.user.userId,
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Failed to upload to S3");
      }

      // Prepare document metadata (following launchpad pattern)
      const documentData = {
        name: file.originalname,
        url: uploadResult.document.url,
        s3_key: uploadResult.document.s3_key,
        uploaded_at: new Date().toISOString(),
        uploaded_by: req.user.userId,
      };

      // Get current documents array
      const getQuery = `
        SELECT documents 
        FROM org_customer_support_agent 
        WHERE org_id = $1
      `;

      const currentData = await db.query(getQuery, [org_id]);

      if (currentData.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Customer support agent not found",
        });
      }

      let documents = currentData.rows[0].documents || [];

      // Ensure documents is an array
      if (typeof documents === "string") {
        try {
          documents = JSON.parse(documents);
        } catch (e) {
          documents = [];
        }
      }
      if (!Array.isArray(documents)) {
        documents = [];
      }

      // Add new document
      documents.push(documentData);

      // Update database with new documents array
      const updateQuery = `
        UPDATE org_customer_support_agent
        SET 
          documents = $2,
          updated_by = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE org_id = $1
        RETURNING documents, updated_at
      `;

      const updateResult = await db.query(updateQuery, [
        org_id,
        JSON.stringify(documents),
        req.user.userId,
      ]);

      logger.info("Document uploaded successfully", {
        org_id,
        document_name: documentData.name,
        total_documents: documents.length,
      });

      res.json({
        success: true,
        message: "Document uploaded successfully",
        document: documentData,
      });
    } catch (error) {
      logger.error("Error uploading document", {
        error: error.message,
        org_id: req.params.org_id,
      });

      if (error.message.includes("Invalid file type")) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      if (error.message.includes("File too large")) {
        return res.status(413).json({
          success: false,
          error: "File too large. Maximum size is 10MB",
        });
      }

      res.status(500).json({
        success: false,
        error: error.message || "Failed to upload document",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/customer-support-agent/{org_id}/delete-document:
 *   post:
 *     summary: Delete a document from the customer support agent
 *     tags: [CustomerSupportAgent]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 description: URL of the document to delete
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *       404:
 *         description: Document not found
 */
router.post(
  "/:org_id/delete-document",
  createOrgAccessMiddleware({ requireOrgId: true }),
  requireFeaturePermission("agents", "write"),
  async (req, res) => {
    try {
      const { org_id } = req.params;
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: "Document URL is required",
        });
      }

      // Get current documents array
      const getQuery = `
        SELECT documents 
        FROM org_customer_support_agent 
        WHERE org_id = $1
      `;

      const currentData = await db.query(getQuery, [org_id]);

      if (currentData.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Customer support agent not found",
        });
      }

      let documents = currentData.rows[0].documents || [];

      // Parse if needed
      if (typeof documents === "string") {
        try {
          documents = JSON.parse(documents);
        } catch (e) {
          documents = [];
        }
      }
      if (!Array.isArray(documents)) {
        documents = [];
      }

      // Find the document to delete by URL
      const documentToDelete = documents.find((doc) => doc.url === url);

      if (!documentToDelete) {
        return res.status(404).json({
          success: false,
          error: "Document not found",
        });
      }

      logger.info("Deleting document from customer support agent", {
        org_id,
        document_name: documentToDelete.name,
        s3_key: documentToDelete.s3_key,
      });

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
          // Continue with database removal even if S3 deletion fails
        }
      }

      // Remove from documents array
      const updatedDocs = documents.filter((doc) => doc.url !== url);

      // Update database
      const updateQuery = `
        UPDATE org_customer_support_agent
        SET 
          documents = $2,
          updated_by = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE org_id = $1
        RETURNING documents, updated_at
      `;

      await db.query(updateQuery, [
        org_id,
        JSON.stringify(updatedDocs),
        req.user.userId,
      ]);

      logger.info("Document deleted successfully", {
        org_id,
        document_name: documentToDelete.name,
        remaining_documents: updatedDocs.length,
      });

      res.json({
        success: true,
        message: "Document deleted successfully",
      });
    } catch (error) {
      logger.error("Error deleting document", {
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
 * /api/v1/customer-support-agent/{org_id}/update-all:
 *   put:
 *     summary: Update all agent configuration at once (for Save All button)
 *     tags: [CustomerSupportAgent]
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
  "/:org_id/update-all",
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

      // Build dynamic update query based on provided fields
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

      // Add updated_by and updated_at
      updateFields.push(`updated_by = $${paramCount}`);
      updateValues.push(req.user.userId);
      updateFields.push("updated_at = CURRENT_TIMESTAMP");

      const updateQuery = `
        UPDATE org_customer_support_agent
        SET ${updateFields.join(", ")}
        WHERE org_id = $1
        RETURNING *
      `;

      const result = await db.query(updateQuery, updateValues);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Customer support agent not found",
        });
      }

      const updatedAgent = result.rows[0];

      // Parse FAQs if needed
      if (typeof updatedAgent.faqs === "string") {
        try {
          updatedAgent.faqs = JSON.parse(updatedAgent.faqs);
        } catch (e) {
          updatedAgent.faqs = [];
        }
      }

      logger.info("Agent configuration updated", {
        org_id,
        updated_fields: Object.keys(req.body),
        updated_by: req.user.userId,
        version: updatedAgent.current_version,
      });

      res.json({
        success: true,
        message: "Agent configuration updated successfully",
        data: updatedAgent,
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

module.exports = router;
