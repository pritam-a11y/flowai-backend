const express = require("express");
const router = express.Router();
const FormData = require("form-data");
const upload = require("../middleware/uploadMiddleware");
const PhelixService = require("../services/phelixService");
const logger = require("../utils/logger");
const authMiddleware = require("../middleware/auth");
require("dotenv").config();

/**
 * @swagger
 * tags:
 *   name: FaxAI
 *   description: Endpoints for uploading and fetching Phelix Fax-AI jobs
 */

/**
 * @swagger
 * api/v1/fax/upload:
 *   post:
 *     summary: Upload a PDF file to Phelix Fax-AI for processing
 *     tags: [FaxAI]
 *     security:
 *       - bearerAuth: []
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
 *                 description: PDF file to be uploaded (max 10MB)
 *     responses:
 *       200:
 *         description: File uploaded successfully and task created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     is_success:
 *                       type: boolean
 *                       example: true
 *                     task_id:
 *                       type: string
 *                       example: "abc123xyz"
 *                     status:
 *                       type: string
 *                       example: "queued"
 *       400:
 *         description: Missing file or invalid request
 *       401:
 *         description: Unauthorized - missing or invalid token
 *       500:
 *         description: Internal server error
 */

router.post(
  "/upload",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });
      }

      // Prepare FormData for external API
      const formData = new FormData();
      formData.append("file", req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      const data = await PhelixService.uploadFax(formData);

      logger.info("File uploaded successful", {
        status: data.is_success,
        task_id: data.task_id,
      });

      res.status(200).json({ success: true, data: data });
    } catch (error) {
      logger.error("Upload Error", {
        error: error.message,
        email: req.body.email,
      });

      res.status(500).json({
        success: false,
        error: "An error occurred during Uploading",
      });
    }
  }
);

/**
 * @swagger
 * api/v1/fax/response:
 *   get:
 *     summary: Fetch Phelix Fax-AI job result using task_id
 *     tags: [FaxAI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: task_id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique task_id returned after upload
 *     responses:
 *       200:
 *         description: Successfully retrieved Fax-AI response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "completed"
 *                     task_id:
 *                       type: string
 *                       example: "abc123xyz"
 *                     action:
 *                       type: string
 *                       example: "document_extraction"
 *                     text:
 *                       type: string
 *                       description: Extracted text/content from document
 *       400:
 *         description: Missing task_id parameter
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       404:
 *         description: Task not found
 *       500:
 *         description: Internal server error
 */
router.get("/response", authMiddleware, async (req, res) => {
  try {
    const { task_id } = req.query;
    if (!task_id) {
      return res
        .status(400)
        .json({ success: false, message: "task_id is required" });
    }
    const data = await PhelixService.getFaxResponse(task_id);

    logger.info("File fetched successful", {
      status: data.status,
      task_id: data.task_id,
      action: data.action,
    });

    return res.json({
      success: true,
      data: data,
    });
  } catch (error) {
    const status = error?.response?.status || 500;

    logger.error("Invalid task_id", {
      error: error.message,
    });

    return res.status(status).json({
      success: false,
      error: "An error occurred during fetching data",
    });
  }
});

module.exports = router;
