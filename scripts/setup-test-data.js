const db = require("../db/connection");
const { v4: uuidv4 } = require('uuid');

async function setupDatabase() {
    try {
        console.log("Starting database setup...");

        // Step 1: Add columns to patient_details table
        console.log("\n1. Adding columns to patient_details table...");
        const migrationSQL = `
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
        `;

        await db.query(migrationSQL);
        console.log("✓ Columns added successfully");

        // Step 2: Clear existing test slots
        console.log("\n2. Clearing existing test slots...");
        await db.query("DELETE FROM slots WHERE service_type IN ('MRI', 'Open MRI', 'Dexa', 'CT Scan', 'X-Ray')");
        console.log("✓ Existing slots cleared");

        // Step 3: Create test slots
        console.log("\n3. Creating test slots...");

        const today = new Date();
        const testDates = [];

        // Create slots for next 7 days
        for (let i = 1; i <= 7; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() + i);
            date.setHours(0, 0, 0, 0);
            testDates.push(date);
        }

        let slotsCreated = 0;

        for (const date of testDates) {
            const dateStr = date.toISOString().split('T')[0];
            console.log(`\nCreating slots for ${dateStr}:`);

            // MRI Slots - 1 hour duration
            // 8AM-10AM (2 slots), 12PM-2PM (2 slots), 3PM-5PM (2 slots)
            const mriTimeSlots = [
                { start: 8, end: 9 },
                { start: 9, end: 10 },
                { start: 12, end: 13 },
                { start: 13, end: 14 },
                { start: 15, end: 16 },
                { start: 16, end: 17 }
            ];

            for (const slot of mriTimeSlots) {
                const startTime = new Date(date);
                startTime.setUTCHours(slot.start + 5, 0, 0, 0); // Adding 5 for EST to UTC

                const endTime = new Date(date);
                endTime.setUTCHours(slot.end + 5, 0, 0, 0);

                await db.query(`
                    INSERT INTO slots (slot_id, start_time, end_time, service_type, status)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    uuidv4(),
                    startTime.toISOString(),
                    endTime.toISOString(),
                    'MRI',
                    'available'
                ]);

                // Also add Open MRI slots
                await db.query(`
                    INSERT INTO slots (slot_id, start_time, end_time, service_type, status)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    uuidv4(),
                    startTime.toISOString(),
                    endTime.toISOString(),
                    'Open MRI',
                    'available'
                ]);

                slotsCreated += 2;
            }

            // DEXA Slots - 15 minute duration
            // 8AM-10AM (8 slots), 12PM-2PM (8 slots), 3PM-5PM (8 slots)
            const dexaTimeRanges = [
                { startHour: 8, endHour: 10 },
                { startHour: 12, endHour: 14 },
                { startHour: 15, endHour: 17 }
            ];

            for (const range of dexaTimeRanges) {
                for (let hour = range.startHour; hour < range.endHour; hour++) {
                    for (let minutes = 0; minutes < 60; minutes += 15) {
                        const startTime = new Date(date);
                        startTime.setUTCHours(hour + 5, minutes, 0, 0);

                        const endTime = new Date(startTime);
                        endTime.setMinutes(endTime.getMinutes() + 15);

                        await db.query(`
                            INSERT INTO slots (slot_id, start_time, end_time, service_type, status)
                            VALUES ($1, $2, $3, $4, $5)
                        `, [
                            uuidv4(),
                            startTime.toISOString(),
                            endTime.toISOString(),
                            'Dexa',
                            'available'
                        ]);

                        slotsCreated++;
                    }
                }
            }

            // Other Services (CT Scan, X-Ray) - 20 minute duration for MRI, but I'll adjust
            // Actually let me clarify: MRI is 20 min slots according to requirements
            const otherServices = ['CT Scan', 'X-Ray'];
            const otherServiceRanges = [
                { startHour: 8, endHour: 10 },
                { startHour: 12, endHour: 14 },
                { startHour: 15, endHour: 17 }
            ];

            for (const service of otherServices) {
                for (const range of otherServiceRanges) {
                    for (let hour = range.startHour; hour < range.endHour; hour++) {
                        for (let minutes = 0; minutes < 60; minutes += 20) {
                            const startTime = new Date(date);
                            startTime.setUTCHours(hour + 5, minutes, 0, 0);

                            const endTime = new Date(startTime);
                            endTime.setMinutes(endTime.getMinutes() + 20);

                            // Don't create slots that go beyond the hour
                            if (endTime.getMinutes() <= 60 || endTime.getMinutes() === 0) {
                                await db.query(`
                                    INSERT INTO slots (slot_id, start_time, end_time, service_type, status)
                                    VALUES ($1, $2, $3, $4, $5)
                                `, [
                                    uuidv4(),
                                    startTime.toISOString(),
                                    endTime.toISOString(),
                                    service,
                                    'available'
                                ]);

                                slotsCreated++;
                            }
                        }
                    }
                }
            }
        }

        console.log(`\n✓ Created ${slotsCreated} test slots successfully`);

        // Step 4: Verify the setup
        console.log("\n4. Verifying setup...");

        // Check columns
        const columnCheck = await db.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'patient_details'
            AND column_name IN (
                'referring_physician_name', 'modality_name', 'procedure_name',
                'procedure_code', 'appointment_booked', 'precision_center',
                'answers_to_screening_questions', 'call_config', 'updated_at'
            )
            ORDER BY column_name;
        `);

        console.log("\nColumns in patient_details:");
        columnCheck.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type}`);
        });

        // Check slot counts
        const slotCounts = await db.query(`
            SELECT service_type, COUNT(*) as count,
                   MIN(start_time::date) as first_date,
                   MAX(start_time::date) as last_date
            FROM slots
            WHERE status = 'available'
            GROUP BY service_type
            ORDER BY service_type;
        `);

        console.log("\nSlot counts by service type:");
        slotCounts.rows.forEach(row => {
            console.log(`  - ${row.service_type}: ${row.count} slots (${row.first_date} to ${row.last_date})`);
        });

        // Sample slots for tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const tomorrowEnd = new Date(tomorrow);
        tomorrowEnd.setHours(23, 59, 59, 999);

        const sampleSlots = await db.query(`
            SELECT service_type,
                   TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_time_est,
                   TO_CHAR(end_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as end_time_est
            FROM slots
            WHERE start_time >= $1 AND start_time <= $2
            AND status = 'available'
            ORDER BY service_type, start_time
            LIMIT 20;
        `, [tomorrow.toISOString(), tomorrowEnd.toISOString()]);

        console.log("\nSample slots for tomorrow (EST):");
        sampleSlots.rows.forEach(slot => {
            console.log(`  - ${slot.service_type}: ${slot.start_time_est} - ${slot.end_time_est}`);
        });

        // Show slot distribution
        const slotDistribution = await db.query(`
            SELECT
                service_type,
                EXTRACT(HOUR FROM start_time AT TIME ZONE 'America/New_York') as hour,
                COUNT(*) as count
            FROM slots
            WHERE status = 'available'
            AND start_time >= NOW()
            GROUP BY service_type, hour
            ORDER BY service_type, hour;
        `);

        console.log("\nSlot distribution by hour (EST):");
        let currentService = '';
        slotDistribution.rows.forEach(row => {
            if (currentService !== row.service_type) {
                currentService = row.service_type;
                console.log(`\n${currentService}:`);
            }
            const hourStr = row.hour < 12 ? `${row.hour}AM` : row.hour === 12 ? '12PM' : `${row.hour - 12}PM`;
            console.log(`  ${hourStr}: ${row.count} slots`);
        });

        console.log("\n✅ Database setup completed successfully!");

    } catch (error) {
        console.error("\n❌ Error setting up database:", error.message);
        console.error(error);
    } finally {
        // Don't call db.end() as it's not a function in our db module
        process.exit(0);
    }
}

// Run the setup
setupDatabase();