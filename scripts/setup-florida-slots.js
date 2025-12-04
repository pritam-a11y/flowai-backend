const db = require("../db/connection");
const { v4: uuidv4 } = require('uuid');

async function setupFloridaSlots() {
    try {
        console.log("Setting up slots for FLORIDA TIMEZONE (EST/EDT)...\n");

        // Step 1: Clear ALL existing slots
        console.log("1. Clearing ALL existing slots...");
        await db.query("DELETE FROM slots");
        console.log("✓ All slots cleared\n");

        // Step 2: Create test slots for next 7 days
        const today = new Date();
        let slotsCreated = 0;

        for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
            // Create base date in Florida timezone
            const floridaDate = new Date(today);
            floridaDate.setDate(floridaDate.getDate() + dayOffset);
            const dateStr = floridaDate.toISOString().split('T')[0];

            console.log(`Creating slots for ${dateStr}:`);

            // MRI Slots - EXACTLY 3 SLOTS PER DAY (1 hour each)
            // 8-9AM, 12-1PM, 3-4PM FLORIDA TIME
            const mriSlots = [
                { startHour: 8, endHour: 9 },   // 8-9 AM
                { startHour: 12, endHour: 13 },  // 12-1 PM
                { startHour: 15, endHour: 16 }   // 3-4 PM
            ];

            for (const slot of mriSlots) {
                // Create datetime in Florida timezone and convert to UTC for storage
                const startTime = new Date(`${dateStr}T${String(slot.startHour).padStart(2, '0')}:00:00-05:00`);
                const endTime = new Date(`${dateStr}T${String(slot.endHour).padStart(2, '0')}:00:00-05:00`);

                // Regular MRI
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

                // Open MRI
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
            // Time windows: 8-10AM, 12-2PM, 3-5PM FLORIDA TIME
            const dexaWindows = [
                { startHour: 8, endHour: 10 },   // 8-10 AM
                { startHour: 12, endHour: 14 },  // 12-2 PM
                { startHour: 15, endHour: 17 }   // 3-5 PM
            ];

            for (const window of dexaWindows) {
                for (let hour = window.startHour; hour < window.endHour; hour++) {
                    for (let minutes = 0; minutes < 60; minutes += 15) {
                        const timeStr = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
                        const startTime = new Date(`${dateStr}T${timeStr}-05:00`);
                        const endTime = new Date(startTime.getTime() + 15 * 60 * 1000);

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

            // Other Services (CT Scan, X-Ray) - 20 minute duration
            // Time windows: 8-10AM, 12-2PM, 3-5PM FLORIDA TIME
            const otherServices = ['CT Scan', 'X-Ray'];
            const otherWindows = [
                { startHour: 8, endHour: 10 },   // 8-10 AM
                { startHour: 12, endHour: 14 },  // 12-2 PM
                { startHour: 15, endHour: 17 }   // 3-5 PM
            ];

            for (const service of otherServices) {
                for (const window of otherWindows) {
                    for (let hour = window.startHour; hour < window.endHour; hour++) {
                        for (let minutes = 0; minutes < 60; minutes += 20) {
                            // Only create slots that fit within the hour
                            if (minutes + 20 <= 60) {
                                const timeStr = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
                                const startTime = new Date(`${dateStr}T${timeStr}-05:00`);
                                const endTime = new Date(startTime.getTime() + 20 * 60 * 1000);

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

        console.log(`\n✓ Created ${slotsCreated} slots successfully\n`);

        // Step 3: Verify the setup
        console.log("Verifying slot creation:\n");

        // Check slot counts
        const slotCounts = await db.query(`
            SELECT service_type,
                   COUNT(*) as total_count,
                   COUNT(DISTINCT DATE(start_time)) as days,
                   COUNT(*) / COUNT(DISTINCT DATE(start_time)) as slots_per_day
            FROM slots
            WHERE status = 'available'
            GROUP BY service_type
            ORDER BY service_type;
        `);

        console.log("Slots per service type:");
        slotCounts.rows.forEach(row => {
            console.log(`  ${row.service_type}: ${row.slots_per_day} slots/day (${row.total_count} total for ${row.days} days)`);
        });

        // Show tomorrow's MRI slots (should be exactly 3)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        const mriSlots = await db.query(`
            SELECT service_type,
                   TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM TZ') as start_est,
                   TO_CHAR(end_time AT TIME ZONE 'America/New_York', 'HH12:MI AM TZ') as end_est
            FROM slots
            WHERE DATE(start_time AT TIME ZONE 'America/New_York') = $1
            AND service_type IN ('MRI', 'Open MRI')
            AND status = 'available'
            ORDER BY service_type, start_time;
        `, [tomorrowStr]);

        console.log(`\nMRI slots for tomorrow (${tomorrowStr}) in Florida time:`);
        mriSlots.rows.forEach(slot => {
            console.log(`  ${slot.service_type}: ${slot.start_est} - ${slot.end_est}`);
        });

        // Show sample of other slots
        const sampleSlots = await db.query(`
            SELECT service_type,
                   TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_est,
                   TO_CHAR(end_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as end_est,
                   EXTRACT(EPOCH FROM (end_time - start_time))/60 as duration_min
            FROM slots
            WHERE DATE(start_time AT TIME ZONE 'America/New_York') = $1
            AND service_type IN ('Dexa', 'CT Scan')
            AND status = 'available'
            ORDER BY service_type, start_time
            LIMIT 15;
        `, [tomorrowStr]);

        console.log(`\nSample of other slots for tomorrow in Florida time:`);
        let currentService = '';
        sampleSlots.rows.forEach(slot => {
            if (currentService !== slot.service_type) {
                currentService = slot.service_type;
                console.log(`\n${currentService} (${slot.duration_min} min slots):`);
            }
            console.log(`  ${slot.start_est} - ${slot.end_est}`);
        });

        console.log("\n✅ FLORIDA TIMEZONE SLOTS SETUP COMPLETED!");
        console.log("\n📍 SUMMARY:");
        console.log("- Timezone: Florida (America/New_York / EST/EDT)");
        console.log("- MRI/Open MRI: 3 slots per day (8-9AM, 12-1PM, 3-4PM)");
        console.log("- Dexa: 15-minute slots (8-10AM, 12-2PM, 3-5PM)");
        console.log("- CT Scan/X-Ray: 20-minute slots (8-10AM, 12-2PM, 3-5PM)");
        console.log("- All times are in Florida timezone!");

    } catch (error) {
        console.error("\n❌ Error setting up slots:", error.message);
        console.error(error);
    } finally {
        process.exit(0);
    }
}

setupFloridaSlots();