const express = require("express");
const router = express.Router();
const jwtMiddleware = require("../middleware/jwt");
const { validateOrgAccess } = require("../middleware/workspaceAccess");
const requireFeaturePermission = require("../middleware/featureAccess");
const logger = require("../utils/logger");
const db = require("../db/connection");
const AWS = require("aws-sdk");
const multer = require("multer");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

/**
 * @swagger
 * tags:
 *   name: Knowledge Base
 *   description: Knowledge base configuration endpoints
 */

/**
 * Fetch Retell knowledge bases for indexed websites
 */
const fetchRetellKnowledgeBases = async (retellWorkspaceId) => {
  try {
    if (!retellWorkspaceId) {
      logger.warn("No retell_workspace_id found for workspace");
      return [];
    }

    const response = await axios.get(
      "https://api.retellai.com/list-knowledge-bases",
      {
        headers: {
          Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
        },
      },
    );

    // Filter only URL type knowledge bases
    const urlKnowledgeBases = response.data
      .filter((kb) =>
        kb.knowledge_base_sources?.some((source) => source.type === "url"),
      )
      .map((kb) => ({
        knowledge_base_id: kb.knowledge_base_id,
        knowledge_base_name: kb.knowledge_base_name,
        websites: kb.knowledge_base_sources
          .filter((source) => source.type === "url")
          .map((source) => ({
            source_id: source.source_id,
            url: source.url,
          })),
      }))
      .filter((kb) => kb.websites.length > 0);

    return urlKnowledgeBases;
  } catch (error) {
    logger.error("Error fetching Retell knowledge bases", {
      error: error.message,
      retellWorkspaceId,
    });
    return [];
  }
};

/**
 * Fetch knowledge base data from database
 */
const fetchKnowledgeBaseData = async (workspaceId) => {
  const result = await db.query(
    `SELECT kb.*, w.retell_workspace_id
     FROM knowledge_base kb
     JOIN workspaces w ON kb.workspace_id = w.id
     WHERE kb.workspace_id = $1`,
    [workspaceId],
  );

  if (result.rows.length === 0) {
    // Create default knowledge base entry if doesn't exist
    const insertResult = await db.query(
      `INSERT INTO knowledge_base (workspace_id, documents, curated_documents) 
       VALUES ($1, '[]'::jsonb, '[]'::jsonb) 
       RETURNING *`,
      [workspaceId],
    );

    return {
      ...insertResult.rows[0],
      documents: [],
      curated_documents: [],
      indexed_websites: [],
    };
  }

  const kb = result.rows[0];

  // Fetch indexed websites from Retell
  const indexedWebsites = await fetchRetellKnowledgeBases(
    kb.retell_workspace_id,
  );

  return {
    ...kb,
    documents: kb.documents || [],
    curated_documents: kb.curated_documents || [],
    indexed_websites: indexedWebsites,
  };
};

/**
 * @swagger
 * /api/v1/knowledgebase/{org_id}/fetch-data:
 *   post:
 *     summary: Fetch knowledge base data for an organization
 *     tags: [Knowledge Base]
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
 *         description: Knowledge base configuration data
 *       403:
 *         description: Access denied
 *       404:
 *         description: Workspace not found
 */
router.post(
  "/:org_id/fetch-data",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("knowledgebase", "read"), // Using launchpad permissions as specified
  async (req, res) => {
    try {
      const workspaceId = req.workspaceId;

      logger.info("Fetching knowledge base data", {
        workspaceId: workspaceId,
        userId: req.user.userId,
      });

      const kbData = await fetchKnowledgeBaseData(workspaceId);

      res.json({
        success: true,
        data: kbData,
      });
    } catch (error) {
      logger.error("Error fetching knowledge base data", {
        error: error.message,
        userId: req.user.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to fetch knowledge base data",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/knowledgebase/{org_id}/update:
 *   post:
 *     summary: Update knowledge base fields (except documents)
 *     tags: [Knowledge Base]
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
 *             properties:
 *               customer_website:
 *                 type: string
 *               specialties:
 *                 type: string
 *               key_contact_persons:
 *                 type: string
 *               appointment_types_and_duration:
 *                 type: string
 *               scheduling_restrictions:
 *                 type: string
 *               referral_requirements:
 *                 type: string
 *               walkin_vs_scheduled_policy:
 *                 type: string
 *               criteria_stat_urgent_appointments:
 *                 type: string
 *               waitlist_availability:
 *                 type: string
 *               forms_used:
 *                 type: string
 *               forms_by_visit_type_or_modality:
 *                 type: string
 *               id_insurance_upload_workflow:
 *                 type: string
 *               qr_or_kiosk_workflow_support:
 *                 type: string
 *               ehr_field_mapping:
 *                 type: string
 *               in_network_plans_accepted:
 *                 type: string
 *               self_pay_policy:
 *                 type: string
 *               copay_collection_process:
 *                 type: string
 *               referral_preauth_requirements_by_plan:
 *                 type: string
 *               payment_options:
 *                 type: string
 *               top_10_faqs_and_answers:
 *                 type: string
 *               post_visit_support_scenarios:
 *                 type: string
 *               triggers_for_escalation_to_human_agent:
 *                 type: string
 *               clinical_escalation_rules:
 *                 type: string
 *               handoff_rules:
 *                 type: string
 *               transfer_destinations:
 *                 type: string
 *               after_hours_call_handling:
 *                 type: string
 *               ehr_system:
 *                 type: string
 *               scheduling_system:
 *                 type: string
 *               api_availability:
 *                 type: string
 *               preferred_patient_communication_channels:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated knowledge base data
 *       403:
 *         description: Access denied
 */
router.post(
  "/:org_id/update",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("knowledgebase", "write"),
  async (req, res) => {
    try {
      const workspaceId = req.workspaceId;
      const updateData = req.body;

      // Remove documents and curated_documents if accidentally included
      delete updateData.documents;
      delete updateData.curated_documents;
      delete updateData.indexed_websites;

      // Build dynamic update query
      const updateFields = Object.keys(updateData);
      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No fields to update",
        });
      }

      const updatePairs = updateFields.map(
        (field, index) => `${field} = $${index + 2}`,
      );
      const values = [
        workspaceId,
        ...updateFields.map((field) => updateData[field]),
      ];
      values.push(req.user.userId); // For updated_by

      const updateQuery = `
        UPDATE knowledge_base 
        SET ${updatePairs.join(", ")}, 
            updated_by = $${values.length},
            updated_at = NOW()
        WHERE workspace_id = $1
      `;

      await db.query(updateQuery, values);

      logger.info("Updated knowledge base", {
        workspaceId: workspaceId,
        userId: req.user.userId,
        updatedFields: updateFields,
      });

      // Fetch and return updated data
      const kbData = await fetchKnowledgeBaseData(workspaceId);

      res.json({
        success: true,
        data: kbData,
      });
    } catch (error) {
      logger.error("Error updating knowledge base", {
        error: error.message,
        userId: req.user.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to update knowledge base",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/knowledgebase/{org_id}/upload-document:
 *   post:
 *     summary: Upload a document to knowledge base
 *     tags: [Knowledge Base]
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
 *               title:
 *                 type: string
 *                 description: Optional document title
 *               description:
 *                 type: string
 *                 description: Optional document description
 *     responses:
 *       200:
 *         description: Document uploaded successfully
 *       403:
 *         description: Access denied
 *       400:
 *         description: Invalid file
 */
router.post(
  "/:org_id/upload-document",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("knowledgebase", "write"),
  upload.single("file"),
  async (req, res) => {
    try {
      const workspaceId = req.workspaceId;
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          error: "No file provided",
        });
      }

      logger.info("Uploading document", {
        workspaceId: workspaceId,
        userId: req.user.userId,
        filename: file.originalname,
        size: file.size,
      });

      // Generate unique key for S3
      const fileExtension = file.originalname.split(".").pop();
      const s3Key = `knowledge-base/${workspaceId}/${uuidv4()}.${fileExtension}`;

      // Upload to S3
      const s3Params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          originalName: file.originalname,
          workspaceId: workspaceId.toString(),
          uploadedBy: req.user.userId.toString(),
        },
      };

      const s3Response = await s3.upload(s3Params).promise();

      // Create document metadata
      const documentMetadata = {
        id: uuidv4(),
        title: req.body.title || file.originalname,
        description: req.body.description || null,
        category: req.body.category || null,
        filename: file.originalname,
        url: s3Response.Location,
        s3_key: s3Key,
        content_type: file.mimetype,
        size: file.size,
        uploaded_by: req.user.userId,
        uploaded_at: new Date().toISOString(),
      };

      // Update database - add to documents array
      await db.query(
        `UPDATE knowledge_base 
         SET documents = documents || $2::jsonb,
             updated_by = $3,
             updated_at = NOW()
         WHERE workspace_id = $1`,
        [workspaceId, JSON.stringify(documentMetadata), req.user.userId],
      );

      logger.info("Document uploaded successfully", {
        workspaceId: workspaceId,
        documentId: documentMetadata.id,
        s3Key: s3Key,
      });

      // Fetch and return all documents
      const result = await db.query(
        `SELECT documents FROM knowledge_base WHERE workspace_id = $1`,
        [workspaceId],
      );

      res.json({
        success: true,
        data: result.rows[0]?.documents || [],
      });
    } catch (error) {
      logger.error("Error uploading document", {
        error: error.message,
        userId: req.user.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to upload document",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/knowledgebase/{org_id}/delete-document:
 *   post:
 *     summary: Delete a document from knowledge base
 *     tags: [Knowledge Base]
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
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 description: URL of the document to delete
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Document not found
 */
router.post(
  "/:org_id/delete-document",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("knowledgebase", "write"),
  async (req, res) => {
    try {
      const workspaceId = req.workspaceId;
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: "Document URL is required",
        });
      }

      logger.info("Deleting document", {
        workspaceId: workspaceId,
        userId: req.user.userId,
        url: url,
      });

      // Get current documents
      const result = await db.query(
        `SELECT documents FROM knowledge_base WHERE workspace_id = $1`,
        [workspaceId],
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          success: false,
          error: "Knowledge base not found",
        });
      }

      const documents = result.rows[0].documents || [];

      // Find the document to delete
      const documentToDelete = documents.find((doc) => doc.url === url);

      if (!documentToDelete) {
        return res.status(404).json({
          success: false,
          error: "Document not found",
        });
      }

      // Delete from S3
      if (documentToDelete.s3_key) {
        try {
          const s3Params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: documentToDelete.s3_key,
          };

          await s3.deleteObject(s3Params).promise();

          logger.info("Deleted document from S3", {
            s3Key: documentToDelete.s3_key,
          });
        } catch (s3Error) {
          logger.error("Error deleting from S3", {
            error: s3Error.message,
            s3Key: documentToDelete.s3_key,
          });
          // Continue with database deletion even if S3 fails
        }
      }

      // Remove from documents array
      const updatedDocuments = documents.filter((doc) => doc.url !== url);

      // Update database
      await db.query(
        `UPDATE knowledge_base 
         SET documents = $2::jsonb,
             updated_by = $3,
             updated_at = NOW()
         WHERE workspace_id = $1`,
        [workspaceId, JSON.stringify(updatedDocuments), req.user.userId],
      );

      logger.info("Document deleted successfully", {
        workspaceId: workspaceId,
        documentId: documentToDelete.id,
      });

      res.json({
        success: true,
        data: updatedDocuments,
      });
    } catch (error) {
      logger.error("Error deleting document", {
        error: error.message,
        userId: req.user.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to delete document",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/knowledgebase/{org_id}/create-curated-kb:
 *   post:
 *     summary: Create a curated knowledge base document
 *     tags: [Knowledge Base]
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
 *               - document_links
 *               - name
 *             properties:
 *               document_links:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of document URLs to include in curation
 *               name:
 *                 type: string
 *                 description: Name for the curated KB document
 *               description:
 *                 type: string
 *                 description: Optional description
 *     responses:
 *       200:
 *         description: Curated KB created successfully
 *       403:
 *         description: Access denied
 *       400:
 *         description: Invalid request
 */
router.post(
  "/:org_id/create-curated-kb",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("knowledgebase", "write"),
  async (req, res) => {
    try {
      const workspaceId = req.workspaceId;
      const { document_links, name, description } = req.body;

      if (
        !document_links ||
        !Array.isArray(document_links) ||
        document_links.length === 0
      ) {
        return res.status(400).json({
          success: false,
          error: "Document links array is required",
        });
      }

      if (!name) {
        return res.status(400).json({
          success: false,
          error: "Name is required for curated KB",
        });
      }

      logger.info("Creating curated KB", {
        workspaceId: workspaceId,
        userId: req.user.userId,
        documentCount: document_links.length,
        name: name,
      });

      // 1. Fetch all launchpad data
      const launchpadQuery = `
        SELECT basic_info, locations, providers, hours 
        FROM workspaces 
        WHERE id = $1
      `;
      const launchpadResult = await db.query(launchpadQuery, [workspaceId]);
      const launchpadData = launchpadResult.rows[0] || {};

      // 2. Fetch all knowledge base data
      const kbQuery = `
        SELECT * FROM knowledge_base WHERE workspace_id = $1
      `;
      const kbResult = await db.query(kbQuery, [workspaceId]);
      const kbData = kbResult.rows[0] || {};

      // 3. Get selected documents from the documents array
      const selectedDocuments = [];
      if (kbData.documents && Array.isArray(kbData.documents)) {
        for (const link of document_links) {
          const doc = kbData.documents.find((d) => d.url === link);
          if (doc) {
            selectedDocuments.push(doc);
          }
        }
      }

      // 4. Download and read content from selected documents
      const documentContents = [];
      for (const doc of selectedDocuments) {
        try {
          logger.info("Downloading document for curation", {
            documentId: doc.id,
            s3Key: doc.s3_key,
          });

          // Get document from S3
          const s3Params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: doc.s3_key,
          };

          const s3Object = await s3.getObject(s3Params).promise();
          const content = s3Object.Body.toString("utf-8");

          documentContents.push({
            title: doc.title,
            category: doc.category,
            content: content,
          });
        } catch (docError) {
          logger.error("Error downloading document", {
            error: docError.message,
            documentId: doc.id,
          });
        }
      }

      // 5. Prepare data for GPT
      const gptPromptData = {
        launchpad: {
          basicInfo: launchpadData.basic_info,
          locations: launchpadData.locations,
          providers: launchpadData.providers,
          hours: launchpadData.hours,
        },
        knowledgeBase: {
          customerWebsite: kbData.customer_website,
          specialties: kbData.specialties,
          keyContactPersons: kbData.key_contact_persons,
          appointmentTypes: kbData.appointment_types_and_duration,
          schedulingRestrictions: kbData.scheduling_restrictions,
          referralRequirements: kbData.referral_requirements,
          walkinPolicy: kbData.walkin_vs_scheduled_policy,
          urgentAppointments: kbData.criteria_stat_urgent_appointments,
          waitlistAvailability: kbData.waitlist_availability,
          formsUsed: kbData.forms_used,
          formsByVisitType: kbData.forms_by_visit_type_or_modality,
          idInsuranceWorkflow: kbData.id_insurance_upload_workflow,
          qrKioskSupport: kbData.qr_or_kiosk_workflow_support,
          ehrFieldMapping: kbData.ehr_field_mapping,
          inNetworkPlans: kbData.in_network_plans_accepted,
          selfPayPolicy: kbData.self_pay_policy,
          copayProcess: kbData.copay_collection_process,
          referralPreauth: kbData.referral_preauth_requirements_by_plan,
          paymentOptions: kbData.payment_options,
          faqs: kbData.top_10_faqs_and_answers,
          postVisitSupport: kbData.post_visit_support_scenarios,
          escalationTriggers: kbData.triggers_for_escalation_to_human_agent,
          clinicalEscalation: kbData.clinical_escalation_rules,
          handoffRules: kbData.handoff_rules,
          transferDestinations: kbData.transfer_destinations,
          afterHoursHandling: kbData.after_hours_call_handling,
          ehrSystem: kbData.ehr_system,
          schedulingSystem: kbData.scheduling_system,
          apiAvailability: kbData.api_availability,
          communicationChannels:
            kbData.preferred_patient_communication_channels,
        },
        documents: documentContents,
      };

      // 6. Call OpenAI to create the KB content
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const prompt = `Create a comprehensive knowledge base document in the following format based on the provided data. The document should include all relevant information from the practice launchpad, knowledge base fields, and attached documents.

Format the output as follows:
# [Practice Name] Knowledge Base

## General Information
- Website: 
- Central Scheduling Contact:
- Payors Accepted:
- Patient Portal:
- Philosophy:

## Locations, Clinic Hours & Contact Info
[Create a table with columns: Location | Address | Phone | Hours (Mon-Fri) | Hours (Sat-Sun)]

## Parking & Accessibility
[Include parking and accessibility information]

## Services and Modalities
[List all services offered with descriptions]

## Patient FAQs
[Organize FAQs by categories like General Questions, Insurance/Billing, Scheduling, Preparation, During the Exam, Safety, Results, etc.]

## Special Instructions and Policies
[Include any special policies, procedures, or important information]

Here is the data to use:
${JSON.stringify(gptPromptData, null, 2)}`;

      logger.info("Calling OpenAI to generate curated KB");

      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content:
              "You are a medical knowledge base creator. Create comprehensive, well-structured knowledge base documents for healthcare practices.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });

      const generatedContent = completion.choices[0].message.content;

      // 7. Create DOCX file
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: generatedContent.split("\n").map((line) => {
              // Handle headers
              if (line.startsWith("# ")) {
                return new Paragraph({
                  text: line.substring(2),
                  heading: HeadingLevel.HEADING_1,
                });
              } else if (line.startsWith("## ")) {
                return new Paragraph({
                  text: line.substring(3),
                  heading: HeadingLevel.HEADING_2,
                });
              } else if (line.startsWith("### ")) {
                return new Paragraph({
                  text: line.substring(4),
                  heading: HeadingLevel.HEADING_3,
                });
              } else if (line.startsWith("- ")) {
                return new Paragraph({
                  text: line.substring(2),
                  bullet: {
                    level: 0,
                  },
                });
              } else {
                return new Paragraph({
                  text: line,
                });
              }
            }),
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);

      // 8. Upload to S3
      const s3Key = `curated-knowledge-base/${workspaceId}/${uuidv4()}.docx`;
      const s3Params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        Body: buffer,
        ContentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Metadata: {
          workspaceId: workspaceId.toString(),
          createdBy: req.user.userId.toString(),
          name: name,
        },
      };

      const s3Response = await s3.upload(s3Params).promise();

      // 9. Save to curated_documents array
      const curatedDoc = {
        id: uuidv4(),
        name: name,
        description: description || null,
        url: s3Response.Location,
        s3_key: s3Key,
        source_documents: document_links,
        created_by: req.user.userId,
        created_at: new Date().toISOString(),
      };

      await db.query(
        `UPDATE knowledge_base 
         SET curated_documents = curated_documents || $2::jsonb,
             updated_by = $3,
             updated_at = NOW()
         WHERE workspace_id = $1`,
        [workspaceId, JSON.stringify(curatedDoc), req.user.userId],
      );

      logger.info("Curated KB created successfully", {
        workspaceId: workspaceId,
        curatedDocId: curatedDoc.id,
        s3Key: s3Key,
      });

      // Return all curated documents
      const result = await db.query(
        `SELECT curated_documents FROM knowledge_base WHERE workspace_id = $1`,
        [workspaceId],
      );

      res.json({
        success: true,
        data: result.rows[0]?.curated_documents || [],
      });
    } catch (error) {
      logger.error("Error creating curated KB", {
        error: error.message,
        userId: req.user.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to create curated KB",
      });
    }
  },
);

/**
 * @swagger
 * /api/v1/knowledgebase/{org_id}/delete-curated-kb:
 *   post:
 *     summary: Delete a curated knowledge base document
 *     tags: [Knowledge Base]
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
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 description: URL of the curated KB to delete
 *     responses:
 *       200:
 *         description: Curated KB deleted successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Curated KB not found
 */
router.post(
  "/:org_id/delete-curated-kb",
  jwtMiddleware,
  validateOrgAccess,
  requireFeaturePermission("knowledgebase", "write"),
  async (req, res) => {
    try {
      const workspaceId = req.workspaceId;
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: "URL is required",
        });
      }

      logger.info("Deleting curated KB", {
        workspaceId: workspaceId,
        userId: req.user.userId,
        url: url,
      });

      // Get current curated documents
      const result = await db.query(
        `SELECT curated_documents FROM knowledge_base WHERE workspace_id = $1`,
        [workspaceId],
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          success: false,
          error: "Knowledge base not found",
        });
      }

      const curatedDocuments = result.rows[0].curated_documents || [];

      // Find the curated document to delete
      const docToDelete = curatedDocuments.find((doc) => doc.url === url);

      if (!docToDelete) {
        return res.status(404).json({
          success: false,
          error: "Curated document not found",
        });
      }

      // Delete from S3
      if (docToDelete.s3_key) {
        try {
          const s3Params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: docToDelete.s3_key,
          };

          await s3.deleteObject(s3Params).promise();

          logger.info("Deleted curated KB from S3", {
            s3Key: docToDelete.s3_key,
          });
        } catch (s3Error) {
          logger.error("Error deleting from S3", {
            error: s3Error.message,
            s3Key: docToDelete.s3_key,
          });
          // Continue with database deletion even if S3 fails
        }
      }

      // Remove from curated_documents array
      const updatedCuratedDocs = curatedDocuments.filter(
        (doc) => doc.url !== url,
      );

      // Update database
      await db.query(
        `UPDATE knowledge_base 
         SET curated_documents = $2::jsonb,
             updated_by = $3,
             updated_at = NOW()
         WHERE workspace_id = $1`,
        [workspaceId, JSON.stringify(updatedCuratedDocs), req.user.userId],
      );

      logger.info("Curated KB deleted successfully", {
        workspaceId: workspaceId,
        curatedDocId: docToDelete.id,
      });

      res.json({
        success: true,
        data: updatedCuratedDocs,
      });
    } catch (error) {
      logger.error("Error deleting curated KB", {
        error: error.message,
        userId: req.user.userId,
      });

      res.status(500).json({
        success: false,
        error: "Failed to delete curated KB",
      });
    }
  },
);

module.exports = router;
