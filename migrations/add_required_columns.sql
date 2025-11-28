-- Add ONLY the required columns to patient_details table

-- From Image 1 (Input data columns)
ALTER TABLE patient_details
ADD COLUMN IF NOT EXISTS referring_physician_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS modality_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS procedure_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS procedure_code VARCHAR(50);

-- From Image 2 (Post-call columns)
ALTER TABLE patient_details
ADD COLUMN IF NOT EXISTS appointment_booked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS precision_center VARCHAR(255),
ADD COLUMN IF NOT EXISTS answers_to_screening_questions TEXT;

-- System columns
ALTER TABLE patient_details
ADD COLUMN IF NOT EXISTS call_config JSON,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add trigger to auto-update updated_at
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