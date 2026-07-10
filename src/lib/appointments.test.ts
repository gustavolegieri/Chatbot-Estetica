import test from "node:test";
import assert from "node:assert/strict";
import { buildAvailableSlotsForDay, parseTimeSelection } from "./appointments";

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

test("parseTimeSelection accepts numeric indices and free-text clock times", () => {
  const slots = [
    "08:00",
    "08:30",
    "09:00",
    "09:30",
    "10:00",
    "10:30",
    "11:00",
    "11:30",
    "12:00",
    "12:30",
    "13:00",
    "13:30",
    "14:00",
    "16:30",
  ];

  assert.equal(parseTimeSelection("14", slots), "16:30");
  assert.equal(parseTimeSelection("16:30", slots), "16:30");
  assert.equal(parseTimeSelection("16h30", slots), "16:30");
  assert.equal(parseTimeSelection("as 16:30", slots), "16:30");
  assert.equal(parseTimeSelection("16:45", slots), null);
  assert.equal(parseTimeSelection("amanhã", slots), null);
});
