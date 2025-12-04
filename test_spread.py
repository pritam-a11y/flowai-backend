import json
import requests
from datetime import datetime

# Test to see all slots being fetched
response = requests.post("http://localhost:3005/api/v1/retell/function-call",
    json={
        "name": "check_availability",
        "args": {
            "serviceType": "Dexa",
            "startTime": "2025-12-08T08:00:00-05:00",
            "location": "Gate Parkway"
        }
    }
)

data = response.json()
slots = data["result"]["availableSlots"]

print("Total slots returned:", len(slots))
print("\nSlots by hour (UTC):")
print("-" * 60)

for slot in slots[:21]:  # Show up to 21 slots
    utc_time = datetime.fromisoformat(slot["startTime"].replace("Z", "+00:00"))
    utc_hour = utc_time.hour
    est_hour = (utc_hour - 5) % 24  # Convert to EST

    time_block = ""
    if 13 <= utc_hour < 17:
        time_block = "MORNING (8-12 EST)"
    elif 17 <= utc_hour < 19:
        time_block = "AFTERNOON (12-2 EST)"
    elif 20 <= utc_hour < 22:
        time_block = "EVENING (3-5 EST)"
    else:
        time_block = "OUTSIDE RANGE"

    print(f"{utc_time.strftime('%Y-%m-%d %H:%M UTC')} | {est_hour:02d}:00 EST | {time_block}")

print("-" * 60)
print(f"\nExpected: up to 21 slots (3 per day for 7 days)")
print(f"Actual: {len(slots)} slots")