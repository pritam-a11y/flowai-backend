const express = require("express");
const router = express.Router();
const db = require("../db/connection");
const logger = require("../utils/logger");
const jwtMiddleware = require("../middleware/jwt");

// Utility to escape string for SQL LIKE comparison (optional, but good practice)
// const sanitizeInput = (str) => {
//   return str.replace(/[^\w\s]/gi, ""); // Removes special characters
// };

/**
 * @swagger
 * tags:
 *   - name: Insurance
 *     description: Insurance Verification and Configuration
 */

/**
 * @swagger
 * /api/v1/insurance/verify-insurance:
 *   post:
 *     summary: Verifies an insurance name and returns matching IDs
 *     tags: [Insurance]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Searches for matching insurance providers within an organization.
 *       - **Exact Match:** Returns the single matching ID.
 *       - **Partial/Similar Matches:** Returns a list of all close matches with their IDs.
 *       - **No Match:** Returns the ID corresponding to the 'Self Pay' option.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - org_id
 *               - insurance_name
 *             properties:
 *               org_id:
 *                 type: string
 *                 description: Organization ID to filter insurance providers.
 *                 example: org_456
 *               insurance_name:
 *                 type: string
 *                 description: The name of the insurance to verify (e.g., 'Aetna Managed Choice').
 *                 example: 'Aetna'
 *     responses:
 *       200:
 *         description: Successfully processed the verification request.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Exact match found.
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Unique ID of the matched insurance plan or 'Self Pay' ID.
 *                         example: ins_789
 *                       name:
 *                         type: string
 *                         description: Name of the insurance plan (or 'Self Pay').
 *                         example: Aetna Managed Choice PPO
 *       400:
 *         description: Missing required parameters.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "org_id and insurance_name are required in the request body."
 *       500:
 *         description: Server or database error during verification process.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to verify insurance."
 *                 details:
 *                   type: string
 *                   example: "Database query error."
 */

router.post("/verify-insurance", jwtMiddleware, async (req, res) => {
  const { org_id, insurance_name } = req.body;
 
  // --- Validate org_id ---
  if (!org_id) {
    return res.status(400).json({
      status: false,
      message: "org_id is required in the request body.",
    });
  }

  // Normalize name safely
  const normalizedInput = insurance_name?.trim()?.toLowerCase() || "";

  try {
    // --- Fetch all providers for the org ---
    const { rows: providers } = await db.query(
      `
      SELECT insurance_id, insurance_name
      FROM insurance_providers
      WHERE org_id = $1 AND insurance_name IS NOT NULL
      ORDER BY insurance_name ASC;
      `,
      [org_id]
    );

    if (!providers.length) {
      logger.warn("No insurance providers found for organization.", { org_id });
      return res.status(500).json({
        status: false,
        error: "Insurance configuration missing for organization.",
      });
    }

    // --- Identify Self Pay Option ---
    const selfPayOption = providers.find(
      (p) => p.insurance_name?.trim().toLowerCase() === "self pay"
    );

    // If insurance_name is missing or empty then directly return Self Pay
    if (!normalizedInput) {
      if (selfPayOption) {
        return res.status(200).json({
          status: true,
          message: "No insurance name provided, defaulting to Self Pay.",
          data: [
            {
              id: selfPayOption.insurance_id,
              name: selfPayOption.insurance_name,
            },
          ],
        });
      } else {
        return res.status(500).json({
          status: false,
          error: "Critical configuration error: 'Self Pay' option not defined.",
        });
      }
    }

    // --- Matching Logic ---
    let exactMatch = null;
    const similarMatches = [];

    for (const provider of providers) {
      const providerName = provider.insurance_name?.trim()?.toLowerCase();
      if (!providerName) continue;

      if (providerName === normalizedInput) {
        exactMatch = {
          id: provider.insurance_id,
          name: provider.insurance_name,
        };
        break;
      }

      if (
        providerName.includes(normalizedInput) ||
        normalizedInput.includes(providerName)
      ) {
        if (providerName !== "self pay") {
          similarMatches.push({
            id: provider.insurance_id,
            name: provider.insurance_name,
          });
        }
      }
    }

    // --- Response logic ---
    if (exactMatch) {
      return res.status(200).json({
        status: true,
        message: "Exact match found.",
        data: [exactMatch],
      });
    }

    if (similarMatches.length > 0) {
      return res.status(200).json({
        status: true,
        message: `${similarMatches.length} similar matches found.`,
        data: similarMatches,
      });
    }

    if (selfPayOption) {
      return res.status(200).json({
        status: true,
        message: "No match found, falling back to Self Pay.",
        data: [
          {
            id: selfPayOption.insurance_id,
            name: selfPayOption.insurance_name,
          },
        ],
      });
    }

    logger.error("Missing mandatory 'Self Pay' configuration.", { org_id });
    return res.status(500).json({
      status: false,
      error: "Critical configuration error: 'Self Pay' option not defined.",
    });
  } catch (error) {
    logger.error("Failed to verify insurance.", {
      org_id,
      insurance_name,
      error: error.message,
    });
    return res.status(500).json({
      status: false,
      error: "Failed to verify insurance.",
      details: error.message,
    });
  }
});

module.exports = router;