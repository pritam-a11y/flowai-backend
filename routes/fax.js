const express = require("express");
const router = express.Router();
const FormData = require("form-data");
const upload = require("../middleware/uploadMiddleware");
const PhelixService = require("../services/phelixService");
const logger = require("../utils/logger");
const authMiddleware = require("../middleware/auth");
require("dotenv").config();

// POST
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
        status: data.status,
        task_id: data.task_id,
        action: data.action,
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

// GET
router.get("/response", authMiddleware, async (req, res) => {
  try {
    const { task_id } = req.query;
    if (!task_id) {
      return res
        .status(400)
        .json({ success: false, message: "task_id is required" });
    }
    const data = await PhelixAPI.getFaxResponse(task_id);

    return res.json({ success: true, data: data });
  } catch (error) {
    const status = error?.response?.status || 500;

    logger.error("Invalid ID", {
      error: error.message,
    });

    return res.status(status).json({
      success: false,
      error: "An error occurred during fetching data",
    });
  }
});

module.exports = router;
