import { phoneToWhatsApp } from "./utils";

interface SendTextParams {
  number: string;
  text: string;
}

interface ButtonOption {
  id: string;
  displayText: string;
}

interface SendButtonsParams {
  number: string;
  title: string;
  description: string;
  footer?: string;
  buttons: ButtonOption[];
}

function getConfig() {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE_NAME;

  if (!url || !key || !instance) {
    return null;
  }

  return { url: url.replace(/\/$/, ""), key, instance };
}

async function evolutionFetch(endpoint: string, body: object) {
  const config = getConfig();
  if (!config) {
    console.warn("[Evolution API] Não configurada - mensagem simulada:", body);
    return { simulated: true };
  }

  const response = await fetch(
    `${config.url}/message/send${endpoint}/${config.instance}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.key,
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Evolution API error: ${response.status} - ${text}`);
  }

  return response.json();
}

export async function sendText({ number, text }: SendTextParams) {
  return evolutionFetch("Text", {
    number: phoneToWhatsApp(number),
    text,
  });
}

export async function sendButtons({
  number,
  title,
  description,
  footer,
  buttons,
}: SendButtonsParams) {
  return evolutionFetch("Buttons", {
    number: phoneToWhatsApp(number),
    title,
    description,
    footer: footer ?? "",
    buttons: buttons.map((b) => ({
      type: "reply",
      buttonId: b.id,
      buttonText: { displayText: b.displayText },
    })),
  });
}

export async function sendList({
  number,
  title,
  description,
  buttonText,
  sections,
}: {
  number: string;
  title: string;
  description: string;
  buttonText: string;
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
}) {
  return evolutionFetch("List", {
    number: phoneToWhatsApp(number),
    title,
    description,
    buttonText,
    sections,
  });
}
