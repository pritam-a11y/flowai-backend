const db = require("../db/connection");

async function verifyDatabase() {
    try {
        console.log("Verifying database setup...\n");

        // 1. Check patient_details columns
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

        console.log("✅ Patient_details columns added:");
        columnCheck.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type}`);
        });

        // 2. Check slot counts
        const slotCounts = await db.query(`
            SELECT service_type, COUNT(*) as count
            FROM slots
            WHERE status = 'available'
            GROUP BY service_type
            ORDER BY service_type;
        `);

        console.log("\n✅ Available slots by service type:");
        slotCounts.rows.forEach(row => {
            console.log(`  - ${row.service_type}: ${row.count} slots`);
        });

        // 3. Sample slots for tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        const sampleSlots = await db.query(`
            SELECT service_type,
                   TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_time_est,
                   TO_CHAR(end_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as end_time_est,
                   EXTRACT(EPOCH FROM (end_time - start_time))/60 as duration_minutes
            FROM slots
            WHERE DATE(start_time) = $1
            AND status = 'available'
            ORDER BY service_type, start_time
            LIMIT 30;
        `, [tomorrowStr]);

        console.log(`\n✅ Sample slots for tomorrow (${tomorrowStr}) in EST:`);
        let currentService = '';
        sampleSlots.rows.forEach(slot => {
            if (currentService !== slot.service_type) {
                currentService = slot.service_type;
                console.log(`\n${currentService} (${slot.duration_minutes} min slots):`);
            }
            console.log(`  ${slot.start_time_est} - ${slot.end_time_est}`);
        });

        // 4. Test the check_availability query
        console.log("\n✅ Testing check_availability query:");
        const testAvailability = await db.query(`
            SELECT slot_id, start_time, end_time, service_type
            FROM slots
            WHERE start_time >= NOW()
            AND start_time <= NOW() + INTERVAL '7 days'
            AND LOWER(service_type) = LOWER('Open MRI')
            AND LOWER(status) = 'available'
            ORDER BY start_time
            LIMIT 5;
        `);

        console.log("Next 5 available Open MRI slots:");
        testAvailability.rows.forEach(slot => {
            const startEST = new Date(slot.start_time).toLocaleString('en-US', { timeZone: 'America/New_York' });
            console.log(`  - ${startEST} (${slot.service_type})`);
        });

        console.log("\n✅ Database setup verified successfully!");

    } catch (error) {
        console.error("\n❌ Error verifying database:", error.message);
    } finally {
        process.exit(0);
    }
}

verifyDatabase();