import assert from "node:assert/strict";
import test from "node:test";
import { generateCalendarSVG, type CalendarData, type DayInfo } from "./calendar-core";
import { generateCalendarLegend } from "./calendar-helper";

test("calendar renders all days in their real weekday and embeds its font", () => {
  const days: DayInfo[] = Array.from({ length: 31 }, (_, index) => ({
    date: new Date(2026, 7, index + 1),
    day: index + 1,
    iso: `2026-08-${String(index + 1).padStart(2, "0")}`,
    weekday: new Date(2026, 7, index + 1).getDay(),
    occupancy: index + 1 === 18 ? "today" : "green",
    slotsTotal: 16,
    slotsBooked: 0,
  }));
  const data: CalendarData = {
    year: 2026,
    month: 7,
    monthLabel: "agosto de 2026",
    days,
    occupancyMap: Object.fromEntries(days.map((day) => [day.day, day])),
  };

  const svg = generateCalendarSVG(data);
  assert.match(svg, /font\/truetype;base64,/);
  assert.match(svg, /x="515"[^>]*>1<\/text>/);
  assert.match(svg, /x="135"[^>]*>31<\/text>/);
  assert.match(svg, />Mais movimentado<\/text>/);
  assert.doesNotMatch(generateCalendarLegend(), /Ver dias/i);
});
