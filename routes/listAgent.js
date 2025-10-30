const express = require("express");
const router = express.Router();
const db = require("../db/connection");
const logger = require("../utils/logger");
const jwtMiddleware = require("../middleware/jwt");

/**
 * @swagger
 * tags:
 *   - name: List Agent
 *     description: Agent list endpoints
 */

/**
 * @swagger
 * /api/v1/list-agent:
 *   post:
 *     summary: Retrieve a list of unique agent names for an organization
 *     tags: [List Agent]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Queries the 'calls' table to fetch a unique, non-null list of agent names
 *       associated with the provided 'org_id'. This is typically used to populate
 *       dropdown filters on a dashboard.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - org_id
 *             properties:
 *               org_id:
 *                 type: string
 *                 description: The Organization ID to filter the agent list by.
 *                 example: org_123
 *     responses:
 *       200:
 *         description: Successfully retrieved the list of unique agent names.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       agent_name:
 *                         type: string
 *                         description: Unique name of an agent.
 *                         example: Agent Smith
 *         examples:
 *           application/json:
 *             value:
 *               status: true
 *               data:
 *                 - agent_name: Agent Smith
 *                 - agent_name: Agent Johnson
 *                 - agent_name: Sales Bot
 *       400:
 *         description: Missing or invalid org_id in the request body.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "org_id is required in the request body."
 *       500:
 *         description: Failed to retrieve data due to a server or database error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to retrieve unique agent names."
 *                 details:
 *                   type: string
 *                   example: "Database query error."
 */
router.post("/", jwtMiddleware, async (req, res) => {
  const { org_id } = req.body;

  //  Manditory org_id in req.body
  if (!org_id) {
    logger.error("org_id required!.");

    return res.status(400).json({
      success: false,
      message: "org_id is required in the request body.",
    });
  }

  // Select distinct agent_name from 'calls' table
  // Filter by org_id and ensure agent_name is not null/empty
  const uniqueAgentsQuery = `
        SELECT DISTINCT TRIM(agent_name) AS agent_name
        FROM calls
        WHERE org_id = $1
        AND agent_name IS NOT NULL
        AND TRIM(agent_name) != ''
        ORDER BY agent_name ASC;
    `;

  try {
    const result = await db.query(uniqueAgentsQuery, [org_id]);

    // No Data Found --------
    if (result.rows.length === 0) {
      logger.info("No unique agents found for organization.", {
        org_id: org_id,
      });
      return res.status(200).json({
        status: true,
        message: "No agents found for this organization ID.",
        data: [],
      });
    }

    return res.status(200).json({
      status: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error("Error retrieving unique agent list.", {
      org_id,
      error: error.message,
    });
    return res.status(500).json({
      error: "Failed to retrieve unique agent names.",
      details: error.message,
    });
  }
});

module.exports = router;
