const db = require("../db/connection");
const { v4: uuidv4 } = require('uuid');

async function setupFinalSlots() {
    try {
        console.log("FINAL SLOT SETUP - Florida Timezone with Location\n");

        // Step 1: Add location column if it doesn't exist
        console.log("1. Adding location column to slots table...");
        await db.query(`
            ALTER TABLE slots
            ADD COLUMN IF NOT EXISTS location VARCHAR(255) DEFAULT 'RES General Hospital';
        `);
        console.log("✓ Location column added/verified\n");

        // Step 2: Clear ALL existing slots
        console.log("2. Clearing ALL existing slots...");
        await db.query("DELETE FROM slots");
        console.log("✓ All slots cleared\n");

        // Step 3: Define locations for testing
        const locations = [
            'RES General Hospital',
            'Precision Imaging Center - Miami',
            'Precision Imaging Center - Tampa'
        ];

        // Step 4: Create slots for next 7 days
        console.log("3. Creating slots for DEXA, MRI, Open MRI, and Open Upright MRI...\n");

        const today = new Date();
        let totalSlotsCreated = 0;

        for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
            const targetDate = new Date(today);
            targetDate.setDate(targetDate.getDate() + dayOffset);
            const dateStr = targetDate.toISOString().split('T')[0];

            console.log(`Creating slots for ${dateStr}:`);
            let daySlotsCreated = 0;

            // For each location
            for (const location of locations) {

                // MRI SLOTS - EXACTLY 3 per day per location (1 hour each)
                // 8-9 AM, 12-1 PM, 3-4 PM Florida Time
                const mriTypes = ['MRI', 'Open MRI', 'Open Upright MRI'];
                const mriSlots = [
                    { hour: 8 },   // 8-9 AM
                    { hour: 12 },  // 12-1 PM
                    { hour: 15 }   // 3-4 PM
                ];

                for (const mriType of mriTypes) {
                    for (const slot of mriSlots) {
                        // Create timestamp in Florida time (EST = UTC-5)
                        const startTime = new Date(targetDate);
                        startTime.setHours(slot.hour + 5, 0, 0, 0); // Add 5 for EST to UTC

                        const endTime = new Date(startTime);
                        endTime.setHours(endTime.getHours() + 1); // 1 hour duration

                        await db.query(`
                            INSERT INTO slots (slot_id, start_time, end_time, service_type, location, status)
                            VALUES ($1, $2, $3, $4, $5, $6)
                        `, [
                            uuidv4(),
                            startTime.toISOString(),
                            endTime.toISOString(),
                            mriType,
                            location,
                            'available'
                        ]);
                        daySlotsCreated++;
                    }
                }

                // DEXA SLOTS - 15 minute duration
                // Windows: 8-10 AM, 12-2 PM, 3-5 PM Florida Time
                const dexaWindows = [
                    { startHour: 8, endHour: 10 },   // 8-10 AM
                    { startHour: 12, endHour: 14 },  // 12-2 PM
                    { startHour: 15, endHour: 17 }   // 3-5 PM
                ];

                for (const window of dexaWindows) {
                    for (let hour = window.startHour; hour < window.endHour; hour++) {
                        for (let minutes = 0; minutes < 60; minutes += 15) {
                            const startTime = new Date(targetDate);
                            startTime.setHours(hour + 5, minutes, 0, 0); // Add 5 for EST to UTC

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
                            daySlotsCreated++;
                        }
                    }
                }
            }

            console.log(`  Created ${daySlotsCreated} slots for ${dateStr}`);
            totalSlotsCreated += daySlotsCreated;
        }

        console.log(`\n✓ Created ${totalSlotsCreated} total slots\n`);

        // Step 5: Verify the setup
        console.log("4. Verifying slot creation:\n");

        // Check slot counts by service and location
        const slotCounts = await db.query(`
            SELECT service_type, location,
                   COUNT(*) as total_count,
                   COUNT(*) / 7 as slots_per_day
            FROM slots
            WHERE status = 'available'
            GROUP BY service_type, location
            ORDER BY service_type, location;
        `);

        console.log("Slots per day by service and location:");
        let currentService = '';
        slotCounts.rows.forEach(row => {
            if (currentService !== row.service_type) {
                currentService = row.service_type;
                console.log(`\n${currentService}:`);
            }
            console.log(`  ${row.location}: ${row.slots_per_day} slots/day`);
        });

        // Show tomorrow's MRI slots at RES General Hospital
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const mriSlots = await db.query(`
            SELECT service_type,
                   TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as start_time,
                   TO_CHAR(end_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as end_time,
                   location
            FROM slots
            WHERE DATE(start_time AT TIME ZONE 'UTC') = DATE($1)
            AND service_type IN ('MRI', 'Open MRI', 'Open Upright MRI')
            AND location = 'RES General Hospital'
            AND status = 'available'
            ORDER BY service_type, start_time;
        `, [tomorrow.toISOString()]);

        console.log(`\nMRI slots for tomorrow at RES General Hospital (Florida Time):`);
        mriSlots.rows.forEach(slot => {
            console.log(`  ${slot.service_type}: ${slot.start_time} - ${slot.end_time}`);
        });

        // Test query for availability API
        console.log("\nTesting availability query (Open MRI at RES General Hospital):");
        const testQuery = await db.query(`
            SELECT slot_id,
                   TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'YYYY-MM-DD HH12:MI AM') as appointment_time,
                   service_type,
                   location
            FROM slots
            WHERE start_time >= NOW()
            AND start_time <= NOW() + INTERVAL '7 days'
            AND LOWER(service_type) = LOWER('Open MRI')
            AND location = 'RES General Hospital'
            AND LOWER(status) = 'available'
            ORDER BY start_time
            LIMIT 3;
        `);

        testQuery.rows.forEach(slot => {
            console.log(`  ${slot.appointment_time} - ${slot.service_type} at ${slot.location}`);
        });

        console.log("\n✅ FINAL SLOT SETUP COMPLETED!");
        console.log("\n📍 SUMMARY:");
        console.log("- Services: Dexa, MRI, Open MRI, Open Upright MRI");
        console.log("- Locations: 3 locations (RES General Hospital + 2 Precision Centers)");
        console.log("- MRI Types: 3 slots/day per location (8-9AM, 12-1PM, 3-4PM)");
        console.log("- Dexa: 24 slots/day per location (15-min slots in 3 windows)");
        console.log("- All times stored in UTC, displayed in Florida timezone");
        console.log("- Location column added for filtering!");

    } catch (error) {
        console.error("\n❌ Error setting up slots:", error.message);
        console.error(error);
    } finally {
        process.exit(0);
    }
}

setupFinalSlots();