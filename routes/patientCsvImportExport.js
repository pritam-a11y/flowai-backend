const express = require("express");
const router = express.Router(); 
const logger = require("../utils/logger");
const PatientDataService = require("../helpers/patientCsvImportExport");

/**
 * @swagger
 * tags:
 *   - name: Patient Data Management
 *     description: Import and export of patient and appointment data.
 */

/**
 * @swagger
 * /api/v1/patients/export:
 *   get:
 *     summary: Export future patient and appointment records as CSV
 *     tags: [Patient Data Management]
 *     description: |
 *       Retrieves patient data with future appointments (appointment_date >= current date)
 *       and returns the result as CSV.
 *     responses:
 *       200:
 *         description: Successfully exported future patient data.
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               example: |
 *                 patient_id,first_name,last_name,...
 *       500:
 *         description: Failed to export patient data.
 */
router.get("/export", async (req, res) => {
  try {
    const csvContent = await PatientDataService.exportPatientData();
    res.header("Content-Type", "text/csv");
    res.attachment("patient_data_future.csv");
    res.send(csvContent);
  } catch (error) {
    logger.error("Error exporting patient data:", error.message);
    res
      .status(500)
      .json({ success: false, error: "Failed to export patient data." });
  }
});


/**
 * @swagger
 * /api/v1/patient/import:
 *   post:
 *     summary: Import new or updated patient data
 *     tags: [Patient Data Management]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Accepts an array of patient records for bulk upsert.
 *       Server automatically enforces `call_count = 0`.
 *       `updated_at` is automatically set by the server.
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
 *                 items:
 *                   type: object
 *                   properties:
 *                     patient_id: { type: string, example: "pat_123" }
 *                     first_name: { type: string, example: "Jane" }
 *                     last_name: { type: string, example: "Doe" }
 *                     dob: { type: string, format: date, example: "1985-05-20" }
 *                     email: { type: string, example: "jane@example.com" }
 *                     phone: { type: string, example: "555-9876" }
 *                     address_street: { type: string, example: "456 Oak Lane" }
 *                     address_city: { type: string, example: "City B" }
 *                     zip_code: { type: string, example: "10002" }
 *                     insurance_id: { type: string, example: "INS987" }
 *                     insurance_name: { type: string, example: "BlueCross" }
 *                     insurance_verified: { type: boolean, example: true }
 *                     appointment_type: { type: string, example: "follow_up" }
 *                     appointment_date: { type: string, format: date, example: "2025-12-01" }
 *                     appointment_time: { type: string, example: "14:30:00" }
 *                     appointment_location: { type: string, example: "Office A" }
 *                     call_status: { type: string, example: "booked" }
 *                     call_count:
 *                       type: integer
 *                       example: 0
 *                       description: Server will overwrite this to 0.
 *                     referring_physician_name: { type: string, example: "Dr. Smith" }
 *                     modality_name: { type: string, example: "MRI" }
 *                     procedure_name: { type: string, example: "Brain Scan" }
 *                     procedure_code: { type: string, example: "CPT70551" }
 *                     appointment_booked: { type: boolean, example: true }
 *                     precision_center: { type: string, example: "Radiology Hub" }
 *                     answer_to_screening_questions: { type: string, example: "No metal implants." }
 *                     call_config: { type: string, example: "priority_outreach" }
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-11-30T10:00:00.000Z"
 *                       description: Auto-set by server.
 *     responses:
 *       200:
 *         description: Patient data import initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Patient data import initiated successfully." }
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalRecords: { type: integer, example: 100 }
 *                     patientsImported: { type: integer, example: 100 }
 *       400:
 *         description: Invalid data format.
 *       500:
 *         description: Failed to import patient data.
 */
router.post("/import", async (req, res) => {
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

    const summary = await PatientDataService.importPatientData(csvRecords);
    res.status(200).json({
      success: true,
      message: "Patient data import initiated successfully.",
      summary,
    });
  } catch (error) {
    logger.error("Error importing patient data:", error.message);
    res
      .status(500)
      .json({ success: false, error: "Failed to import patient data." });
  }
});

module.exports = router;
