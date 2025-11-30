const express = require("express");
const router = express.Router();
const jwtMiddleware = require("../middleware/jwt");
const logger = require("../utils/logger");
const SlotDataService = require("../helpers/slotsCsvImportExport");

/**
 * @swagger
 * tags:
 *   - name: Slot Data Management
 *     description: Import of appointment slot inventory data.
 */

/**
 * @swagger
 * /api/v1/slots/import:
 *   post:
 *     summary: Import new or updated appointment slot data
 *     tags: [Slot Data Management]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Accepts an array of slot records for bulk upsert into the slot inventory.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - records
 *             properties:
 *               records:
 *                 type: array
 *                 description: Array of slot objects.
 *                 items:
 *                   type: object
 *                   properties:
 *                     slot_id: { type: string, example: "slot_123" }
 *                     start_time: { type: string, format: date-time, example: "2025-12-25T09:00:00.000Z" }
 *                     end_time: { type: string, format: date-time, example: "2025-12-25T09:30:00.000Z" }
 *                     day_of_week: { type: string, example: "Wednesday" }
 *                     service_type: { type: string, example: "General Checkup" }
 *                     status: { type: string, example: "available" }
 *                     location: { type: string, example: "Gate Parkway" }
 *                     time_period: { type: string, example: "morning" }
 *     responses:
 *       200:
 *         description: Slot data import initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Slot data import initiated successfully." }
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalRecords: { type: integer, example: 100 }
 *                     slotsImported: { type: integer, example: 100 }
 *       400:
 *         description: Invalid data format.
 */
router.post("/import", jwtMiddleware, async (req, res) => {
  try {
    const csvRecords = req.body.records;

    if (!Array.isArray(csvRecords)) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Invalid data format. Expected 'records' array in body.",
        });
    }

    const summary = await SlotDataService.importSlotData(csvRecords);
    res.status(200).json({
      success: true,
      message: "Slot data import initiated successfully.",
      summary,
    });
  } catch (error) {
    logger.error("Error importing slot data:", error.message);
    res
      .status(500)
      .json({ success: false, error: "Failed to import slot data." });
  }
});

module.exports = router;
