const db = require("../db/connection");

async function verifyProductionSlots() {
    try {
        console.log("VERIFYING PRODUCTION SLOTS\n");
        console.log("==========================\n");

        // 1. Overall summary
        const summary = await db.query(`
            SELECT
                service_type,
                COUNT(DISTINCT location) as locations,
                COUNT(*) as total_slots,
                COUNT(DISTINCT DATE(start_time)) as days,
                MIN(DATE(start_time)) as first_day,
                MAX(DATE(start_time)) as last_day
            FROM slots
            GROUP BY service_type
            ORDER BY service_type;
        `);

        console.log("1. OVERALL SUMMARY:");
        summary.rows.forEach(row => {
            const slotsPerDay = Math.round(row.total_slots / row.days);
            console.log(`\n${row.service_type}:`);
            console.log(`  - Locations: ${row.locations}`);
            console.log(`  - Total slots: ${row.total_slots}`);
            console.log(`  - Days covered: ${row.days} (${row.first_day} to ${row.last_day})`);
            console.log(`  - Average slots per day: ${slotsPerDay}`);
        });

        // 2. Location breakdown
        const locationBreakdown = await db.query(`
            SELECT
                service_type,
                location,
                COUNT(*) as total_slots
            FROM slots
            GROUP BY service_type, location
            ORDER BY service_type, location;
        `);

        console.log("\n2. SLOTS BY LOCATION:");
        let currentService = '';
        locationBreakdown.rows.forEach(row => {
            if (currentService !== row.service_type) {
                currentService = row.service_type;
                console.log(`\n${currentService}:`);
            }
            console.log(`  - ${row.location}: ${row.total_slots} total slots`);
        });

        // 3. Verify time slots are correct (sample for tomorrow)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const timeVerification = await db.query(`
            SELECT
                service_type,
                TO_CHAR(MIN(start_time AT TIME ZONE 'America/New_York'), 'HH12:MI AM') as first_slot,
                TO_CHAR(MAX(start_time AT TIME ZONE 'America/New_York'), 'HH12:MI AM') as last_slot,
                COUNT(DISTINCT TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM')) as unique_times
            FROM slots
            WHERE DATE(start_time) = DATE($1)
            AND location = 'Gate Parkway'
            GROUP BY service_type
            ORDER BY service_type;
        `, [tomorrow.toISOString()]);

        console.log("\n3. TIME VERIFICATION (Gate Parkway, tomorrow):");
        timeVerification.rows.forEach(row => {
            console.log(`\n${row.service_type}:`);
            console.log(`  - First slot: ${row.first_slot}`);
            console.log(`  - Last slot: ${row.last_slot}`);
            console.log(`  - Unique time slots: ${row.unique_times}`);
        });

        // 4. Sample actual times for each service
        const sampleTimes = await db.query(`
            WITH ranked_slots AS (
                SELECT
                    service_type,
                    TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as florida_time,
                    location,
                    ROW_NUMBER() OVER (PARTITION BY service_type ORDER BY start_time) as rn
                FROM slots
                WHERE DATE(start_time) = DATE($1)
            )
            SELECT service_type, florida_time, location
            FROM ranked_slots
            WHERE rn <= 5
            ORDER BY service_type, rn;
        `, [tomorrow.toISOString()]);

        console.log("\n4. SAMPLE TIMES FOR TOMORROW (First 5 slots per service):");
        currentService = '';
        sampleTimes.rows.forEach(slot => {
            if (currentService !== slot.service_type) {
                currentService = slot.service_type;
                console.log(`\n${currentService}:`);
            }
            console.log(`  - ${slot.florida_time} at ${slot.location}`);
        });

        // 5. Verify slot durations
        const durations = await db.query(`
            SELECT
                service_type,
                EXTRACT(EPOCH FROM (end_time - start_time))/60 as duration_minutes,
                COUNT(*) as count
            FROM slots
            WHERE DATE(start_time) = DATE($1)
            GROUP BY service_type, duration_minutes
            ORDER BY service_type, duration_minutes;
        `, [tomorrow.toISOString()]);

        console.log("\n5. SLOT DURATIONS:");
        currentService = '';
        durations.rows.forEach(row => {
            if (currentService !== row.service_type) {
                currentService = row.service_type;
                console.log(`\n${currentService}:`);
            }
            console.log(`  - ${row.duration_minutes} minutes: ${row.count} slots`);
        });

        console.log("\n✅ VERIFICATION COMPLETE!");

    } catch (error) {
        console.error("\n❌ Error verifying slots:", error.message);
    } finally {
        process.exit(0);
    }
}

verifyProductionSlots();