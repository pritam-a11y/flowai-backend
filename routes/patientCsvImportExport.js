const express = require('express');
const router = express.Router();
const jwtMiddleware = require('../middleware/jwt'); 
const logger = require('../utils/logger');
const PatientDataService = require('../helpers/patientCsvImportExport');

/**
 * @swagger
 * tags:
 *   - name: Patient Data Management
 *     description: Import and export of patient and appointment data.
 */

/**
 * @swagger
 * /api/v1/patient-data/export:
 *   get:
 *     summary: Export future patient and appointment records as CSV
 *     tags: [Patient Data Management]
 *     description: |
 *       Retrieves patient data and their future appointments (appointment_date >= current date)
 *       from the database and returns it in CSV format.
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
        res.header('Content-Type', 'text/csv');
        res.attachment('patient_data_future.csv');
        res.send(csvContent);
    } catch (error) {
        logger.error('Error exporting patient data:', error.message);
        res.status(500).json({ success: false, error: 'Failed to export patient data.' });
    }
});

/**
 * @swagger
 * /api/v1/patient-data/import:
 *   post:
 *     summary: Import new or updated patient data
 *     tags: [Patient Data Management]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Accepts an array of patient records for bulk upsert.
 *       The server automatically enforces `call_count = 0` for all imported records.
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
 *                 description: Array of patient objects.
 *                 items:
 *                   type: object
 *                   properties:
 *                     patient_id: { type: string, example: "pat_123" }
 *                     first_name: { type: string, example: "Jane" }
 *                     last_name: { type: string, example: "Doe" }
 *                     dob: { type: string, format: date, example: "1985-05-20" }
 *                     email: { type: string, example: "jane@example.com" }
 *                     phone: { type: string, example: "555-9876" }
 *                     address_street: { type: string, example: "456 Oak Ln" }
 *                     address_city: { type: string, example: "City B" }
 *                     zip_code: { type: string, example: "10002" }
 *                     insurance_id: { type: string, example: "INS987" }
 *                     insurance_name: { type: string, example: "BlueCross" }
 *                     insurance_verified: { type: boolean, example: true }
 *                     appointment_type: { type: string, example: "follow_up" }
 *                     appointment_date: { type: string, format: date, example: "2025-12-01" }
 *                     appointment_time: { type: string, format: time, example: "14:30:00" }
 *                     appointment_location: { type: string, example: "Office A" }
 *                     appointment_status: { type: string, example: "booked" }
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
 */
router.post("/import", jwtMiddleware, async (req, res) => {
    try {
        const csvRecords = req.body.records;
        
        if (!Array.isArray(csvRecords)) {
            return res.status(400).json({ success: false, error: "Invalid data format. Expected 'records' array in body." });
        }
        
        const summary = await PatientDataService.importPatientData(csvRecords);
        res.status(200).json({ 
            success: true, 
            message: "Patient data import initiated successfully.", 
            summary 
        });
    } catch (error) {
        logger.error('Error importing patient data:', error.message);
        res.status(500).json({ success: false, error: 'Failed to import patient data.' });
    }
});

module.exports = router;