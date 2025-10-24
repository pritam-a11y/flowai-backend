const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const RedoxTransformer = require("../utils/redoxTransformer");
const RedoxAPIService = require("../services/redoxApiService");
const AuthService = require("../services/authService");
const logger = require("../utils/logger");
const db = require("../db/connection");
const { Resend } = require("resend");
const callIdStorage = require("../utils/callIdStorage");
const axios = require("axios");
const LocationSorter = require("../utils/locationSorter");
const { createOfflineIntakeRequest } = require("../utils/offlineIntakeRequest");
const {
  getProviderConfig,
  getDefaultProviderConfig,
} = require("../config/providers");

const authService = new AuthService();

// Initialize Resend with API key
const resend = new Resend("re_DXtS219b_C9LEPwDvBsy2ZMmEKZGh8yYx");

/**
 * @swagger
 * /api/v1/retell/webhook:
 *   post:
 *     summary: Handle Retell webhook events (call inbound)
 *     tags: [Retell Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               call_inbound:
 *                 type: object
 *                 properties:
 *                   from_number:
 *                     type: string
 *                     description: Caller's phone number
 *                     example: "+18330165712"
 *     responses:
 *       200:
 *         description: Patient and appointment data for call
 */
router.post("/webhook", async (req, res, next) => {
  try {
    // Log complete webhook request body
    logger.info("=== RETELL WEBHOOK RECEIVED ===", {
      requestBody: JSON.stringify(req.body, null, 2),
      headers: req.headers,
      timestamp: new Date().toISOString(),
    });

    const { call_inbound } = req.body;

    if (!call_inbound || !call_inbound.from_number) {
      logger.warn(
        "Retell webhook failed: missing call_inbound or from_number",
        {
          receivedBody: req.body,
        }
      );
      return res.status(400).json({
        success: false,
        error: "Missing call_inbound.from_number in request",
      });
    }

    const { from_number } = call_inbound;
    logger.info("Retell webhook - call inbound processed", {
      from_number,
      call_inbound: call_inbound,
    });

    // Get access token
    const accessToken = await authService.getAccessToken();

    // Search for patient by phone number
    const patientSearchParams =
      RedoxTransformer.createPatientSearchParams(from_number);
    const patientResponse = await RedoxAPIService.makeRequest(
      "POST",
      "/Patient/_search",
      null,
      patientSearchParams,
      accessToken
    );

    // Transform patient response
    const patients =
      RedoxTransformer.transformPatientSearchResponse(patientResponse);

    let appointments = [];
    let patientData = null;

    if (patients.length > 0) {
      patientData = {
        ...patients[0],
        accessToken: accessToken,
      };

      // Search for appointments using patient ID
      const appointmentSearchParams =
        RedoxTransformer.createAppointmentSearchParams(patients[0].patientId);
      const appointmentResponse = await RedoxAPIService.makeRequest(
        "POST",
        "/Appointment/_search",
        null,
        appointmentSearchParams,
        accessToken
      );

      // Transform appointment response
      appointments =
        RedoxTransformer.transformAppointmentSearchResponse(
          appointmentResponse
        );
    }

    // Prepare response for Retell inbound call webhook format (all values must be strings)
    const dynamicVariables = {
      caller_phone: from_number,
      patient_found: patients.length > 0 ? "true" : "false",
      access_token: accessToken,
    };

    // Add individual patient details as separate dynamic variables (all as strings)
    if (patientData) {
      dynamicVariables.patient_id = patientData.patientId || "";
      dynamicVariables.patient_name = patientData.fullName || "";
      dynamicVariables.patient_phone = patientData.phone || "";
      dynamicVariables.patient_email = patientData.email || "";
      dynamicVariables.patient_dob = patientData.dateOfBirth || "";
      dynamicVariables.patient_zip = patientData.zipCode || "";
      dynamicVariables.patient_address = patientData.address || "";
      dynamicVariables.patient_insurance_name = patientData.insuranceName || "";
      dynamicVariables.insurance_type = patientData.insuranceType || "";
      dynamicVariables.patient_insurance_member_id =
        patientData.insuranceMemberId || "";
    }

    // Add appointment details as separate dynamic variables (all as strings)
    if (appointments.length > 0) {
      const appointment = appointments[0];
      dynamicVariables.patient_appointment_id = appointment.appointmentId || "";
      dynamicVariables.patient_appointment_type =
        appointment.appointmentType || "";
      dynamicVariables.appointment_start = appointment.startTime || "";
      dynamicVariables.patient_appointment_status = appointment.status || "";
      dynamicVariables.appointment_description = appointment.description || "";
    }

    const retellResponse = {
      call_inbound: {
        dynamic_variables: dynamicVariables,
        metadata: {
          success: true,
          timestamp: new Date().toISOString(),
        },
      },
    };

    logger.info("Retell webhook completed", {
      patientFound: patients.length > 0,
      appointmentFound: appointments.length > 0,
    });

    // Log complete webhook response
    logger.info("=== RETELL WEBHOOK RESPONSE ===", {
      responseBody: JSON.stringify(retellResponse, null, 2),
      timestamp: new Date().toISOString(),
    });

    res.json(retellResponse);
  } catch (error) {
    logger.error("Retell webhook error", { error: error.message });
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/retell/function-call:
 *   post:
 *     summary: Handle Retell function calls
 *     tags: [Retell Function Calls]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               call:
 *                 type: object
 *                 properties:
 *                   access_token:
 *                     type: string
 *                     description: Access token from call context
 *               name:
 *                 type: string
 *                 enum: [check_availability, book_appointment, update_appointment, create_patient, find_patient, sort_locations, search_physician, get_physicians_by_specialty]
 *                 description: Function name
 *               args:
 *                 type: object
 *                 description: Function arguments (may include access_token)
 *                 properties:
 *                   access_token:
 *                     type: string
 *                     description: Access token (can be in args or call context)
 *                   birth_date:
 *                     type: string
 *                     description: Patient's date of birth (for find_patient)
 *                   given:
 *                     type: string
 *                     description: Patient's first name (for find_patient)
 *                   family:
 *                     type: string
 *                     description: Patient's last name (for find_patient)
 *                   zipcode:
 *                     type: string
 *                     description: Patient's zipcode - optional (for find_patient)
 *                   phone:
 *                     type: string
 *                     description: Patient's phone number - optional (for find_patient)
 *                   address:
 *                     type: string
 *                     description: Full address string (for sort_locations and get_physicians_by_specialty)
 *                   appointmentType:
 *                     type: string
 *                     description: Type of appointment (for sort_locations)
 *                   provider:
 *                     type: string
 *                     description: Provider identifier - precision or uchicago (for sort_locations)
 *                   specialty:
 *                     type: string
 *                     description: Physician specialty (e.g., CARDIOLOGY, ONCOLOGY) - required for search_physician and get_physicians_by_specialty
 *                   firstName:
 *                     type: string
 *                     description: Physician first name - optional for search_physician
 *     responses:
 *       200:
 *         description: Function call result
 */
router.post("/function-call", async (req, res, next) => {
  try {
    // Log function call request body (excluding transcript and transcript_object for cleaner logs)
    const logBody = {
      ...req.body,
      call: req.body.call
        ? {
            ...req.body.call,
            transcript: req.body.call.transcript
              ? "[TRANSCRIPT OMITTED]"
              : undefined,
            transcript_object: req.body.call.transcript_object
              ? "[TRANSCRIPT OBJECT OMITTED]"
              : undefined,
            transcript_with_tool_calls: req.body.call.transcript_with_tool_calls
              ? "[TRANSCRIPT WITH TOOL CALLS OMITTED]"
              : undefined,
          }
        : undefined,
    };

    logger.info("=== RETELL FUNCTION CALL RECEIVED ===", {
      requestBody: JSON.stringify(logBody, null, 2),
      headers: req.headers,
      timestamp: new Date().toISOString(),
    });

    const { call, name, args } = req.body;

    logger.info("Retell function call processed", {
      functionName: name,
      hasArgs: !!args,
      hasCall: !!call,
      args: args,
      call: call
        ? {
            ...call,
            transcript: call.transcript ? "[TRANSCRIPT OMITTED]" : undefined,
            transcript_object: call.transcript_object
              ? "[TRANSCRIPT OBJECT OMITTED]"
              : undefined,
            transcript_with_tool_calls: req.body.call.transcript_with_tool_calls
              ? "[TRANSCRIPT WITH TOOL CALLS OMITTED]"
              : undefined,
          }
        : undefined,
    });

    if (!name || !args) {
      logger.warn("Retell function call failed: missing name or args", {
        receivedBody: req.body,
      });
      return res.status(400).json({
        success: false,
        error: "Missing required fields: name and args",
      });
    }

    // Get access token from args only, otherwise generate new one
    const accessToken =
      args?.access_token || (await authService.getAccessToken());

    let result;

    switch (name) {
      case "check_availability":
        logger.info("Processing check_availability function call");

        // Extract slot search parameters from args
        const { location, serviceType, startTime, stat = false } = args;

        // Override location to Orlando Neuro Clinic
        const overriddenLocation = "Orlando Neuro Clinic";

        logger.info("Overriding location for check_availability", {
          originalLocation: location,
          overriddenLocation: overriddenLocation,
          statEnabled: stat,
        });

        const slotSearchParams = RedoxTransformer.createSlotSearchParams(
          overriddenLocation,
          serviceType,
          startTime
        );
        const slotResponse = await RedoxAPIService.makeRequest(
          "POST",
          "/Slot/_search",
          null,
          slotSearchParams,
          accessToken
        );

        // If stat is enabled, fetch existing appointments to count bookings
        if (stat) {
          logger.info(
            "STAT mode enabled - fetching existing appointments for capacity tracking"
          );

          // Get date range for appointment search
          const searchStartDate = startTime || new Date().toISOString();
          const searchEndDate = new Date(searchStartDate);
          searchEndDate.setDate(searchEndDate.getDate() + 30);

          // Fetch existing appointments to count bookings
          const appointmentParams = {
            date: `ge${searchStartDate}`,
            _sort: "date",
            _count: "100",
          };

          const appointmentResponse = await RedoxAPIService.makeRequest(
            "POST",
            "/Appointment/_search",
            null,
            appointmentParams,
            accessToken
          );

          // Extract appointments with timing info
          let existingAppointments = [];
          if (appointmentResponse && appointmentResponse.entry) {
            existingAppointments = appointmentResponse.entry
              .filter(
                (e) => e.resource && e.resource.resourceType === "Appointment"
              )
              .map((e) => ({
                id: e.resource.id,
                start: e.resource.start,
                end: e.resource.end,
                status: e.resource.status,
              }));
          }

          // Use the enhanced transformer with stat support
          result = await RedoxTransformer.transformSlotSearchResponseWithStat(
            slotResponse,
            stat,
            existingAppointments
          );

          logger.info(
            `STAT mode: Found ${result.length} available slots with capacity`
          );
        } else {
          // Normal mode - only show free slots
          result = RedoxTransformer.transformSlotSearchResponse(slotResponse);
        }
        break;

      case "book_appointment":
        logger.info("Processing book_appointment function call");

        // Extract appointment creation parameters from args
        const {
          patientId,
          slotId,
          appointmentType,
          startTime: apptStart,
          endTime,
          status,
          stat: bookStat = false,
        } = args;

        // Only patientId is required according to Redox (for participant reference)
        if (!patientId) {
          return res.status(400).json({
            success: false,
            error: "Missing required field for appointment booking: patientId",
          });
        }

        // If stat mode is enabled, check current booking count before booking
        if (bookStat && apptStart && endTime) {
          logger.info(
            "STAT mode enabled for booking - checking current capacity"
          );

          // Fetch existing appointments for this time slot
          const appointmentParams = {
            date: apptStart,
            _count: "10",
          };

          const appointmentResponse = await RedoxAPIService.makeRequest(
            "POST",
            "/Appointment/_search",
            null,
            appointmentParams,
            accessToken
          );

          // Count bookings for this exact time slot
          let bookingCount = 0;
          if (appointmentResponse && appointmentResponse.entry) {
            bookingCount = appointmentResponse.entry.filter(
              (e) =>
                e.resource &&
                e.resource.resourceType === "Appointment" &&
                e.resource.start === apptStart &&
                e.resource.end === endTime
            ).length;
          }

          // Check if we've reached capacity (3 bookings)
          if (bookingCount >= 3) {
            logger.warn(`STAT booking rejected - slot at capacity`, {
              timeSlot: `${apptStart} - ${endTime}`,
              currentBookings: bookingCount,
              maxCapacity: 3,
            });

            return res.json({
              success: false,
              error: `This time slot has reached maximum capacity (3 bookings). Please select a different time.`,
              capacity: {
                current: bookingCount,
                maximum: 3,
              },
            });
          }

          logger.info(`STAT booking allowed - slot has capacity`, {
            timeSlot: `${apptStart} - ${endTime}`,
            currentBookings: bookingCount,
            availableCapacity: 3 - bookingCount,
          });
        }

        const appointmentBundle = RedoxTransformer.createAppointmentBundle(
          patientId,
          appointmentType,
          apptStart,
          endTime,
          status
        );

        const createResponse = await RedoxAPIService.makeRequest(
          "POST",
          "/Appointment/$appointment-create",
          appointmentBundle,
          null,
          accessToken
        );

        result =
          RedoxTransformer.transformAppointmentCreateResponse(createResponse);
        break;

      case "update_appointment":
        logger.info("Processing update_appointment function call");

        // Extract appointment update parameters from args
        const {
          appointmentId,
          patientId: updatePatientId,
          appointmentType: updateType,
          startTime: updateStart,
          endTime: updateEnd,
          status: updateStatus,
        } = args;

        // Only appointmentId and patientId are required for update
        if (!appointmentId || !updatePatientId) {
          return res.status(400).json({
            success: false,
            error:
              "Missing required fields for appointment update: appointmentId, patientId",
          });
        }

        const updateBundle = RedoxTransformer.createAppointmentUpdateBundle(
          appointmentId,
          updatePatientId,
          updateType,
          updateStart,
          updateEnd,
          updateStatus
        );

        const updateResponse = await RedoxAPIService.makeRequest(
          "POST",
          "/Appointment/$appointment-update",
          updateBundle,
          null,
          accessToken
        );

        result =
          RedoxTransformer.transformAppointmentCreateResponse(updateResponse);
        break;

      case "create_patient":
        logger.info("Processing create_patient function call");

        // Extract patient creation parameters from args
        const {
          first_name,
          last_name,
          phone: patientPhone,
          email: patientEmail,
          dob,
          address: patientAddress,
          city: patientCity,
          state: patientState,
          zip_code,
          insurance_name,
          insurance_member_id,
        } = args;

        // Validate required fields
        if (!first_name || !last_name) {
          return res.status(400).json({
            success: false,
            error:
              "Missing required fields for patient creation: first_name, last_name",
          });
        }

        const patientData = {
          firstName: first_name,
          lastName: last_name,
          phone: patientPhone,
          email: patientEmail,
          birthDate: dob,
          address: patientAddress,
          city: patientCity,
          state: patientState,
          zipCode: zip_code,
          insuranceName: insurance_name,
          insuranceMemberId: insurance_member_id,
        };

        const patientBundle = RedoxTransformer.createPatientBundle(patientData);

        const patientCreateResponse = await RedoxAPIService.makeRequest(
          "POST",
          "/Patient/$patient-create",
          patientBundle,
          null,
          accessToken
        );

        // Transform the response to extract patient ID
        const createResult =
          RedoxTransformer.transformAppointmentCreateResponse(
            patientCreateResponse
          );

        // Return the patient ID as the result
        result = {
          success: createResult.success,
          patientId: createResult.generatedId || null,
          statusCode: createResult.statusCode,
          error: createResult.error || null,
        };
        break;

      case "find_patient": {
        logger.info("Processing find_patient function call");

        // Extract patient search parameters from args
        const { birth_date, given, family, zipcode, phone } = args;

        // Validate required fields
        if (!birth_date || !given || !family) {
          logger.warn("find_patient failed: missing required fields", {
            birth_date,
            given,
            family,
            zipcode,
            phone,
          });
          return res.status(400).json({
            success: false,
            error:
              "Missing required fields: birth_date, given, and family are required",
          });
        }

        // Create search parameters with optional zipcode and phone
        const searchParams =
          RedoxTransformer.createPatientSearchByDobNameParams(
            birth_date,
            given,
            family,
            phone,
            zipcode
          );

        // Execute patient search through Redox API
        const searchResponse = await RedoxAPIService.makeRequest(
          "POST",
          "/Patient/_search",
          null,
          searchParams,
          accessToken
        );

        // Check if patient found
        if (
          !searchResponse ||
          !searchResponse.entry ||
          searchResponse.entry.length === 0
        ) {
          logger.info("No patient found", {
            birth_date,
            given,
            family,
          });

          result = {
            success: true,
            patient_found: false,
            total_matches: 0,
            patients: [],
          };
          break;
        }

        // Get all patient IDs from the search response
        const patientEntries = searchResponse.entry.filter(
          (entry) => entry.resource && entry.resource.resourceType === "Patient"
        );

        // Fetch appointments for all patients
        const appointmentResponsesMap = {};

        for (const patientEntry of patientEntries) {
          const patientId = patientEntry.resource?.id;

          if (patientId) {
            try {
              const appointmentSearchParams =
                RedoxTransformer.createAppointmentSearchParams(patientId);
              const appointmentResponse = await RedoxAPIService.makeRequest(
                "POST",
                "/Appointment/_search",
                null,
                appointmentSearchParams,
                accessToken
              );
              appointmentResponsesMap[patientId] = appointmentResponse;
            } catch (appointmentError) {
              logger.warn("Failed to fetch appointments for patient", {
                error: appointmentError.message,
                patientId,
              });
              // Continue even if appointment fetch fails for one patient
              appointmentResponsesMap[patientId] = null;
            }
          }
        }

        // Transform all patients with their appointment data
        const patientsData =
          RedoxTransformer.transformAllPatientsWithAppointments(
            searchResponse,
            appointmentResponsesMap
          );

        logger.info("Patient search by DOB and name completed", {
          totalMatches: patientsData.length,
          birth_date,
          given,
          family,
          zipcode: zipcode || null,
          phone: phone || null,
        });

        // Return the patient data
        result = {
          success: true,
          patient_found: patientsData.length > 0,
          total_matches: patientsData.length,
          patients: patientsData,
        };
        break;
      }

      case "sort_locations": {
        logger.info("Processing sort_locations function call");

        // Extract parameters from args
        const { address, appointmentType, provider } = args;

        // Validate required fields
        if (!address || !appointmentType || !provider) {
          logger.warn("sort_locations failed: missing required fields", {
            address,
            appointmentType,
            provider,
          });
          return res.status(400).json({
            success: false,
            error:
              "Missing required fields: address, appointmentType, and provider are required",
          });
        }

        // Use LocationSorter to get sorted locations (now async)
        const sortResult = await LocationSorter.sortLocationsByDistance(
          address,
          appointmentType,
          provider
        );

        if (!sortResult.success) {
          logger.info("sort_locations - no locations found", {
            address,
            appointmentType,
            provider,
            error: sortResult.error,
          });

          result = sortResult.error;
        } else {
          logger.info("sort_locations completed successfully", {
            address,
            appointmentType,
            provider,
            locationsFound: Object.keys(sortResult.result).length,
          });

          result = sortResult.result;
        }
        break;
      }

      case "search_physician": {
        logger.info("Processing search_physician function call");

        // Extract parameters from args
        const { specialty, firstName, address } = args;

        // Validate required fields
        if (!specialty) {
          logger.warn("search_physician failed: missing required specialty", {
            specialty,
            firstName,
            address,
          });
          return res.status(400).json({
            success: false,
            error: "Missing required field: specialty is required",
          });
        }

        // Import physician search service
        const physicianSearchService = require("../services/physicianSearchService");

        // Search for physicians
        const searchResult = await physicianSearchService.searchPhysicians(
          specialty,
          firstName || null,
          address || null
        );

        logger.info("search_physician completed", {
          specialty,
          firstName,
          hasAddress: !!address,
          physiciansFound: searchResult.physicians.length,
        });

        result = searchResult;
        break;
      }

      case "get_physicians_by_specialty": {
        logger.info("Processing get_physicians_by_specialty function call");

        // Extract specialty and address from args
        const { specialty, address } = args;

        // Validate required field
        if (!specialty) {
          logger.warn(
            "get_physicians_by_specialty failed: missing required specialty",
            {
              specialty,
            }
          );
          return res.status(400).json({
            success: false,
            error: "Missing required field: specialty is required",
          });
        }

        // Import physician search service
        const physicianSearchService = require("../services/physicianSearchService");

        // Get all physicians by specialty with optional address for distance sorting
        const searchResult =
          await physicianSearchService.getPhysiciansBySpecialty(
            specialty,
            address || null
          );

        logger.info("get_physicians_by_specialty completed", {
          specialty,
          hasAddress: !!address,
          success: searchResult.success,
          physiciansFound: searchResult.physicians.length,
        });

        result = searchResult;
        break;
      }

      case "find_physicians_by_symptoms": {
        logger.info("Processing find_physicians_by_symptoms function call");

        // Extract parameters from args
        const { address, symptom_text } = args;

        // Validate required fields
        if (!address || !symptom_text) {
          logger.warn(
            "find_physicians_by_symptoms failed: missing required fields",
            {
              address,
              symptom_text,
            }
          );
          return res.status(400).json({
            success: false,
            error:
              "Missing required fields: address and symptom_text are required",
          });
        }

        // Import symptom physician matcher service
        const symptomPhysicianMatcher = require("../services/symptomPhysicianMatcher");

        // Find physicians by symptoms
        const searchResult =
          await symptomPhysicianMatcher.findPhysiciansBySymptoms(
            address,
            symptom_text
          );

        logger.info("find_physicians_by_symptoms completed", {
          symptomTextLength: symptom_text.length,
          hasAddress: !!address,
          success: searchResult.success,
          physiciansFound: searchResult.physicians?.length || 0,
          matchedExpertise: searchResult.matchedExpertise || null,
        });

        result = searchResult;
        break;
      }

      default:
        logger.warn("Unsupported function call received", {
          functionName: name,
        });
        return res.status(400).json({
          success: false,
          error: `Unsupported function: ${name}`,
        });
    }

    const functionResponse = {
      success: true,
      function: name,
      result: result,
    };

    logger.info("Retell function call completed", { functionName: name });

    // Log complete function call response
    logger.info("=== RETELL FUNCTION CALL RESPONSE ===", {
      responseBody: JSON.stringify(functionResponse, null, 2),
      timestamp: new Date().toISOString(),
    });

    res.json(functionResponse);
  } catch (error) {
    logger.error("Retell function call error", {
      error: error.message,
      functionName: req.body?.name || "unknown",
    });
    next(error);
  }
});

// Add this endpoint to your existing retellWebhook.js file, after the existing endpoints

/**
 * @swagger
 * /api/v1/retell/call/update:
 *   post:
 *     summary: Handle Retell call updates (stores data only for 'call_analyzed' events)
 *     tags: [Retell Call Updates]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event
 *               - call
 *             properties:
 *               event:
 *                 type: string
 *                 description: The event type (only 'call_analyzed' events are stored in DB)
 *                 example: "call_analyzed"
 *               call:
 *                 type: object
 *                 description: Retell call data object
 *     responses:
 *       200:
 *         description: Call update processed successfully
 *       400:
 *         description: Invalid request - missing required fields
 *       500:
 *         description: Internal server error
 */
router.post("/call/update", async (req, res, next) => {
  try {
    console.log("hit");
    const { event, call } = req.body;

    if (!call || !call.call_id) {
      logger.error("Invalid call", {
        error: "Invalid call: missing call data or call_id.",
      });
      return res
        .status(400)
        .json({ error: "Invalid call: missing call data or call_id." });
    }

    try {
      if (event === "call_analyzed") {
        // --- Data Extraction ---
        const data = {
          // Dates and IDs
          date: call.start_timestamp, // Millisecond timestamp
          call_id: call.call_id,
          org_id: 3,
          // body: 

          // Duration
          total_duration_seconds: call.call_cost?.total_duration_seconds,

          // Agent and Call Info
          agent_id: call.agent_id,
          agent_name: call.agent_name,
          direction: call.direction,
          call_type: call.call_type,
          disconnection_reason: call.disconnection_reason,

          // Analysis Results
          call_successful: call.call_analysis?.call_successful,
          user_sentiment: call.call_analysis?.user_sentiment,
          in_voicemail: call.call_analysis?.in_voicemail,

          // JSONB Fields
          custom_analysis_data: call.call_analysis?.custom_analysis_data,
          retell_llm_dynamic_variables: call.retell_llm_dynamic_variables,

          // Latencies (P50)
          latency_e2e_p50: call.latency?.e2e?.p50,
          latency_llm_p50: call.latency?.llm?.p50,
          latency_tts_p50: call.latency?.tts?.p50,
          latency_stt_p50: call.latency?.stt?.p50 || null,

          // Latencies (P99)
          latency_e2e_p99: call.latency?.e2e?.p99,
          latency_llm_p99: call.latency?.llm?.p99,
          latency_tts_p99: call.latency?.tts?.p99,
          latency_stt_p99: call.latency?.stt?.p99 || null,
        };

        // --- Database Insertion ---
        const insertQuery = `
          INSERT INTO calls (
              date, call_id, org_id, total_duration_seconds, 
              agent_id, agent_name, direction, call_type, disconnection_reason, 
              call_successful, user_sentiment, in_voicemail, 
              custom_analysis_data, retell_llm_dynamic_variables,
              latency_e2e_p50, latency_e2e_p99, latency_llm_p50, latency_llm_p99, 
              latency_tts_p50, latency_tts_p99, latency_stt_p50, latency_stt_p99
          ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 
              $15, $16, $17, $18, $19, $20, $21, $22
          )
          ON CONFLICT (call_id) DO NOTHING;  
      `;

        const values = [
          data.date,
          data.call_id,
          data.org_id,
          data.total_duration_seconds,
          data.agent_id,
          data.agent_name,
          data.direction,
          data.call_type,
          data.disconnection_reason,
          data.call_successful,
          data.user_sentiment,
          data.in_voicemail,
          data.custom_analysis_data,
          data.retell_llm_dynamic_variables,
          data.latency_e2e_p50,
          data.latency_e2e_p99,
          data.latency_llm_p50,
          data.latency_llm_p99,
          data.latency_tts_p50,
          data.latency_tts_p99,
          data.latency_stt_p50,
          data.latency_stt_p99,
        ];

        await db.query(insertQuery, values);

        logger.info("Data inserted successfully!", {
          call_id: data.call_id,
          agent_id: data.agent_id,
        });

        //-----Hamming-------------

        const hammingPayload = {
          provider: "retell",
          metadata: {
            agent_name: call.agent_id || "Unknown Agent",
          },
          payload: req.body,
          externalAgentId: call.agent_id,
        };

        axios
          .post(
            "https://app.hamming.ai/api/rest/v2/call-logs",
            hammingPayload,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer sk-5e183fff2b1c44430892aade02e62496",
              },
              timeout: 10000,
            }
          )
          .then((response) => {
            logger.info("Successfully sent call data to Hamming", {
              call_id: call.call_id,
              hamming_response_status: response.status,
            });
          })
          .catch((hammingError) => {
            logger.error("Failed to send call data to Hamming", {
              error: hammingError.message,
              call_id: call.call_id,
              status: hammingError.response?.status,
              response_data: hammingError.response?.data,
            });
          });

        logger.info("Hamming API call initiated", {
          call_id: call.call_id,
          agent_id: call.agent_id,
        });
      }
    } catch (hammingError) {
      // Log error but don't fail the request
      logger.error("Error preparing Hamming payload", {
        error: hammingError.message,
        call_id: call.call_id,
      });
    }

    console.log("hit2");

    // Only process if event is 'call_analyzed'
    if (event !== "call_analyzed") {
      return res.json({
        success: true,
        message: `Event ${event} acknowledged but not stored`,
      });
    }

    console.log("hit3");

    if (!call || !call.call_id) {
      return res.status(400).json({
        success: false,
        error: "Missing call data or call_id",
      });
    }

    console.log("hit4");

    // Send confirmation email if patient email is available and send_email is true (non-blocking)
    try {
      console.log("in send email");
      const recepientEmail =
        call.call_analysis?.custom_analysis_data?.patient_email;
      const sendEmail = call.call_analysis?.custom_analysis_data?.send_email;

      if (recepientEmail && sendEmail === true) {
        // Get provider configuration
        const providerName =
          call.call_analysis?.custom_analysis_data?.provider_name;
        const providerConfig =
          getProviderConfig(providerName) || getDefaultProviderConfig();

        logger.info("Email provider config selected", {
          call_id: call.call_id,
          provider_name: providerName,
          selected_provider: providerConfig.provider_id,
        });

        // Try to generate intake form URL
        let intakeFormUrl = null;
        try {
          // Extract patient_id, org_id, and specialty from dynamic variables
          const patientId =
            call.retell_llm_dynamic_variables?.patient_id ||
            call.collected_dynamic_variables?.patient_id;

          const orgId =
            call.retell_llm_dynamic_variables?.org_id ||
            call.collected_dynamic_variables?.org_id;

          const specialty =
            call.retell_llm_dynamic_variables?.specialty ||
            call.collected_dynamic_variables?.specialty ||
            "urology"; // Default specialty

          if (patientId && orgId) {
            logger.info("Creating intake form for email", {
              call_id: call.call_id,
              patient_id: patientId,
              org_id: orgId,
              specialty: specialty,
            });

            const intakeResult = await createOfflineIntakeRequest(
              db,
              patientId,
              orgId,
              specialty
            );

            if (intakeResult?.data?.intakeFormUrl) {
              intakeFormUrl = intakeResult.data.intakeFormUrl;
              logger.info("Intake form URL created for email", {
                call_id: call.call_id,
                intake_url: intakeFormUrl,
              });
            } else if (intakeResult?.tinyUrl) {
              // Fallback for backward compatibility
              intakeFormUrl = intakeResult.tinyUrl;
              logger.info("Intake form URL created for email", {
                call_id: call.call_id,
                intake_url: intakeFormUrl,
              });
            }
          } else {
            logger.info("Missing required data for intake form", {
              call_id: call.call_id,
              has_patient_id: !!patientId,
              has_org_id: !!orgId,
            });
          }
        } catch (intakeError) {
          // Silently log and continue without intake form
          logger.warn("Failed to create intake form URL", {
            call_id: call.call_id,
            error: intakeError.message,
          });
        }

        // Check for physician name and find profile URL if available
        const physicianName =
          call.call_analysis?.custom_analysis_data?.physician_name;
        let physicianProfileUrl = null;
        let physicianDisplayName = null;

        if (physicianName) {
          try {
            // Import physician data
            const physiciansData = require("../config/physiciansData.json");

            // Search for physician by name (case-insensitive)
            const normalizedPhysicianName = physicianName.trim().toLowerCase();

            // Try to find exact match first
            const physician = physiciansData.physicians.find(
              (p) =>
                p.name.toLowerCase() === normalizedPhysicianName ||
                `dr. ${p.firstName.toLowerCase()} ${p.lastName.toLowerCase()}` ===
                  normalizedPhysicianName ||
                `${p.firstName.toLowerCase()} ${p.lastName.toLowerCase()}` ===
                  normalizedPhysicianName
            );

            if (physician) {
              physicianProfileUrl = physician.profileUrl;
              physicianDisplayName = physician.name;
              logger.info("Physician profile found for email", {
                call_id: call.call_id,
                physician_name: physicianName,
                profile_url: physicianProfileUrl,
              });
            } else {
              logger.info("Physician profile not found for email", {
                call_id: call.call_id,
                physician_name: physicianName,
              });
              physicianDisplayName = physicianName; // Use the provided name as-is
            }
          } catch (error) {
            logger.warn("Error searching for physician profile", {
              call_id: call.call_id,
              physician_name: physicianName,
              error: error.message,
            });
            physicianDisplayName = physicianName; // Use the provided name as-is
          }
        }

        const data = {
          patient_first_name:
            call.call_analysis?.custom_analysis_data?.patient_first_name ||
            "Patient",
          date_str: call.call_analysis?.custom_analysis_data?.appointment_date,
          time_str: call.call_analysis?.custom_analysis_data?.appointment_time,
          appointment_department:
            call.call_analysis?.custom_analysis_data?.appointment_department,
          appointment_location:
            call.call_analysis?.custom_analysis_data?.appointment_location,
          physician_name: physicianDisplayName,
          physician_profile_url: physicianProfileUrl,
          intake_form_url: intakeFormUrl,
          provider_name: providerConfig.name,
          business_name: providerConfig.business_name,
          doctor_name: providerConfig.doctor_name,
          office_phone: providerConfig.office_phone,
          logo_url: providerConfig.logo_url,
          default_location: providerConfig.default_location,
        };

        const subject = `Appointment Confirmation — ${providerConfig.name}`;
        const html = renderAppointmentConfirmationHTML(data);

        const emailData = {
          from: providerConfig.from_email,
          to: recepientEmail,
          subject: subject,
          html: html,
        };

        // Send email using Resend (non-blocking)
        const resp = resend.emails.send(emailData).catch((emailError) => {
          logger.error("Failed to send confirmation email", {
            error: emailError.message,
            recipient: recepientEmail,
            call_id: call.call_id,
            provider: providerConfig.provider_id,
          });
        });

        console.log("Email has been sent");
        console.log(resp);
      }
    } catch (emailError) {
      // Log error but don't fail the request
      logger.error("Error processing confirmation email", {
        error: emailError.message,
        call_id: call.call_id,
      });
    }

    try {
      // Start a transaction to ensure data consistency
      await db.query("BEGIN");

      // 1. Check if this call_id already exists using in-memory storage (idempotency check)
      if (callIdStorage.hasBeenProcessed(call.call_id)) {
        await db.query("ROLLBACK");
        logger.info("Call already processed", { call_id: call.call_id });
        return res.json({
          success: true,
          message: "Call already processed",
          call_id: call.call_id,
        });
      }

      // Mark call as processed in memory
      callIdStorage.markAsProcessed(call.call_id);

      // 2. Insert into calls table
      // const insertCallQuery = `
      //   INSERT INTO calls (call_id, body)
      //   VALUES ($1, $2)
      // `;
      // await db.query(insertCallQuery, [call.call_id, JSON.stringify(req.body)]);

      // 3. Get current agent analytics
      const agentResult = await db.query(
        "SELECT * FROM agents WHERE agent_id = $1",
        [call.agent_id]
      );

      // if (agentResult.rows.length === 0) {
      //   // If agent doesn't exist, create it with initial values
      //   const insertAgentQuery = `
      //     INSERT INTO agents (
      //       agent_id,
      //       user_id,
      //       type,
      //       status,
      //       total_calls,
      //       disconnection_reason,
      //       average_latency,
      //       user_sentiment,
      //       call_successful
      //     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      //   `;

      //   // Initialize JSON objects for tracking
      //   const disconnectionReason = { [call.disconnection_reason]: 1 };
      //   const userSentiment = { [call.call_analysis.user_sentiment]: 1 };
      //   const callSuccessful = { [String(call.call_analysis.call_successful)]: 1 };

      //   // Calculate initial average latency (using p50 values)
      //   const avgLatency = (call.latency.llm.p50 + call.latency.tts.p50) / 2;

      //   await db.query(insertAgentQuery, [
      //     call.agent_id,
      //     'xyz', // Default user_id
      //     'scheduling', // Default type
      //     'active', // Default status
      //     1, // total_calls
      //     JSON.stringify(disconnectionReason),
      //     avgLatency,
      //     JSON.stringify(userSentiment),
      //     JSON.stringify(callSuccessful)
      //   ]);
      // } else {
      //   // Update existing agent analytics
      //   const agent = agentResult.rows[0];

      //   // 4a. Increment total_calls
      //   const newTotalCalls = (agent.total_calls || 0) + 1;

      //   // 4b. Update disconnection_reason JSON
      //   let disconnectionReasonData = {};
      //   try {
      //     disconnectionReasonData = agent.disconnection_reason || {};
      //   } catch (e) {
      //     disconnectionReasonData = {};
      //   }
      //   disconnectionReasonData[call.disconnection_reason] = (disconnectionReasonData[call.disconnection_reason] || 0) + 1;

      //   // 4c. Recalculate average latency
      //   const currentAvgLatency = agent.average_latency || 0;
      //   const currentTotalCalls = agent.total_calls || 0;
      //   const newLatency = (call.latency.llm.p50 + call.latency.tts.p50) / 2;
      //   const newAvgLatency = ((currentAvgLatency * currentTotalCalls) + newLatency) / newTotalCalls;

      //   // 4d. Update user_sentiment JSON
      //   let userSentimentData = {};
      //   try {
      //     userSentimentData = agent.user_sentiment || {};
      //   } catch (e) {
      //     userSentimentData = {};
      //   }
      //   userSentimentData[call.call_analysis.user_sentiment] = (userSentimentData[call.call_analysis.user_sentiment] || 0) + 1;

      //   // 4e. Update call_successful JSON
      //   let callSuccessfulData = {};
      //   try {
      //     callSuccessfulData = agent.call_successful || {};
      //   } catch (e) {
      //     callSuccessfulData = {};
      //   }
      //   const successKey = String(call.call_analysis.call_successful);
      //   callSuccessfulData[successKey] = (callSuccessfulData[successKey] || 0) + 1;

      //   // Update the agent record
      //   const updateAgentQuery = `
      //     UPDATE agents
      //     SET
      //       total_calls = $2,
      //       disconnection_reason = $3,
      //       average_latency = $4,
      //       user_sentiment = $5,
      //       call_successful = $6,
      //       updated_at = CURRENT_TIMESTAMP
      //     WHERE agent_id = $1
      //   `;

      //   await db.query(updateAgentQuery, [
      //     call.agent_id,
      //     newTotalCalls,
      //     JSON.stringify(disconnectionReasonData),
      //     newAvgLatency,
      //     JSON.stringify(userSentimentData),
      //     JSON.stringify(callSuccessfulData)
      //   ]);
      // }

      // 3. Check if patient intake details exist in custom_analysis_data
      if (
        call.call_analysis?.custom_analysis_data?.patient_intake_details &&
        call.retell_llm_dynamic_variables?.patient_id
      ) {
        const patientIntakeDetails =
          call.call_analysis.custom_analysis_data.patient_intake_details;
        const patientId = call.retell_llm_dynamic_variables.patient_id;

        // Skip if intake details is empty or just whitespace
        if (
          !patientIntakeDetails ||
          typeof patientIntakeDetails !== "string" ||
          !patientIntakeDetails.trim()
        ) {
          logger.info(
            "Skipping DocumentReference creation - patient intake details is empty",
            {
              call_id: call.call_id,
              patient_id: patientId,
            }
          );
        } else {
          // Create DocumentReference
          try {
            const accessToken =
              call.retell_llm_dynamic_variables?.access_token ||
              (await authService.getAccessToken());

            // Ensure the text has proper formatting (normalize newlines)
            const formattedIntakeDetails = patientIntakeDetails
              .replace(/\r\n/g, "\n") // Convert Windows newlines
              .replace(/\r/g, "\n") // Convert old Mac newlines
              .trim(); // Remove leading/trailing whitespace

            // Log details for comparison with Swagger flow
            logger.info("=== RETELL DOCUMENT CREATION DEBUG ===", {
              call_id: call.call_id,
              patient_id: patientId,
              content_type: typeof formattedIntakeDetails,
              content_length: formattedIntakeDetails.length,
              content_preview: formattedIntakeDetails.substring(0, 100),
              has_access_token: !!accessToken,
              access_token_source: call.retell_llm_dynamic_variables
                ?.access_token
                ? "retell_variables"
                : "auth_service",
              metadata: {
                callId: call.call_id,
                agentId: call.agent_id,
                callTimestamp: new Date(call.start_timestamp).toISOString(),
              },
            });

            const documentBundle =
              RedoxTransformer.createDocumentReferenceBundle(
                patientId,
                formattedIntakeDetails,
                {
                  callId: call.call_id,
                  agentId: call.agent_id,
                  callTimestamp: new Date(call.start_timestamp).toISOString(),
                }
              );

            logger.info("=== RETELL BUNDLE STRUCTURE ===", {
              call_id: call.call_id,
              bundle_type: documentBundle.resourceType,
              bundle_entries: documentBundle.entry?.length,
              message_header_id: documentBundle.entry?.[0]?.resource?.id,
              document_id: documentBundle.entry?.[1]?.resource?.id,
              bundle_json: JSON.stringify(documentBundle, null, 2),
            });

            const documentResponse = await RedoxAPIService.makeRequest(
              "POST",
              "/DocumentReference/$documentreference-create",
              documentBundle,
              null,
              accessToken
            );

            const documentResult =
              RedoxTransformer.transformAppointmentCreateResponse(
                documentResponse
              );

            logger.info("DocumentReference created for patient intake", {
              call_id: call.call_id,
              patient_id: patientId,
              document_id: documentResult.generatedId,
              success: documentResult.success,
            });
          } catch (docError) {
            logger.error("Error creating DocumentReference", {
              call_id: call.call_id,
              patient_id: patientId,
              error: docError.message,
            });
            // Continue processing even if document creation fails
          }
        }
      }

      // 4. Check for transfer attempts and scheduled callbacks
      const isTransferAttempted =
        call.call_analysis?.custom_analysis_data?.is_transfer_attempted;
      const scheduledCallbackTime =
        call.call_analysis?.custom_analysis_data?.scheduled_callback_time;
      const patientId = call.retell_llm_dynamic_variables?.patient_id;

      console.log("isTransferAttempted", isTransferAttempted);
      console.log("scheduledCallbackTime", scheduledCallbackTime);
      console.log("patientId", patientId);

      if (scheduledCallbackTime && patientId) {
        // Determine agent callback number based on call direction
        // For inbound calls: agent number is to_number (agent received the call)
        // For outbound calls: agent number is from_number (agent made the call)
        let agentCallbackNumber;
        if (call.direction === "inbound") {
          agentCallbackNumber = call.to_number;
        } else if (call.direction === "outbound") {
          agentCallbackNumber = call.from_number;
        }

        if (!agentCallbackNumber) {
          logger.warn(
            "Cannot determine agent callback number - skipping callback processing",
            {
              call_id: call.call_id,
              direction: call.direction,
              to_number: call.to_number,
              from_number: call.from_number,
            }
          );
        } else {
          logger.info("Processing callback request", {
            call_id: call.call_id,
            is_transfer_attempted: isTransferAttempted,
            scheduled_callback_time: scheduledCallbackTime,
            call_direction: call.direction,
            agent_callback_number: agentCallbackNumber,
            patient_id: patientId,
          });

          if (isTransferAttempted === "true" || isTransferAttempted === true) {
            // Create DocumentReference for transfer attempt
            try {
              const accessToken =
                call.retell_llm_dynamic_variables?.access_token ||
                (await authService.getAccessToken());

              const transferMessage = `Patient requested callback from human agent at ${scheduledCallbackTime}`;

              const documentBundle =
                RedoxTransformer.createDocumentReferenceBundle(
                  patientId,
                  transferMessage,
                  {
                    callId: call.call_id,
                    agentId: call.agent_id,
                    callTimestamp: new Date(call.start_timestamp).toISOString(),
                    transferAttempted: true,
                    scheduledCallbackTime: scheduledCallbackTime,
                  }
                );

              const documentResponse = await RedoxAPIService.makeRequest(
                "POST",
                "/DocumentReference/$documentreference-create",
                documentBundle,
                null,
                accessToken
              );

              const documentResult =
                RedoxTransformer.transformAppointmentCreateResponse(
                  documentResponse
                );

              logger.info("DocumentReference created for transfer attempt", {
                call_id: call.call_id,
                patient_id: patientId,
                document_id: documentResult.generatedId,
                scheduled_callback_time: scheduledCallbackTime,
              });
            } catch (docError) {
              logger.error(
                "Error creating DocumentReference for transfer attempt",
                {
                  call_id: call.call_id,
                  patient_id: patientId,
                  error: docError.message,
                }
              );
            }
          } else {
            // is_transfer_attempted is false, store in scheduled_callbacks table
            try {
              const insertCallbackQuery = `
                INSERT INTO scheduled_callbacks (
                  patient_id,
                  agent_callback_number,
                  scheduled_time,
                  status
                ) VALUES ($1, $2, $3, 'pending')
              `;

              await db.query(insertCallbackQuery, [
                patientId,
                agentCallbackNumber,
                scheduledCallbackTime,
              ]);

              logger.info("Scheduled callback stored in database", {
                call_id: call.call_id,
                patient_id: patientId,
                agent_callback_number: agentCallbackNumber,
                scheduled_time: scheduledCallbackTime,
              });
            } catch (dbError) {
              logger.error("Error storing scheduled callback", {
                call_id: call.call_id,
                patient_id: patientId,
                error: dbError.message,
              });
            }
          }
        }
      }

      // Commit the transaction
      await db.query("COMMIT");

      logger.info("Call analyzed event processed successfully", {
        call_id: call.call_id,
        agent_id: call.agent_id,
        disconnection_reason: call.disconnection_reason,
        user_sentiment: call.call_analysis.user_sentiment,
        call_successful: call.call_analysis.call_successful,
      });

      res.json({
        success: true,
        message: "Call analyzed event processed successfully",
        call_id: call.call_id,
        agent_id: call.agent_id,
      });
    } catch (dbError) {
      await db.query("ROLLBACK");
      logger.error("Database error processing call update", {
        call_id: call.call_id,
        error: dbError.message,
        stack: dbError.stack,
      });

      return res.status(500).json({
        success: false,
        error: "Failed to process call data",
        details: dbError.message,
      });
    }
  } catch (error) {
    logger.error("Call update endpoint error", {
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/retell/trigger-intake-call:
 *   post:
 *     summary: Trigger an intake call for a patient
 *     tags: [Retell Outbound Calls]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *             properties:
 *               patientId:
 *                 type: string
 *                 description: Redox patient ID
 *                 example: "65bee8d7-fee9-4e60-b9d6-1ae276b075b4"
 *     responses:
 *       200:
 *         description: Call triggered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     callId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     message:
 *                       type: string
 *                     patientId:
 *                       type: string
 *       400:
 *         description: Bad request - missing patient ID
 *       404:
 *         description: Patient not found
 *       500:
 *         description: Internal server error
 */

function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderAppointmentConfirmationHTML(d) {
  // Handle location display
  const locationDisplay = d.appointment_location
    ? escapeHTML(d.appointment_location)
    : "To be confirmed";

  // Create Google Maps URL if location is provided
  const mapUrl = d.appointment_location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        d.appointment_location
      )}`
    : null;

  return `
<!doctype html>
<html>
  <head>
    <meta http-equiv="x-ua-compatible" content="ie=edge">
    <meta name="viewport" content="width=device-width">
    <meta charset="utf-8">
    <title>Appointment Confirmation</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f7fb;">
      <tr>
        <td align="center" style="padding:24px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6eaf2;">
            <tr>
              <td style="padding:24px 24px 8px 24px;text-align:left;">
                ${
                  d.logo_url
                    ? `<img src="${d.logo_url}" alt="${escapeHTML(
                        d.provider_name
                      )}" style="display:block;max-width:160px;height:auto;margin-bottom:12px;">`
                    : ""
                }
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;">
                  <div style="font-size:14px;">Hi ${escapeHTML(
                    d.patient_first_name
                  )},</div>
                  <div style="margin-top:8px;">Thanks for scheduling with ${escapeHTML(
                    d.provider_name
                  )}. Your appointment is confirmed.</div>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:8px 24px 0 24px;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-weight:700;color:#111827;">Appointment Confirmation</div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;padding:2px 0;">• <strong>Date &amp; Time:</strong> ${escapeHTML(
                      d.date_str
                    )} at ${escapeHTML(
    d.time_str
  )}. Please arrive 10–15 minutes early.</td>
                  </tr>
                  ${
                    d.appointment_department && d.appointment_department.trim()
                      ? `
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;padding:2px 0;">• <strong>Department:</strong> ${escapeHTML(
                      d.appointment_department
                    )}</td>
                  </tr>`
                      : ""
                  }
                  ${
                    d.physician_name && d.physician_name.trim()
                      ? `
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;padding:2px 0;">• <strong>Physician:</strong> ${
                      d.physician_profile_url
                        ? `<a href="${escapeHTML(
                            d.physician_profile_url
                          )}" target="_blank" style="color:#2563eb;text-decoration:underline;">${escapeHTML(
                            d.physician_name
                          )}</a>`
                        : escapeHTML(d.physician_name)
                    }</td>
                  </tr>`
                      : ""
                  }
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;padding:2px 0;">
                      • <strong>Location:</strong> ${locationDisplay}
                      ${
                        mapUrl
                          ? `<br>&nbsp;&nbsp;<a href="${mapUrl}" target="_blank" style="color:#2563eb;text-decoration:underline;font-size:13px;">📍 View on Google Maps</a>`
                          : ""
                      }
                    </td>
                  </tr>
                  ${
                    d.intake_form_url
                      ? `
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;padding:2px 0;">• <strong>Intake Form:</strong> <a href="${escapeHTML(
                      d.intake_form_url
                    )}" target="_blank" style="color:#2563eb;text-decoration:underline;">Complete your intake form online</a></td>
                  </tr>`
                      : ""
                  }
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 24px 0 24px;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-weight:700;color:#111827;">Before You Arrive</div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;padding:2px 0;">
                      • <strong>Please Note:</strong> You will receive a ~10-minute Intake Call 24–48 hours before the appointment. Please make time for this call so you don't have to wait when you arrive.
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;padding:2px 0;">
                      • <strong>Please Bring:</strong> Photo ID, insurance card(s), payment method for copay, referral/order (if applicable), medication list, and prior records/imaging (if any).
                    </td>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;padding:2px 0;">
                      • If you need language or accessibility support, please call ${escapeHTML(
                        d.office_phone
                      )}. We're glad to help.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 24px 0 24px;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-weight:700;color:#111827;">Appointment Preparation Instructions</div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">
                  <tr>
                  </tr>
                  <tr>
                    <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;padding:2px 0;">
                      • If your clinician advised changes to medicines or diet, please follow their guidance.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:16px 24px 0 24px;">
                <div style="font-family:Arial,Helvetica,sans-serif;font-weight:700;color:#111827;">Appointment Changes or Questions</div>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;margin-top:8px;">
                  • To reschedule or cancel, please call ${escapeHTML(
                    d.office_phone
                  )}.<br>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="vertical-align:top;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;">We look forward to seeing you soon.</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;margin-top:16px;">
                        Best Regards,<br><br>
                        <strong>${escapeHTML(d.doctor_name)}</strong><br>
                        ${escapeHTML(d.business_name)}<br>
                        ${
                          d.appointment_location
                            ? escapeHTML(d.appointment_location)
                            : d.default_location
                            ? escapeHTML(d.default_location)
                            : ""
                        }<br>
                        T: ${escapeHTML(d.office_phone)}
                      </div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b7280;margin-top:16px;line-height:1.4;">
                        This message may include protected health information meant only for ${escapeHTML(
                          d.patient_first_name
                        )}. 
                        If you received it in error, please delete and call ${escapeHTML(
                          d.office_phone
                        )}.
                      </div>
                    </td>
                    <td style="vertical-align:bottom;text-align:right;padding-left:20px;">
                      ${
                        d.bottom_right_image_url
                          ? `<img src="${d.bottom_right_image_url}" alt="${
                              d.bottom_right_image_alt || "Footer Image"
                            }" style="display:block;max-width:150px;max-height:150px;width:auto;height:auto;">`
                          : ""
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

router.post("/trigger-intake-call", authMiddleware, async (req, res, next) => {
  try {
    const retellService = require("../services/retellService");
    const { patientId } = req.body;

    if (!patientId) {
      logger.warn("Trigger intake call failed: missing patientId");
      return res.status(400).json({
        success: false,
        error: "Patient ID is required",
      });
    }

    logger.info("Triggering intake call", { patientId });

    // Get access token
    const accessToken = await authService.getAccessToken();

    // Get patient details from Redox
    logger.info("Fetching patient details from Redox", { patientId });

    const patientResponse = await RedoxAPIService.makeRequest(
      "GET",
      `/Patient/${patientId}`,
      null,
      null,
      accessToken
    );

    if (!patientResponse || !patientResponse.id) {
      logger.error("Patient not found in Redox", { patientId });
      return res.status(404).json({
        success: false,
        error: "Patient not found",
      });
    }

    // Transform patient data
    const patientData = RedoxTransformer.transformPatientSearchResponse({
      entry: [{ resource: patientResponse }],
    })[0];

    if (!patientData.phone) {
      logger.error("Cannot trigger intake call - no phone number found", {
        patientId,
        patientName: patientData.fullName,
      });
      return res.status(400).json({
        success: false,
        error: "Patient phone number is required for outbound call",
      });
    }

    // Search for appointments
    let appointments = [];
    try {
      const appointmentSearchParams =
        RedoxTransformer.createAppointmentSearchParams(patientId);
      const appointmentResponse = await RedoxAPIService.makeRequest(
        "POST",
        "/Appointment/_search",
        null,
        appointmentSearchParams,
        accessToken
      );
      appointments =
        RedoxTransformer.transformAppointmentSearchResponse(
          appointmentResponse
        );
    } catch (appointmentError) {
      logger.warn("Failed to fetch appointments for intake call", {
        error: appointmentError.message,
        patientId,
      });
    }

    // Get the most recent appointment
    const appointment = appointments.length > 0 ? appointments[0] : null;

    // Prepare dynamic variables for the intake agent
    const dynamicVariables = {
      // Call context
      call_type: "intake",
      access_token: accessToken,

      // Patient details
      patient_id: patientId,
      patient_name: patientData.fullName || "",
      patient_phone: patientData.phone || "",
      patient_email: patientData.email || "",
      patient_dob: patientData.dateOfBirth || "",
      patient_zip: patientData.zipCode || "",
      patient_address: patientData.address || "",
      patient_insurance_name: patientData.insuranceName || "",
      insurance_type: patientData.insuranceType || "",
      patient_insurance_member_id: patientData.insuranceMemberId || "",

      // Appointment details if available
      patient_appointment_id: appointment?.appointmentId || "",
      patient_appointment_type: appointment?.appointmentType || "",
      appointment_start: appointment?.startTime || "",
      patient_appointment_status: appointment?.status || "",
      appointment_description: appointment?.description || "",
    };

    // Use the new intake-specific method
    const callResponse = await retellService.createIntakeCall(
      patientData.phone,
      dynamicVariables
    );

    logger.info("Intake call created successfully", {
      callId: callResponse.call_id,
      status: callResponse.status,
      patientId: patientId,
    });

    res.json({
      success: true,
      data: {
        callId: callResponse.call_id,
        status: callResponse.status,
        message: "Intake call triggered successfully",
        patientId: patientId,
      },
    });
  } catch (error) {
    logger.error("Error triggering intake call", {
      error: error.message,
      patientId: req.body?.patientId,
    });
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/retell/call-storage/stats:
 *   get:
 *     summary: Get call ID storage statistics
 *     tags: [Retell Call Storage]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Storage statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 processedCallIds:
 *                   type: number
 *                   description: Number of call IDs currently stored
 *                 nextCleanup:
 *                   type: string
 *                   format: date-time
 *                   description: Next scheduled cleanup time (midnight PST)
 */
router.get("/call-storage/stats", authMiddleware, (req, res) => {
  const stats = callIdStorage.getStats();
  res.json({
    success: true,
    data: stats,
  });
});

/**
 * @swagger
 * /api/v1/retell/callbacks/stats:
 *   get:
 *     summary: Get scheduled callbacks statistics
 *     tags: [Retell Callbacks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Callback statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     pending:
 *                       type: number
 *                       description: Number of pending callbacks
 *                     completed:
 *                       type: number
 *                       description: Number of completed callbacks
 *                     failed:
 *                       type: number
 *                       description: Number of failed callbacks
 *                     upcomingInNext1Minute:
 *                       type: number
 *                       description: Number of callbacks scheduled in next 1 minute
 */
router.get("/callbacks/stats", authMiddleware, async (req, res, next) => {
  try {
    const callbackScheduler = require("../services/callbackScheduler");
    const stats = await callbackScheduler.getStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("Error fetching callback stats", { error: error.message });
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/retell/callbacks/scheduler/status:
 *   get:
 *     summary: Get callback scheduler status
 *     tags: [Retell Callbacks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Scheduler status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     running:
 *                       type: boolean
 *                       description: Whether the scheduler is running
 *                     processing:
 *                       type: boolean
 *                       description: Whether callbacks are currently being processed
 *                     intervalMinutes:
 *                       type: number
 *                       description: Interval in minutes between processing runs
 */
router.get("/callbacks/scheduler/status", authMiddleware, (req, res) => {
  const callbackScheduler = require("../services/callbackScheduler");
  const status = callbackScheduler.getStatus();
  res.json({
    success: true,
    data: status,
  });
});

/**
 * @swagger
 * /api/v1/retell/callbacks/list:
 *   get:
 *     summary: List scheduled callbacks
 *     tags: [Retell Callbacks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, failed]
 *         description: Filter by status
 *       - in: query
 *         name: patient_id
 *         schema:
 *           type: string
 *         description: Filter by patient ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of results
 *     responses:
 *       200:
 *         description: List of scheduled callbacks
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       patient_id:
 *                         type: string
 *                       agent_callback_number:
 *                         type: string
 *                       scheduled_time:
 *                         type: string
 *                         format: date-time
 *                       status:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       processed_at:
 *                         type: string
 *                         format: date-time
 *                       error_message:
 *                         type: string
 */
router.get("/callbacks/list", authMiddleware, async (req, res, next) => {
  try {
    const { status, patient_id, limit = 100 } = req.query;

    let query = "SELECT * FROM scheduled_callbacks WHERE 1=1";
    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }

    if (patient_id) {
      paramCount++;
      query += ` AND patient_id = $${paramCount}`;
      params.push(patient_id);
    }

    query += ` ORDER BY scheduled_time DESC LIMIT $${paramCount + 1}`;
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    logger.error("Error listing callbacks", { error: error.message });
    next(error);
  }
});

module.exports = router;
