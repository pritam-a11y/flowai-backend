# Complete Retell API Documentation

## Overview
This document describes all APIs exposed to Retell AI voice agent for handling patient appointments, scheduling, and information queries.

## Base URL
- Development: `http://localhost:3002/api/v1/retell`
- Production: `https://your-domain.com/api/v1/retell`

---

## 1. WEBHOOK ENDPOINT (Incoming Call Handler)

### `POST /api/v1/retell/webhook`

**Purpose:** Handles incoming phone calls from Retell. When a patient calls, this endpoint receives the call information and returns patient data and agent configuration.

**Request Body:**
```json
{
  "call_inbound": {
    "from_number": "+1234567890",  // Caller's phone number
    "to_number": "+1987654321",    // Called number
    "call_id": "unique_call_id"
  }
}
```

**Process Flow:**
1. Receives incoming call details
2. Searches for patient by phone number in database
3. Retrieves patient's appointment information
4. Returns agent configuration with patient context

**Response:**
```json
{
  "agent_id": "agent_5b6af139307ff292f65fa7fe52",
  "dynamic_variables": [
    {
      "variable_name": "patientName",
      "variable_value": "John Doe"
    },
    {
      "variable_name": "patientId",
      "variable_value": "46ceeb10-f26c-4b12-a7f0-3412b98c2f22"
    },
    {
      "variable_name": "appointmentDate",
      "variable_value": "2025-12-04"
    },
    {
      "variable_name": "appointmentTime",
      "variable_value": "10:00 AM"
    },
    {
      "variable_name": "appointmentType",
      "variable_value": "Open MRI"
    }
  ]
}
```

---

## 2. FUNCTION CALL ENDPOINT (Main API Handler)

### `POST /api/v1/retell/function-call`

**Purpose:** Handles all function calls from Retell AI agent during conversations. This is the main endpoint for all operations.

**Request Structure:**
```json
{
  "name": "function_name",  // Which function to execute
  "args": {                  // Function-specific arguments
    // varies by function
  },
  "call": {                  // Call context
    "call_id": "unique_call_id",
    "transcript": "conversation transcript",
    "call_analysis": {
      "custom_analysis_data": {
        // Additional context data
      }
    }
  }
}
```

### Available Functions:

---

### 2.1 `check_availability`
**Purpose:** Search for available appointment slots

**Arguments:**
```json
{
  "serviceType": "Open MRI",           // Optional: Filter by service type
  "startTime": "2025-12-01T10:00:00.000-04:00", // Optional: Search from this time (default: now)
  "location": "Main Hospital",         // Currently overridden to "RES General Hospital"
  "category": "group one",             // Optional: "group one" or "group two" (group two adds 4 days)
  "stat": true                         // Optional: Enable statistics
}
```

**SQL Query Logic:**
- Searches slots table for available appointments
- Filters by: `start_time >= startTime AND start_time <= startTime+30days`
- If serviceType provided: adds `AND LOWER(service_type) = LOWER(serviceType)`
- Only returns slots with `status = 'available'`
- Ordered by `start_time ASC`

**Response:**
```json
{
  "success": true,
  "function": "check_availability",
  "result": {
    "success": true,
    "status": 200,
    "message": "Found 2 available slots starting from 2025-12-01T10:00:00.000-04:00.",
    "availableSlots": [
      {
        "slotId": "3fdc44ac-733c-4935-8c7e-3b422d070f2d",
        "startTime": "2025-12-04T14:00:00.000Z",  // UTC time
        "endTime": "2025-12-04T15:00:00.000Z",
        "dayOfWeek": "Wednesday",
        "serviceType": "Open MRI",
        "status": "available"
      }
    ]
  }
}
```

---

### 2.2 `book_appointment`
**Purpose:** Book an appointment for a patient

**Arguments:**
```json
{
  "patientId": "46ceeb10-f26c-4b12-a7f0-3412b98c2f22",  // Required
  "appointmentType": "Open MRI",                          // Required
  "startTime": "2025-12-04T10:00:00.000-04:00",          // Required
  "endTime": "2025-12-04T11:00:00.000-04:00",            // Required
  "status": "booked",                                     // Optional (default: "booked")
  "stat": false                                           // Optional statistics flag
}
```

**Process Flow:**
1. Validates patient exists (checks patient_details table)
2. Checks if patient already has an appointment
3. Verifies call count limit (max 10 calls)
4. Updates slot status from 'available' to 'booked'
5. Updates patient_details with appointment information
6. Updates PatientService with call statistics

**Database Operations:**
```sql
-- 1. Check existing appointment
SELECT appointment_status FROM patient_details WHERE patient_id = $1

-- 2. Check call count
SELECT COALESCE(call_count, 0) FROM patient_details WHERE patient_id = $1

-- 3. Book the slot
UPDATE slots
SET status = 'booked'
WHERE start_time = $1 AND LOWER(status) = 'available'
RETURNING slot_id

-- 4. Update patient details
UPDATE patient_details
SET appointment_status = $2,
    appointment_type = $3,
    appointment_date = $4,
    appointment_time = $5,
    appointment_location = $6
WHERE patient_id = $1
```

**Response:**
```json
{
  "success": true,
  "function": "book_appointment",
  "result": {
    "success": true,
    "statusCode": 201,
    "appointment": {
      "patientId": "46ceeb10-f26c-4b12-a7f0-3412b98c2f22",
      "slotId": "3fdc44ac-733c-4935-8c7e-3b422d070f2d",
      "date": "2025-12-04",
      "time": "14:00:00",
      "type": "Open MRI",
      "location": "RES General Hospital"
    }
  }
}
```

---

### 2.3 `update_appointment`
**Purpose:** Update existing appointment details

**Arguments:**
```json
{
  "patientId": "46ceeb10-f26c-4b12-a7f0-3412b98c2f22",  // Required
  "appointmentType": "CT Scan",                           // Optional: New type
  "startTime": "2025-12-05T14:00:00.000-04:00",          // Optional: New start time
  "endTime": "2025-12-05T15:00:00.000-04:00",            // Optional: New end time
  "location": "West Wing",                                // Optional: New location
  "status": "confirmed"                                   // Optional: New status
}
```

**Process Flow:**
1. Validates patient exists
2. Builds dynamic UPDATE query based on provided fields
3. Updates patient_details table with new values

**Response:**
```json
{
  "success": true,
  "function": "update_appointment",
  "result": {
    "success": true,
    "message": "Appointment details updated successfully",
    "patientId": "46ceeb10-f26c-4b12-a7f0-3412b98c2f22"
  }
}
```

---

### 2.4 `sort_locations`
**Purpose:** Sort medical facility locations by distance from patient

**Arguments:**
```json
{
  "patientAddress": "123 Main St, New York, NY 10001",
  "locations": [
    {"name": "Hospital A", "address": "456 Oak St, New York, NY"},
    {"name": "Hospital B", "address": "789 Pine St, Brooklyn, NY"}
  ]
}
```

**Process:**
1. Uses LocationSorter utility class
2. Calculates distances using Google Maps API or Haversine formula
3. Sorts locations by distance

**Response:**
```json
{
  "success": true,
  "function": "sort_locations",
  "result": {
    "success": true,
    "sortedLocations": [
      {
        "name": "Hospital A",
        "address": "456 Oak St, New York, NY",
        "distance": 2.5
      }
    ]
  }
}
```

---

### 2.5 `search_physician`
**Purpose:** Search for physicians by name

**Arguments:**
```json
{
  "physicianName": "Dr. Smith"
}
```

**Process:**
1. Loads physicians from physiciansData.json config
2. Performs fuzzy search on physician names
3. Returns matching physicians

**Response:**
```json
{
  "success": true,
  "function": "search_physician",
  "result": {
    "success": true,
    "physicians": [
      {
        "name": "Dr. John Smith",
        "specialty": "Radiology",
        "profileUrl": "https://example.com/dr-smith"
      }
    ]
  }
}
```

---

### 2.6 `get_physicians_by_specialty`
**Purpose:** Get list of physicians filtered by specialty

**Arguments:**
```json
{
  "specialty": "Radiology"
}
```

**Response:**
```json
{
  "success": true,
  "function": "get_physicians_by_specialty",
  "result": {
    "success": true,
    "physicians": [
      {
        "name": "Dr. Jane Doe",
        "firstName": "Jane",
        "lastName": "Doe",
        "specialty": "Radiology",
        "profileUrl": "https://example.com/dr-doe"
      }
    ]
  }
}
```

---

### 2.7 `find_physicians_by_symptoms`
**Purpose:** Find appropriate physicians based on patient symptoms

**Arguments:**
```json
{
  "symptoms": "back pain, headache"
}
```

**Process:**
1. Maps symptoms to relevant medical specialties
2. Returns physicians from those specialties

**Response:**
```json
{
  "success": true,
  "function": "find_physicians_by_symptoms",
  "result": {
    "success": true,
    "physicians": [
      {
        "name": "Dr. Mike Johnson",
        "specialty": "Neurology",
        "relevance": "Specializes in headache treatment"
      }
    ]
  }
}
```

---

### 2.8 `get_slots_by_symptoms`
**Purpose:** Find available appointment slots based on symptoms

**Arguments:**
```json
{
  "symptoms": "chest pain",
  "startTime": "2025-12-01T10:00:00.000-04:00"
}
```

**Process:**
1. Maps symptoms to appropriate service types
2. Queries slots table for matching services
3. Returns available appointments

**Response:**
```json
{
  "success": true,
  "function": "get_slots_by_symptoms",
  "result": {
    "success": true,
    "recommendedServiceTypes": ["Cardiac CT", "EKG"],
    "availableSlots": [...]
  }
}
```

---

### 2.9 `get_insurance_providers`
**Purpose:** Get list of accepted insurance providers

**Arguments:**
```json
{
  "insuranceName": "Blue Cross"  // Optional: search filter
}
```

**Process:**
1. Queries insurance_providers table
2. Performs fuzzy matching if search term provided
3. Returns list of insurance options

**Response:**
```json
{
  "success": true,
  "function": "get_insurance_providers",
  "result": {
    "status": true,
    "message": "Found matching insurance providers",
    "data": [
      {
        "id": "123",
        "name": "Blue Cross Blue Shield",
        "type": "PPO"
      }
    ]
  }
}
```

---

### 2.10 `check_insurance_eligibility`
**Purpose:** Verify insurance coverage for services

**Arguments:**
```json
{
  "insuranceId": "123",
  "serviceType": "MRI"
}
```

**Response:**
```json
{
  "success": true,
  "function": "check_insurance_eligibility",
  "result": {
    "eligible": true,
    "coveragePercentage": 80,
    "copay": "$50"
  }
}
```

---

## 3. CALL UPDATE ENDPOINT

### `POST /api/v1/retell/call/update`

**Purpose:** Receives call completion notifications from Retell with transcript and analytics

**Request Body:**
```json
{
  "call": {
    "call_id": "unique_call_id",
    "status": "ended",
    "end_reason": "user_hangup",
    "transcript": "Full conversation transcript",
    "transcript_object": [...],
    "call_analysis": {
      "custom_analysis_data": {
        "appointment_date": "2025-12-04",
        "appointment_time": "10:00 AM",
        "appointment_location": "Main Hospital",
        "physician_name": "Dr. Smith",
        "patient_intake_details": {...}
      }
    }
  }
}
```

**Process Flow:**
1. Stores call transcript in S3
2. Updates call metadata in database
3. Generates intake forms if applicable
4. Sends confirmation emails
5. Updates patient records

**Response:**
```json
{
  "success": true,
  "message": "Call update processed successfully"
}
```

---

## 4. TRIGGER INTAKE CALL

### `POST /api/v1/retell/trigger-intake-call` (Requires Auth)

**Purpose:** Initiates an outbound call to patient for intake

**Request Body:**
```json
{
  "patient_id": "46ceeb10-f26c-4b12-a7f0-3412b98c2f22",
  "phone_number": "+1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "call_id": "new_call_id",
  "message": "Intake call initiated"
}
```

---

## 5. CALLBACK & MONITORING ENDPOINTS

### `GET /api/v1/retell/call-storage/stats` (Requires Auth)
Returns statistics about stored call data

### `GET /api/v1/retell/callbacks/stats` (Requires Auth)
Returns callback scheduling statistics

### `GET /api/v1/retell/callbacks/scheduler/status` (Requires Auth)
Returns callback scheduler status

### `GET /api/v1/retell/callbacks/list` (Requires Auth)
Returns list of scheduled callbacks

---

## Database Tables Used

1. **patients** - Basic patient information
2. **patient_details** - Detailed patient & appointment info
3. **slots** - Available appointment slots
4. **appointments** - Booked appointments
5. **insurance_providers** - Insurance company list
6. **scheduled_callbacks** - Callback queue

---

## Key Features

1. **Time Zone Handling**: All times stored in UTC, converted for display
2. **Call Limiting**: Max 10 calls per patient
3. **Duplicate Prevention**: Checks existing appointments before booking
4. **Service Type Filtering**: Slots filtered by requested service
5. **Date Range Search**: 30-day window for slot availability
6. **Dynamic Updates**: Supports partial appointment updates

---

## Error Handling

All endpoints return consistent error format:
```json
{
  "success": false,
  "error": "Error message description"
}
```

Common errors:
- Missing required fields
- Patient not found
- Slot already booked
- Maximum call limit reached
- Database connection errors

---

## Questions for Clarification

1. **Insurance Verification**: Is the insurance eligibility check integrated with an external API or just database lookup?
2. **Physician Availability**: Should physician schedule be checked when booking appointments?
3. **Cancellation Policy**: Is there an API for cancelling appointments?
4. **Wait List**: Should we implement waitlist functionality for fully booked slots?
5. **Multi-location Support**: How should location override ("RES General Hospital") work with multiple facilities?
6. **Payment Processing**: Are there payment/billing APIs to integrate?
7. **Reminder System**: Should the callback scheduler send appointment reminders?
8. **Emergency Slots**: Should there be special handling for urgent/emergency appointments?