const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const axios = require("axios");

// Configuration - ideally these should be in environment variables
const ZAPIER_WEBHOOK_URL =
  process.env.ZAPIER_WEBHOOK_URL ||
  "https://hooks.zapier.com/hooks/catch/YOUR_HOOK_ID";
const WEBHOOK_TIMEOUT = parseInt(process.env.WEBHOOK_TIMEOUT) || 30000; // 30 seconds

/**
 * POST /api/v1/hamming/webhook
 *
 * Receives webhook data from Hamming service and forwards it to Zapier.
 * This endpoint acts as a middleware/proxy between Hamming and Zapier,
 * allowing for logging, transformation, and error handling.
 *
 * Authentication: None (webhook endpoint - security through obscure URL)
 * Consider adding webhook signature verification for production use
 */
router.post("/webhook", async (req, res, next) => {
  console.log(req.body);
  const startTime = Date.now();
  const requestId =
    req.headers["x-request-id"] ||
    `hamming-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Log incoming request details
    logger.info("Hamming webhook received", {
      requestId,
      headers: {
        contentType: req.headers["content-type"],
        userAgent: req.headers["user-agent"],
        xRequestId: req.headers["x-request-id"],
        xHammingSignature: req.headers["x-hamming-signature"], // If Hamming provides webhook signatures
      },
      bodySize: JSON.stringify(req.body).length,
      timestamp: new Date().toISOString(),
    });

    // Optional: Validate webhook signature from Hamming (if provided)
    // This would require a shared secret with Hamming
    const hammingSignature = req.headers["x-hamming-signature"];
    if (hammingSignature && process.env.HAMMING_WEBHOOK_SECRET) {
      const isValid = validateHammingSignature(
        req.body,
        hammingSignature,
        process.env.HAMMING_WEBHOOK_SECRET,
      );
      if (!isValid) {
        logger.warn("Invalid Hamming webhook signature", { requestId });
        return res.status(401).json({
          success: false,
          message: "Invalid webhook signature",
          requestId,
        });
      }
    }

    // Log the body for debugging (be careful with sensitive data in production)
    if (process.env.NODE_ENV === "development") {
      console.log("Hamming request body:", JSON.stringify(req.body, null, 2));
    }

    // Prepare the payload for Zapier
    // You can transform the data here if needed
    const zapierPayload = {
      source: "hamming",
      timestamp: new Date().toISOString(),
      requestId,
      data: req.body,
      // Add any additional metadata
      metadata: {
        receivedAt: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
      },
    };

    // Forward to Zapier webhook
    logger.info("Forwarding to Zapier webhook", {
      requestId,
      url: ZAPIER_WEBHOOK_URL.replace(/\/[^\/]+$/, "/***"), // Log URL without exposing the exact hook ID
    });

    const zapierResponse = await axios.post(ZAPIER_WEBHOOK_URL, zapierPayload, {
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
        "X-Source": "hamming-integration",
        "User-Agent": "Hamming-Integration/1.0",
      },
      timeout: WEBHOOK_TIMEOUT,
      validateStatus: null, // Don't throw on any status code
    });

    const processingTime = Date.now() - startTime;

    // Log Zapier response
    logger.info("Zapier webhook response received", {
      requestId,
      status: zapierResponse.status,
      processingTime,
      zapierHeaders: zapierResponse.headers,
    });

    // Handle Zapier response
    if (zapierResponse.status >= 200 && zapierResponse.status < 300) {
      // Success
      return res.status(200).json({
        success: true,
        message: "Webhook processed successfully",
        requestId,
        processingTime: `${processingTime}ms`,
        data: zapierResponse.data,
      });
    } else {
      // Zapier returned an error status
      logger.error("Zapier webhook error response", {
        requestId,
        status: zapierResponse.status,
        data: zapierResponse.data,
        processingTime,
      });

      return res.status(zapierResponse.status || 500).json({
        success: false,
        message: "Zapier responded with an error",
        requestId,
        zapier_status: zapierResponse.status,
        zapier_data: zapierResponse.data,
        processingTime: `${processingTime}ms`,
      });
    }
  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error("Error processing Hamming webhook", {
      requestId,
      error: error.message,
      stack: error.stack,
      processingTime,
      errorCode: error.code,
      errorResponse: error.response?.data,
    });

    // Distinguish between different types of errors
    if (error.response) {
      // Zapier responded but with an error (should be caught above, but just in case)
      return res.status(error.response.status || 500).json({
        success: false,
        message: "Zapier responded with an error",
        requestId,
        zapier_status: error.response.status,
        zapier_data: error.response.data,
        processingTime: `${processingTime}ms`,
      });
    } else if (error.request) {
      // Request was made but no response received (network error, timeout, etc.)
      return res.status(504).json({
        success: false,
        message: "Failed to reach Zapier webhook (network error or timeout)",
        requestId,
        error:
          error.code === "ECONNABORTED" ? "Request timeout" : "Network error",
        processingTime: `${processingTime}ms`,
      });
    } else {
      // Error in setting up the request or processing
      return res.status(500).json({
        success: false,
        message: "Failed to process webhook",
        requestId,
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
        processingTime: `${processingTime}ms`,
      });
    }
  }
});

module.exports = router;
