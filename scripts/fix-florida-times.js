const db = require("../db/connection");
const { v4: uuidv4 } = require('uuid');

async function fixFloridaTimes() {
    try {
        console.log("FIXING SLOTS WITH CORRECT FLORIDA TIMES\n");

        // Step 1: Clear ALL existing slots
        console.log("1. Clearing ALL existing slots...");
        await db.query("DELETE FROM slots");
        console.log("✓ All slots cleared\n");

        // Step 2: Ensure location column exists
        console.log("2. Ensuring location column exists...");
        await db.query(`
            ALTER TABLE slots
            ADD COLUMN IF NOT EXISTS location VARCHAR(255) DEFAULT 'RES General Hospital';
        `);
        console.log("✓ Location column verified\n");

        // Step 3: Create slots
        console.log("3. Creating slots with CORRECT Florida times...\n");

        const locations = ['RES General Hospital'];  // Simplified to one location for testing
        let totalCreated = 0;

        // Create slots for next 7 days
        for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
            const baseDate = new Date();
            baseDate.setDate(baseDate.getDate() + dayOffset);
            const dateStr = baseDate.toISOString().split('T')[0];

            console.log(`Day ${dayOffset}: ${dateStr}`);

            for (const location of locations) {
                // MRI SLOTS - 3 per day (8AM, 12PM, 3PM Florida time)
                // Florida is UTC-5 in winter (EST)
                // So 8AM Florida = 1PM UTC (13:00)
                // 12PM Florida = 5PM UTC (17:00)
                // 3PM Florida = 8PM UTC (20:00)

                const mriTypes = ['MRI', 'Open MRI', 'Open Upright MRI'];
                const mriSlotTimesUTC = [
                    { startHour: 13, endHour: 14 },  // 8-9 AM Florida = 13-14 UTC
                    { startHour: 17, endHour: 18 },  // 12-1 PM Florida = 17-18 UTC
                    { startHour: 20, endHour: 21 }   // 3-4 PM Florida = 20-21 UTC
                ];

                for (const mriType of mriTypes) {
                    for (const slot of mriSlotTimesUTC) {
                        const startTime = new Date(`${dateStr}T${String(slot.startHour).padStart(2, '0')}:00:00Z`);
                        const endTime = new Date(`${dateStr}T${String(slot.endHour).padStart(2, '0')}:00:00Z`);

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
                        totalCreated++;
                    }
                }

                // DEXA SLOTS - 15 minute slots
                // 8-10AM, 12-2PM, 3-5PM Florida time
                const dexaWindowsUTC = [
                    { startHour: 13, endHour: 15 },  // 8-10 AM Florida = 13-15 UTC
                    { startHour: 17, endHour: 19 },  // 12-2 PM Florida = 17-19 UTC
                    { startHour: 20, endHour: 22 }   // 3-5 PM Florida = 20-22 UTC
                ];

                for (const window of dexaWindowsUTC) {
                    for (let hour = window.startHour; hour < window.endHour; hour++) {
                        for (let minutes = 0; minutes < 60; minutes += 15) {
                            const startTime = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00Z`);
                            const endTime = new Date(startTime.getTime() + 15 * 60 * 1000);

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
                            totalCreated++;
                        }
                    }
                }
            }
        }

        console.log(`\n✓ Created ${totalCreated} total slots\n`);

        // Step 4: Verify
        console.log("4. Verifying correct times:\n");

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        const verify = await db.query(`
            SELECT service_type,
                   TO_CHAR(start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') as florida_time,
                   TO_CHAR(start_time AT TIME ZONE 'UTC', 'HH24:MI') as utc_time
            FROM slots
            WHERE DATE(start_time AT TIME ZONE 'UTC') = $1
            AND service_type IN ('MRI', 'Dexa')
            ORDER BY service_type, start_time
            LIMIT 15;
        `, [tomorrowStr]);

        console.log("Sample slots for tomorrow:");
        verify.rows.forEach(slot => {
            console.log(`  ${slot.service_type}: ${slot.florida_time} Florida (${slot.utc_time} UTC)`);
        });

        console.log("\n✅ SLOTS FIXED WITH CORRECT FLORIDA TIMES!");
        console.log("\nSUMMARY:");
        console.log("- MRI/Open MRI/Open Upright MRI: 8AM, 12PM, 3PM Florida time");
        console.log("- Dexa: 15-min slots from 8-10AM, 12-2PM, 3-5PM Florida time");
        console.log("- Location: RES General Hospital");
        console.log("- All times correctly stored as UTC and display in Florida timezone");

    } catch (error) {
        console.error("\n❌ Error:", error.message);
    } finally {
        process.exit(0);
    }
}

fixFloridaTimes();