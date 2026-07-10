import test from "node:test";
import assert from "node:assert/strict";
import { buildAvailableSlotsForDay } from "./appointments";

test("buildAvailableSlotsForDay skips lunch breaks and existing bookings", () => {
  const slots = buildAvailableSlotsForDay({
    dateStr: "2026-07-06",
    durationMin: 60,
    settings: {
      businessHoursStart: "09:00",
      businessHoursEnd: "17:00",
      lunchBreakStart: "12:00",
      lunchBreakEnd: "13:00",
      slotDurationMin: 60,
      workingDays: "1,2,3,4,5",
    },
    existingAppointments: [{ startTime: "09:00", endTime: "10:00" }],
    now: new Date("2026-07-06T08:00:00"),
  });

  assert.deepEqual(slots, ["10:00", "11:00", "13:00", "14:00", "15:00", "16:00"]);
});
