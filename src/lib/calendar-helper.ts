import { generateCalendarImage } from "./calendar-image";
import { sendMedia, sendList } from "./evolution-api";
import { format } from "date-fns";

/**
 * Sends a calendar image and an interactive list of up to 10 selectable days.
 * @param number WhatsApp number (in international format) to send the messages to.
 * @param prompts Optional prompt map – kept for signature compatibility.
 */
export async function sendCalendarWithImageAndList({ number, prompts }: { number: string; prompts?: any }) {
  const today = new Date();
  // Generate image and send (simulated when WASENDER_API_KEY not set)
  const imagePath = await generateCalendarImage(today);
  await sendMedia({ number, mediaUrl: imagePath, caption: "Calendário de disponibilidade" });

  // Build list of up to 10 future weekdays (skip Sundays and past dates)
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay(); // 0 = Sun

  const rows: { id: string; title: string; description?: string }[] = [];
  let day = 1;
  for (let i = 0; i < daysInMonth && rows.length < 10; i++) {
    const date = new Date(year, month, day);
    const col = (startOffset + i) % 7; // weekday index
    if (col === 0) { // Sunday – closed
      day++;
      continue;
    }
    if (date < today) { // past
      day++;
      continue;
    }
    const iso = format(date, "yyyy-MM-dd");
    rows.push({ id: iso, title: `${String(day).padStart(2, "0")} 🟢`, description: "Disponível" });
    day++;
  }

  if (rows.length === 0) {
    // No days available – nothing else to send
    return;
  }

  await sendList({
    number,
    title: "Selecione o dia",
    description: "Dias disponíveis (até 10).",
    buttonText: "Escolher",
    sections: [{ title: "Dias", rows }],
  });
}
