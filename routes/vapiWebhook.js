const express = require("express");
const router = express.Router();
const RedoxTransformer = require("../utils/redoxTransformer");
const RedoxAPIService = require("../services/redoxApiService");
const AuthService = require("../services/authService");
const logger = require("../utils/logger");
const LocationSorter = require("../utils/locationSorter");

const authService = new AuthService();

/**
 * @swagger
 * /api/v1/vapi/webhook:
 *   post:
 *     summary: Handle Vapi webhook events (tool-calls)
 *     tags: [Vapi Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [tool-calls]
 *                     description: Event type
 *                   call:
 *                     type: object
 *                     description: Call context and metadata
 *                   toolWithToolCallList:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                           enum: [check_availability, book_appointment, update_appointment, create_patient, find_patient, sort_locations, search_physician, get_physicians_by_specialty, find_physicians_by_symptoms]
 *                           description: Function name
 *                         toolCall:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                               description: Unique tool call ID
 *                             parameters:
 *                               type: object
 *                               description: Function-specific parameters
 *     responses:
 *       200:
 *         description: Tool call results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       toolCallId:
 *                         type: string
 *                       result:
 *                         type: string
 *                         description: JSON stringified result
 */
router.post("/webhook", async (req, res, next) => {
  try {
    // Log complete webhook request body
    logger.info("=== VAPI WEBHOOK RECEIVED ===", {
      requestBody: JSON.stringify(req.body, null, 2),
      headers: req.headers,
      timestamp: new Date().toISOString(),
    });

    const { message } = req.body;

    if (!message || message.type !== "tool-calls") {
      logger.warn("Vapi webhook failed: not a tool-calls event", {
        receivedBody: req.body,
      });
      return res.status(400).json({
        success: false,
        error: "Expected message.type to be 'tool-calls'",
      });
    }

    const { call, toolWithToolCallList } = message;

    if (!toolWithToolCallList || !Array.isArray(toolWithToolCallList)) {
      logger.warn("Vapi webhook failed: missing or invalid toolWithToolCallList", {
        receivedBody: req.body,
      });
      return res.status(400).json({
        success: false,
        error: "Missing or invalid toolWithToolCallList",
      });
    }

    logger.info("Vapi webhook - tool-calls event processed", {
      toolCallCount: toolWithToolCallList.length,
      toolNames: toolWithToolCallList.map(t => t.name),
      hasCall: !!call,
    });

    // Process each tool call
    const results = [];

    for (const toolWithCall of toolWithToolCallList) {
      const { name, toolCall } = toolWithCall;
      const { id: toolCallId, parameters } = toolCall;

      logger.info("Processing Vapi tool call", {
        functionName: name,
        toolCallId: toolCallId,
        hasParameters: !!parameters,
        parameters: parameters,
      });

      if (!name || !toolCallId) {
        logger.warn("Vapi tool call missing name or id", {
          toolWithCall: toolWithCall,
        });
        results.push({
          name: name || "unknown",
          toolCallId: toolCallId || "unknown",
          result: JSON.stringify({
            success: false,
            error: "Missing required fields: name and toolCallId",
          }),
        });
        continue;
      }

      // Always generate new access token for Vapi calls
      const accessToken = await authService.getAccessToken();

      let result;

      try {
        switch (name) {
          case "check_availability":
            logger.info("Processing check_availability function call");

            // Extract slot search parameters from parameters
            const { location, serviceType, startTime } = parameters;

            // Override location to Orlando Neuro Clinic
            const overriddenLocation = "Orlando Neuro Clinic";

            logger.info("Overriding location for check_availability", {
              originalLocation: location,
              overriddenLocation: overriddenLocation,
            });

            const slotSearchParams = RedoxTransformer.createSlotSearchParams(
              overriddenLocation,
              serviceType,
              startTime,
            );
            const slotResponse = await RedoxAPIService.makeRequest(
              "POST",
              "/Slot/_search",
              null,
              slotSearchParams,
              accessToken,
            );

            result = RedoxTransformer.transformSlotSearchResponse(slotResponse);
            break;

          case "book_appointment":
            logger.info("Processing book_appointment function call");

            // Extract appointment creation parameters from parameters
            const {
              patientId,
              slotId,
              appointmentType,
              startTime: apptStart,
              endTime,
              status,
            } = parameters;

            // Only patientId is required according to Redox (for participant reference)
            if (!patientId) {
              result = {
                success: false,
                error: "Missing required field for appointment booking: patientId",
              };
              break;
            }

            const appointmentBundle = RedoxTransformer.createAppointmentBundle(
              patientId,
              appointmentType,
              apptStart,
              endTime,
              status,
            );

            const createResponse = await RedoxAPIService.makeRequest(
              "POST",
              "/Appointment/$appointment-create",
              appointmentBundle,
              null,
              accessToken,
            );

            result =
              RedoxTransformer.transformAppointmentCreateResponse(createResponse);
            break;

          case "update_appointment":
            logger.info("Processing update_appointment function call");

            // Extract appointment update parameters from parameters
            const {
              appointmentId,
              patientId: updatePatientId,
              appointmentType: updateType,
              startTime: updateStart,
              endTime: updateEnd,
              status: updateStatus,
            } = parameters;

            // Only appointmentId and patientId are required for update
            if (!appointmentId || !updatePatientId) {
              result = {
                success: false,
                error:
                  "Missing required fields for appointment update: appointmentId, patientId",
              };
              break;
            }

            const updateBundle = RedoxTransformer.createAppointmentUpdateBundle(
              appointmentId,
              updatePatientId,
              updateType,
              updateStart,
              updateEnd,
              updateStatus,
            );

            const updateResponse = await RedoxAPIService.makeRequest(
              "POST",
              "/Appointment/$appointment-update",
              updateBundle,
              null,
              accessToken,
            );

            result =
              RedoxTransformer.transformAppointmentCreateResponse(updateResponse);
            break;

          case "create_patient":
            logger.info("Processing create_patient function call");

            // Extract patient creation parameters from parameters
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
            } = parameters;

            // Validate required fields
            if (!first_name || !last_name) {
              result = {
                success: false,
                error:
                  "Missing required fields for patient creation: first_name, last_name",
              };
              break;
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
              accessToken,
            );

            // Transform the response to extract patient ID
            const createResult =
              RedoxTransformer.transformAppointmentCreateResponse(
                patientCreateResponse,
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

            // Extract patient search parameters from parameters
            const { birth_date, given, family } = parameters;

            // Validate required fields
            if (!birth_date || !given || !family) {
              logger.warn("find_patient failed: missing required fields", {
                birth_date,
                given,
                family,
              });
              result = {
                success: false,
                error:
                  "Missing required fields: birth_date, given, and family are required",
              };
              break;
            }

            // Create search parameters
            const searchParams =
              RedoxTransformer.createPatientSearchByDobNameParams(
                birth_date,
                given,
                family,
              );

            // Execute patient search through Redox API
            const searchResponse = await RedoxAPIService.makeRequest(
              "POST",
              "/Patient/_search",
              null,
              searchParams,
              accessToken,
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
                patient: null,
              };
              break;
            }

            // Get the first patient's ID for appointment search
            const firstPatientEntry = searchResponse.entry.find(
              (entry) =>
                entry.resource && entry.resource.resourceType === "Patient",
            );
            const patientId = firstPatientEntry?.resource?.id;

            let appointmentResponse = null;

            // Search for appointments if patient found
            if (patientId) {
              try {
                const appointmentSearchParams =
                  RedoxTransformer.createAppointmentSearchParams(patientId);
                appointmentResponse = await RedoxAPIService.makeRequest(
                  "POST",
                  "/Appointment/_search",
                  null,
                  appointmentSearchParams,
                  accessToken,
                );
              } catch (appointmentError) {
                logger.warn("Failed to fetch appointments for patient", {
                  error: appointmentError.message,
                  patientId,
                });
                // Continue even if appointment fetch fails
              }
            }

            // Transform patient and appointment data into the required format
            const patientData =
              RedoxTransformer.transformPatientWithAppointmentDetails(
                searchResponse,
                appointmentResponse,
              );

            logger.info("Patient search by DOB and name completed", {
              patientFound: patientData !== null,
              birth_date,
              given,
              family,
            });

            // Return the patient data
            result = {
              success: true,
              patient_found: patientData !== null,
              patient: patientData,
            };
            break;
          }

          case "sort_locations": {
            logger.info("Processing sort_locations function call");

            // Extract parameters from parameters
            const { address, appointmentType, provider } = parameters;

            // Validate required fields
            if (!address || !appointmentType || !provider) {
              logger.warn("sort_locations failed: missing required fields", {
                address,
                appointmentType,
                provider,
              });
              result = {
                success: false,
                error:
                  "Missing required fields: address, appointmentType, and provider are required",
              };
              break;
            }

            // Use LocationSorter to get sorted locations (now async)
            const sortResult = await LocationSorter.sortLocationsByDistance(
              address,
              appointmentType,
              provider,
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

            // Extract parameters from parameters
            const { specialty, firstName, address } = parameters;

            // Validate required fields
            if (!specialty) {
              logger.warn("search_physician failed: missing required specialty", {
                specialty,
                firstName,
                address,
              });
              result = {
                success: false,
                error: "Missing required field: specialty is required",
              };
              break;
            }

            // Import physician search service
            const physicianSearchService = require("../services/physicianSearchService");

            // Search for physicians
            const searchResult = await physicianSearchService.searchPhysicians(
              specialty,
              firstName || null,
              address || null,
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

            // Extract specialty and address from parameters
            const { specialty, address } = parameters;

            // Validate required field
            if (!specialty) {
              logger.warn("get_physicians_by_specialty failed: missing required specialty", {
                specialty,
              });
              result = {
                success: false,
                error: "Missing required field: specialty is required",
              };
              break;
            }

            // Import physician search service
            const physicianSearchService = require("../services/physicianSearchService");

            // Get all physicians by specialty with optional address for distance sorting
            const searchResult = await physicianSearchService.getPhysiciansBySpecialty(
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

            // Extract parameters from parameters
            const { address, symptom_text } = parameters;

            // Validate required fields
            if (!address || !symptom_text) {
              logger.warn("find_physicians_by_symptoms failed: missing required fields", {
                address,
                symptom_text,
              });
              result = {
                success: false,
                error: "Missing required fields: address and symptom_text are required",
              };
              break;
            }

            // Import symptom physician matcher service
            const symptomPhysicianMatcher = require("../services/symptomPhysicianMatcher");

            // Find physicians by symptoms
            const searchResult = await symptomPhysicianMatcher.findPhysiciansBySymptoms(
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
            result = {
              success: false,
              error: `Unsupported function: ${name}`,
            };
        }

        // Add result to results array
        results.push({
          name: name,
          toolCallId: toolCallId,
          result: JSON.stringify(result),
        });

        logger.info("Vapi tool call completed successfully", {
          functionName: name,
          toolCallId: toolCallId,
        });
      } catch (error) {
        logger.error("Vapi tool call error", {
          error: error.message,
          functionName: name,
          toolCallId: toolCallId,
        });

        // Add error result
        results.push({
          name: name,
          toolCallId: toolCallId,
          result: JSON.stringify({
            success: false,
            error: error.message,
          }),
        });
      }
    }

    const vapiResponse = {
      results: results,
    };

    logger.info("Vapi webhook completed", {
      toolCallsProcessed: results.length,
    });

    // Log complete webhook response
    logger.info("=== VAPI WEBHOOK RESPONSE ===", {
      responseBody: JSON.stringify(vapiResponse, null, 2),
      timestamp: new Date().toISOString(),
    });

    res.json(vapiResponse);
  } catch (error) {
    logger.error("Vapi webhook error", { error: error.message });
    next(error);
  }
});

module.exports = router;
