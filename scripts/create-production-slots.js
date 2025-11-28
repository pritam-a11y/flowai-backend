const db = require("../db/connection");
const { v4: uuidv4 } = require('uuid');

async function createProductionSlots() {
    try {
        console.log("CREATING PRODUCTION SLOTS - Florida Timezone\n");
        console.log("=====================================\n");

        // Step 1: Ensure location column exists
        console.log("1. Ensuring location column exists...");
        await db.query(`
            ALTER TABLE slots
            ADD COLUMN IF NOT EXISTS location VARCHAR(255);
        `);
        console.log("✓ Location column verified\n");

        // Step 2: Clear ALL existing slots
        console.log("2. Clearing ALL existing slots...");
        await db.query("DELETE FROM slots");
        console.log("✓ All slots cleared\n");

        // Step 3: Define locations for each service
        const DEXA_LOCATIONS = [
            'Gate Parkway',
            'Jacksonville Beach',
            'Fleming Island',
            'St Augustine'
        ];

        const MRI_LOCATIONS = [
            'Gate Parkway',
            'Jacksonville Beach',
            'Fleming Island',
            'St Augustine',
            'Mandarin',
            'Orlando'
        ];

        const OPEN_MRI_LOCATIONS = ['Gate Parkway'];

        // Time blocks as specified (in Florida time)
        // 8AM-10AM, 12PM-2PM, 3PM-5PM

        console.log("3. Creating slots...\n");
        console.log("Configuration:");
        console.log("- DEXA: 15-minute slots, 30 days, Locations:", DEXA_LOCATIONS.join(", "));
        console.log("- MRI: 20-minute slots, 30 days, Locations:", MRI_LOCATIONS.join(", "));
        console.log("- Open MRI: 20-minute slots, 30 days, Locations:", OPEN_MRI_LOCATIONS.join(", "));
        console.log("- Time blocks: 8-10AM, 12-2PM, 3-5PM Florida time\n");

        let totalSlotsCreated = 0;
        const today = new Date();

        // Create slots for next 30 days
        for (let dayOffset = 1; dayOffset <= 30; dayOffset++) {
            const targetDate = new Date(today);
            targetDate.setDate(targetDate.getDate() + dayOffset);
            targetDate.setHours(0, 0, 0, 0);
            targetDate.setMilliseconds(0);

            const dateStr = targetDate.toISOString().split('T')[0];
            let daySlots = 0;

            // DEXA SLOTS - 15 minute duration
            for (const location of DEXA_LOCATIONS) {
                // Time windows in Florida time: 8-10AM, 12-2PM, 3-5PM
                // Florida EST = UTC-5, so:
                // 8AM FL = 13:00 UTC, 10AM FL = 15:00 UTC
                // 12PM FL = 17:00 UTC, 2PM FL = 19:00 UTC
                // 3PM FL = 20:00 UTC, 5PM FL = 22:00 UTC

                const dexaWindows = [
                    { startHour: 13, endHour: 15 },  // 8-10AM Florida
                    { startHour: 17, endHour: 19 },  // 12-2PM Florida
                    { startHour: 20, endHour: 22 }   // 3-5PM Florida
                ];

                for (const window of dexaWindows) {
                    for (let hour = window.startHour; hour < window.endHour; hour++) {
                        for (let minutes = 0; minutes < 60; minutes += 15) {
                            const startTime = new Date(targetDate);
                            startTime.setUTCHours(hour, minutes, 0, 0);

                            const endTime = new Date(startTime);
                            endTime.setMinutes(endTime.getMinutes() + 15);

                            await db.query(`
                                INSERT INTO slots (slot_id, start_time, end_time, service_type, location, status)
                                VALUES ($1, $2, $3, $4, $5, $6)
                            `, [
                                uuidv4(),
                                startTime.toISOString(),
                                endTime.toISOString(),
                                'Dexa',
                                location,
                                'available'
                            ]);
                            daySlots++;
                            totalSlotsCreated++;
                        }
                    }
                }
            }

            // MRI SLOTS - 20 minute duration
            for (const location of MRI_LOCATIONS) {
                const mriWindows = [
                    { startHour: 13, endHour: 15 },  // 8-10AM Florida
                    { startHour: 17, endHour: 19 },  // 12-2PM Florida
                    { startHour: 20, endHour: 22 }   // 3-5PM Florida
                ];

                for (const window of mriWindows) {
                    for (let hour = window.startHour; hour < window.endHour; hour++) {
                        for (let minutes = 0; minutes < 60; minutes += 20) {
                            // Only create slots that fit within the hour
                            if (minutes + 20 <= 60) {
                                const startTime = new Date(targetDate);
                                startTime.setUTCHours(hour, minutes, 0, 0);

                                const endTime = new Date(startTime);
                                endTime.setMinutes(endTime.getMinutes() + 20);

                                await db.query(`
                                    INSERT INTO slots (slot_id, start_time, end_time, service_type, location, status)
                                    VALUES ($1, $2, $3, $4, $5, $6)
                                `, [
                                    uuidv4(),
                                    startTime.toISOString(),
                                    endTime.toISOString(),
                                    'MRI',
                                    location,
                                    'available'
                                ]);
                                daySlots++;
                                totalSlotsCreated++;
                            }
                        }
                    }
                }
            }

            // OPEN MRI SLOTS - 20 minute duration (Gate Parkway only)
            for (const location of OPEN_MRI_LOCATIONS) {
                const openMriWindows = [
                    { startHour: 13, endHour: 15 },  // 8-10AM Florida
                    { startHour: 17, endHour: 19 },  // 12-2PM Florida
                    { startHour: 20, endHour: 22 }   // 3-5PM Florida
                ];

                for (const window of openMriWindows) {
                    for (let hour = window.startHour; hour < window.endHour; hour++) {
                        for (let minutes = 0; minutes < 60; minutes += 20) {
                            // Only create slots that fit within the hour
                            if (minutes + 20 <= 60) {
                                const startTime = new Date(targetDate);
                                startTime.setUTCHours(hour, minutes, 0, 0);

                                const endTime = new Date(startTime);
                                endTime.setMinutes(endTime.getMinutes() + 20);

                                await db.query(`
                                    INSERT INTO slots (slot_id, start_time, end_time, service_type, location, status)
                                    VALUES ($1, $2, $3, $4, $5, $6)
                                `, [
                                    uuidv4(),
                                    startTime.toISOString(),
                                    endTime.toISOString(),
                                    'Open MRI',
                                    location,
                                    'available'
                                ]);
                                daySlots++;
                                totalSlotsCreated++;
                            }
                        }
                    }
                }
            }

            if (dayOffset % 5 === 0) {
                console.log(`  Day ${dayOffset}: Created ${daySlots} slots`);
            }
        }

        console.log(`\n✓ Created ${totalSlotsCreated} total slots\n`);

        // Step 4: Verify the setup
        console.log("4. Verifying slot creation:\n");

        // Summary by service and location
        const summary = await db.query(`
            SELECT service_type, location,
                   COUNT(*) as total_slots,
                   COUNT(DISTINCT DATE(start_time)) as days
            FROM slots
            GROUP BY service_type, location
            ORDER BY service_type, location;
        `);

        console.log("Slots created by service and location:");
        let currentService = '';
        summary.rows.forEach(row => {
            if (currentService !== row.service_type) {
                currentService = row.service_type;
                console.log(`\n${currentService}:`);
            }
            const slotsPerDay = Math.round(row.total_slots / row.days);
            console.log(`  ${row.location}: ${slotsPerDay} slots/day (${row.total_slots} total)`);
        });

        // Verify times are correct (sample tomorrow's slots)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const timeCheck = await db.query(`
            SELECT DISTINCT
                   service_type,
                   TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as florida_time,
                   location
            FROM slots
            WHERE DATE(start_time) = DATE($1)
            AND location IN ('Gate Parkway')
            ORDER BY service_type, start_time
            LIMIT 15;
        `, [tomorrow.toISOString()]);

        console.log("\nSample slots for tomorrow at Gate Parkway (Florida time):");
        let currentType = '';
        timeCheck.rows.forEach(slot => {
            if (currentType !== slot.service_type) {
                currentType = slot.service_type;
                console.log(`\n${currentType}:`);
            }
            console.log(`  ${slot.florida_time}`);
        });

        console.log("\n✅ PRODUCTION SLOTS CREATED SUCCESSFULLY!");
        console.log("\n📊 FINAL SUMMARY:");
        console.log(`- Total slots created: ${totalSlotsCreated}`);
        console.log("- DEXA: 15-min slots at 4 locations");
        console.log("- MRI: 20-min slots at 6 locations");
        console.log("- Open MRI: 20-min slots at Gate Parkway only");
        console.log("- Time blocks: 8-10AM, 12-2PM, 3-5PM Florida time");
        console.log("- Duration: 30 days of slots");

    } catch (error) {
        console.error("\n❌ Error creating slots:", error.message);
        console.error(error);
    } finally {
        process.exit(0);
    }
}

createProductionSlots();