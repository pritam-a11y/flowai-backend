const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth"); 
const AuthService = require("../services/authService");
const logger = require("../utils/logger");
const db = require("../db/connection");
const { Resend } = require("resend");
const callIdStorage = require("../utils/callIdStorage");
const axios = require("axios");
const LocationSorter = require("../utils/locationSorter");

router.post("/trigger-zap", authMiddleware, async (req, res, next) => {
  try {
    // Forward the body exactly as received
    const zapierUrl =
      process.env.ZAPIER_HOOK_URL ||
      "https://hooks.zapier.com/hooks/catch/24583493/umd3a4g/";

    const zapierResp = await axios.post(zapierUrl, req.body, {
      // Ensure JSON; Zapier is happy with this
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-By": "flowai-backend", // optional, helpful for tracing
      },
      timeout: 10000, // 10s safety timeout
      validateStatus: () => true, // let us pass through Zapier's status
    });

    // Return Zapier’s status & body to caller for visibility
    return res.status(zapierResp.status).json({
      success: zapierResp.status >= 200 && zapierResp.status < 300,
      zapier_status: zapierResp.status,
      zapier_data: zapierResp.data,
    });
  } catch (error) {
    logger.error("Error triggering Zapier hook", {
      error: error.message,
      stack: error.stack,
    });

    // Distinguish axios/network errors
    if (error.response) {
      return res.status(error.response.status || 500).json({
        success: false,
        message: "Zapier responded with an error",
        zapier_status: error.response.status,
        zapier_data: error.response.data,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to call Zapier webhook",
    });
  }
});

module.exports = router;
