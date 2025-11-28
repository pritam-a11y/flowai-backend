-- Migration to add all necessary columns to patient_details table
-- Based on the complete workflow: Import -> Call -> Screening -> Booking

-- Phase 1: Initial Import Columns (from referring physicians/practices)
ALTER TABLE patient_details
ADD COLUMN IF NOT EXISTS referring_physician_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS modality_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS procedure_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS procedure_code VARCHAR(50);

-- Phase 2: Call Tracking Columns
ALTER TABLE patient_details
ADD COLUMN IF NOT EXISTS call_config JSON,
ADD COLUMN IF NOT EXISTS call_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS last_call_date TIMESTAMP;

-- Phase 3: Screening/Intake Columns (collected during call)
ALTER TABLE patient_details
ADD COLUMN IF NOT EXISTS screening_questions_answers JSON,
ADD COLUMN IF NOT EXISTS patient_intake_details JSON,
ADD COLUMN IF NOT EXISTS intake_completed BOOLEAN DEFAULT FALSE;

-- Phase 4: Appointment Booking Result Columns
ALTER TABLE patient_details
ADD COLUMN IF NOT EXISTS appointment_booked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS precision_center VARCHAR(255),
ADD COLUMN IF NOT EXISTS appointment_confirmed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS confirmation_sent BOOLEAN DEFAULT FALSE;

-- Phase 5: System/Tracking Columns
ALTER TABLE patient_details
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_patient_details_updated_at ON patient_details;

CREATE TRIGGER update_patient_details_updated_at
BEFORE UPDATE ON patient_details
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_patient_details_call_status ON patient_details(call_status);
CREATE INDEX IF NOT EXISTS idx_patient_details_appointment_booked ON patient_details(appointment_booked);
CREATE INDEX IF NOT EXISTS idx_patient_details_intake_completed ON patient_details(intake_completed);
CREATE INDEX IF NOT EXISTS idx_patient_details_updated_at ON patient_details(updated_at);

-- Sample view to see patients ready for calling
CREATE OR REPLACE VIEW patients_ready_for_call AS
SELECT
    patient_id,
    first_name,
    last_name,
    phone,
    modality_name,
    procedure_name,
    call_count,
    call_status
FROM patient_details
WHERE call_status IN ('pending', 'retry')
  AND (call_count IS NULL OR call_count < 10)
  AND appointment_booked = FALSE
ORDER BY created_at;

-- Sample view to see completed appointments
CREATE OR REPLACE VIEW completed_appointments AS
SELECT
    patient_id,
    first_name || ' ' || last_name AS patient_name,
    appointment_date,
    appointment_time,
    appointment_type,
    precision_center,
    appointment_confirmed
FROM patient_details
WHERE appointment_booked = TRUE
ORDER BY appointment_date, appointment_time;

COMMENT ON TABLE patient_details IS 'Complete patient journey from initial import through call screening to appointment booking';
COMMENT ON COLUMN patient_details.referring_physician_name IS 'Doctor who referred the patient';
COMMENT ON COLUMN patient_details.modality_name IS 'Type of imaging/procedure (MRI, CT, etc)';
COMMENT ON COLUMN patient_details.screening_questions_answers IS 'JSON object containing all screening Q&A from call';
COMMENT ON COLUMN patient_details.precision_center IS 'Which precision imaging center location was selected';
COMMENT ON COLUMN patient_details.call_config IS 'JSON object tracking call attempt timestamps and details';