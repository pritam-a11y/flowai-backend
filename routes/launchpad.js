const express = require("express");
const router = express.Router();
const jwtMiddleware = require("../middleware/jwt");
const logger = require("../utils/logger");

/**
 * @swagger
 * tags:
 *   name: Launchpad
 *   description: Practice launchpad configuration endpoints
 */

/**
 * @swagger
 * /api/v1/launchpad/fetch-data:
 *   post:
 *     summary: Fetch launchpad configuration data
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workspaceId:
 *                 type: integer
 *                 description: Optional workspace ID (uses user's default if not provided)
 *     responses:
 *       200:
 *         description: Launchpad configuration data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 */
router.post("/fetch-data", jwtMiddleware, async (req, res) => {
  try {
    const { workspaceId } = req.body;
    const userWorkspaceId = workspaceId || req.user.workspaceId;

    logger.info("Fetching launchpad data", {
      workspaceId: userWorkspaceId,
      userId: req.user.userId,
    });

    // Hardcoded launchpad data
    const launchpadData = {
      basicInfo: {
        primaryPracticeName: "Ead Urology Associates",
        alternativeNames: ["Ead Urology", "Dr. Daniel Ead Urology Clinic"],
      },
      locations: [
        {
          id: 1,
          name: "Main Office - Plantation",
          address: {
            street: "1216 N University Dr",
            city: "Plantation",
            state: "FL",
            zipCode: "33322",
            country: "US",
          },
          phone: "(954) 472-4072",
          fax: "(954) 472-4073",
          email: "info@eadurology.com",
          isMainLocation: true,
        },
        {
          id: 2,
          name: "Satellite Office - Fort Lauderdale",
          address: {
            street: "2600 E Commercial Blvd",
            city: "Fort Lauderdale",
            state: "FL",
            zipCode: "33308",
            country: "US",
          },
          phone: "(954) 555-0123",
          fax: "(954) 555-0124",
          email: "ftl@eadurology.com",
          isMainLocation: false,
        },
      ],
      providers: [
        {
          id: 1,
          firstName: "Daniel",
          lastName: "Ead",
          title: "MD",
          specialty: "Urology",
          npiNumber: "1234567890",
          languages: ["English", "Spanish"],
          clinicLocations: [1, 2],
          acceptingNewPatients: true,
          bio: "Dr. Daniel Ead is a board-certified urologist with over 20 years of experience.",
        },
        {
          id: 2,
          firstName: "Sarah",
          lastName: "Johnson",
          title: "PA-C",
          specialty: "Physician Assistant",
          npiNumber: "0987654321",
          languages: ["English"],
          clinicLocations: [1],
          acceptingNewPatients: true,
          bio: "Sarah Johnson is a certified physician assistant specializing in urological care.",
        },
      ],
      hours: {
        regularHours: {
          monday: { open: "08:00", close: "17:00", isOpen: true },
          tuesday: { open: "08:00", close: "17:00", isOpen: true },
          wednesday: { open: "08:00", close: "17:00", isOpen: true },
          thursday: { open: "08:00", close: "17:00", isOpen: true },
          friday: { open: "08:00", close: "16:00", isOpen: true },
          saturday: { open: "09:00", close: "13:00", isOpen: true },
          sunday: { open: "", close: "", isOpen: false },
        },
        schedulingHoursDifferent: true,
        schedulingHours: {
          monday: { open: "08:30", close: "16:30", isOpen: true },
          tuesday: { open: "08:30", close: "16:30", isOpen: true },
          wednesday: { open: "08:30", close: "16:30", isOpen: true },
          thursday: { open: "08:30", close: "16:30", isOpen: true },
          friday: { open: "08:30", close: "15:30", isOpen: true },
          saturday: { open: "09:00", close: "12:00", isOpen: true },
          sunday: { open: "", close: "", isOpen: false },
        },
        holidaysAndClosures: [
          {
            date: "2025-01-01",
            name: "New Year's Day",
            type: "holiday",
          },
          {
            date: "2025-07-04",
            name: "Independence Day",
            type: "holiday",
          },
          {
            date: "2025-12-25",
            name: "Christmas Day",
            type: "holiday",
          },
        ],
        emergencyInstructions:
          "For medical emergencies, call 911 or go to the nearest emergency room. For urgent matters after hours, call our answering service at (954) 472-4072 and follow the prompts.",
        afterHoursInstructions:
          "Our office is closed. For non-emergency questions, please leave a voicemail and we will return your call the next business day. For urgent matters, press 1 to reach our on-call physician.",
      },
      languages: [
        { code: "en", name: "English", isDefault: true },
        { code: "es", name: "Spanish", isDefault: false },
        { code: "pt", name: "Portuguese", isDefault: false },
      ],
      insurance: {
        acceptedPlans: [
          "Medicare",
          "Medicaid",
          "Blue Cross Blue Shield",
          "Aetna",
          "Cigna",
          "United Healthcare",
          "Humana",
        ],
        selfPayAccepted: true,
        paymentMethods: [
          "Cash",
          "Check",
          "Credit Card",
          "Debit Card",
          "HSA/FSA",
        ],
      },
      services: [
        "General Urology",
        "Kidney Stones",
        "Prostate Health",
        "Men's Health",
        "Urinary Incontinence",
        "Bladder Health",
        "Cancer Screening",
        "Minimally Invasive Surgery",
      ],
      practiceSettings: {
        appointmentDuration: 30, // minutes
        bufferTime: 5, // minutes between appointments
        allowOnlineScheduling: true,
        requireReferral: false,
        newPatientFormsUrl: "https://eadurology.com/new-patient-forms",
        telemedAvailable: true,
        wheelchairAccessible: true,
        parkingAvailable: true,
        publicTransportNearby: true,
      },
      metadata: {
        lastUpdated: new Date().toISOString(),
        completionStatus: {
          basicInfo: true,
          locations: true,
          providers: true,
          hours: true,
          overall: 100, // percentage
        },
        workspaceId: userWorkspaceId,
      },
    };

    res.json({
      success: true,
      data: launchpadData,
    });
  } catch (error) {
    logger.error("Error fetching launchpad data", {
      error: error.message,
      userId: req.user.userId,
    });
    res.status(500).json({
      success: false,
      error: "Failed to fetch launchpad data",
    });
  }
});

/**
 * @swagger
 * /api/v1/launchpad/save-configuration:
 *   post:
 *     summary: Save launchpad configuration
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               section:
 *                 type: string
 *                 enum: [basicInfo, locations, providers, hours]
 *                 description: Section being saved
 *               data:
 *                 type: object
 *                 description: Section data to save
 *     responses:
 *       200:
 *         description: Configuration saved successfully
 */
router.post("/save-configuration", jwtMiddleware, async (req, res) => {
  try {
    const { section, data } = req.body;

    logger.info("Saving launchpad configuration", {
      section,
      userId: req.user.userId,
      workspaceId: req.user.workspaceId,
    });

    // TODO: In a real implementation, save this to database
    // For now, just return success

    res.json({
      success: true,
      message: `${section} configuration saved successfully`,
      savedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error saving launchpad configuration", {
      error: error.message,
      userId: req.user.userId,
    });
    res.status(500).json({
      success: false,
      error: "Failed to save configuration",
    });
  }
});

/**
 * @swagger
 * /api/v1/launchpad/save-draft:
 *   post:
 *     summary: Save launchpad configuration as draft
 *     tags: [Launchpad]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               section:
 *                 type: string
 *                 enum: [basicInfo, locations, providers, hours]
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Draft saved successfully
 */
router.post("/save-draft", jwtMiddleware, async (req, res) => {
  try {
    const { section, data } = req.body;

    logger.info("Saving launchpad draft", {
      section,
      userId: req.user.userId,
      workspaceId: req.user.workspaceId,
    });

    // TODO: In a real implementation, save this as draft in database

    res.json({
      success: true,
      message: `${section} draft saved successfully`,
      draftId: `draft_${Date.now()}`,
      savedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error saving launchpad draft", {
      error: error.message,
      userId: req.user.userId,
    });
    res.status(500).json({
      success: false,
      error: "Failed to save draft",
    });
  }
});

module.exports = router;
