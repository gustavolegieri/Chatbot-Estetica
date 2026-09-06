/**
 * Adaptador de provedor de WhatsApp.
 *
 * O corpo das mensagens no código foi escrito no formato da WasenderAPI
 * (`{ to, text, imageUrl, ... }`). Este módulo traduz esse formato para o
 * provedor ativo, de modo que trocar de API seja uma variável de ambiente e não
 * uma refatoração. Motivo da existência: a Wasender não envia botões — só
 * "1 — opção" em texto —, e o botão é justamente o que reduz atrito nas etapas
 * de escolher horário e confirmar reserva.
 *
 * `WHATSAPP_PROVIDER=zapster|wasender` (padrão: wasender).
 */

import { fitButtonLabel, fitRowDescription, fitRowTitle } from "./whatsapp-list-text";

export type WhatsAppProvider = "wasender" | "zapster" | "wafly";

/** Item de lista de opções. A Wafly aceita bem mais que os 3 do botão. */
export type ProviderListOption = {
  id: string;
  title: string;
  description?: string;
};

/** Botão de resposta. A Zapster aceita no máximo 3 por mensagem. */
export type ProviderButton = {
  id: string;
  label: string;
  type?: "reply" | "url" | "call" | "copyable";
  url?: string;
  phoneNumber?: string;
  copyCode?: string;
};

/** Corpo canônico, no formato histórico da Wasender. */
export type OutboundBody = {
  to?: string;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  documentUrl?: string;
  buttons?: ProviderButton[];
  /** Lista de opções (menu longo). Só a Wafly suporta. */
  listOptions?: ProviderListOption[];
  listTitle?: string;
  listButtonLabel?: string;
  [key: string]: unknown;
};

export const ZAPSTER_MAX_BUTTONS = 3;

export function activeProvider(): WhatsAppProvider {
  const valor = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  if (valor === "zapster") return "zapster";
  if (valor === "wafly") return "wafly";
  return "wasender";
}

export function providerSupportsButtons(provider = activeProvider()): boolean {
  return provider === "zapster" || provider === "wafly";
}

/** Lista de opções (mais de 3 itens) existe só na Wafly. */
export function providerSupportsLists(provider = activeProvider()): boolean {
  return provider === "wafly";
}

export function providerApiKey(provider = activeProvider()): string | null {
  const key =
    provider === "zapster"
      ? process.env.ZAPSTER_API_KEY?.trim()
      : provider === "wafly"
        ? process.env.WAFLY_TOKEN?.trim()
        : process.env.WASENDER_API_KEY?.trim();
  return key || null;
}

function waflyBase(): string {
  return (process.env.WAFLY_BASE_URL?.trim() || "https://wafly.com.br/api-bridge-whats").replace(/\/$/, "");
}

/**
 * Além do token no caminho, a Wafly exige o header `Client-Token` — sem ele a
 * API responde 400 "Client-Token not found in the request header". Na conta
 * testada o valor é o mesmo token da instância; `WAFLY_CLIENT_TOKEN` permite
 * separar os dois caso a conta use um token de segurança próprio.
 */
function waflyHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Client-Token": process.env.WAFLY_CLIENT_TOKEN?.trim() || token,
  };
}

/** A Wafly autentica pelo caminho: /instances/{instance}/token/{token}/{acao}. */
function waflyUrl(acao: string, token: string): string {
  const instancia = process.env.WAFLY_INSTANCE?.trim() ?? "";
  return `${waflyBase()}/instances/${instancia}/token/${token}/${acao}`;
}

function zapsterBase(): string {
  return (process.env.ZAPSTER_BASE_URL?.trim() || "https://api.zapsterapi.com/v1/wa").replace(/\/$/, "");
}

/** Somente dígitos — os dois provedores aceitam o número em formato internacional. */
function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export type ProviderRequest = {
  url: string;
  headers: Record<string, string>;
  body: string;
};

/**
 * Traduz o corpo canônico para a requisição do provedor ativo.
 * Não envia nada: quem faz a chamada continua sendo `wasenderFetch`, que é onde
 * mora a trava do modo de teste.
 */
export function buildProviderRequest(
  body: OutboundBody,
  apiKey: string,
  provider = activeProvider()
): ProviderRequest {
  if (provider === "zapster") {
    const instanceId = process.env.ZAPSTER_INSTANCE_ID?.trim();
    const payload: Record<string, unknown> = {
      recipient: digits(String(body.to ?? "")),
    };
    if (instanceId) payload.instance_id = instanceId;

    const mediaUrl = body.imageUrl || body.videoUrl || body.audioUrl || body.documentUrl;
    if (mediaUrl) {
      // Na Zapster a legenda vai dentro de `media`, não no `text` de topo.
      payload.media = { url: mediaUrl, ...(body.text ? { caption: body.text } : {}) };
    } else if (body.text) {
      payload.text = body.text;
    }

    if (body.buttons?.length) {
      payload.buttons = body.buttons.slice(0, ZAPSTER_MAX_BUTTONS).map((b) => ({
        type: b.type ?? "reply",
        label: fitButtonLabel(b.label),
        id: b.id,
        ...(b.url ? { url: b.url } : {}),
        ...(b.phoneNumber ? { phone_number: b.phoneNumber } : {}),
        ...(b.copyCode ? { copy_code: b.copyCode } : {}),
      }));
      payload.buttons_mode = "interactive";
    }

    return {
      url: `${zapsterBase()}/messages`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    };
  }

  if (provider === "wafly") {
    const phone = digits(String(body.to ?? ""));
    const mediaUrl = body.imageUrl || body.videoUrl || body.audioUrl || body.documentUrl;

    if (body.listOptions?.length) {
      return {
        url: waflyUrl("send-option-list", apiKey),
        headers: waflyHeaders(apiKey),
        // Formato Z-API (a Wafly é compatível): o texto vai em `message` e as
        // opções ficam aninhadas em `optionList`.
        body: JSON.stringify({
          phone,
          message: body.text ?? body.listTitle ?? "Escolha uma opção",
          optionList: {
            title: body.listTitle ?? "Opções",
            buttonLabel: body.listButtonLabel ?? "Ver opções",
            // O corte fica em `whatsapp-list-text`: cortar de novo aqui era o
            // que partia as palavras no meio.
            options: body.listOptions.map((o) => ({
              id: o.id,
              title: fitRowTitle(o.title),
              ...(o.description ? { description: fitRowDescription(o.description) } : {}),
            })),
          },
        }),
      };
    }

    if (body.buttons?.length) {
      // `send-button-actions` responde 200 mas entrega texto puro no aparelho.
      // Só `send-button-list` renderiza botão tocável nesta conta.
      return {
        url: waflyUrl("send-button-list", apiKey),
        headers: waflyHeaders(apiKey),
        body: JSON.stringify({
          phone,
          message: body.text ?? "",
          buttonList: {
            buttons: body.buttons.slice(0, ZAPSTER_MAX_BUTTONS).map((b) => ({
              id: b.id,
              label: fitButtonLabel(b.label),
            })),
          },
        }),
      };
    }

    if (mediaUrl) {
      // A família Z-API nomeia o campo da mídia pelo tipo (`image`, `audio`…).
      // `url` vai junto porque alguns bridges aceitam só esse nome.
      const [acao, campo] = body.imageUrl
        ? (["send-image", "image"] as const)
        : body.videoUrl
          ? (["send-video", "video"] as const)
          : body.audioUrl
            ? (["send-audio", "audio"] as const)
            : (["send-document", "document"] as const);
      return {
        url: waflyUrl(acao, apiKey),
        headers: waflyHeaders(apiKey),
        body: JSON.stringify({
          phone,
          [campo]: mediaUrl,
          url: mediaUrl,
          ...(body.audioUrl ? { viewOnce: false } : {}),
          ...(body.text ? { caption: body.text } : {}),
        }),
      };
    }

    return {
      url: waflyUrl("send-text", apiKey),
      headers: waflyHeaders(apiKey),
      body: JSON.stringify({ phone, message: body.text ?? "" }),
    };
  }

  // Wasender: o corpo já está no formato dela; botões não existem e são
  // rebaixados para texto numerado pelo chamador.
  const base = (process.env.WASENDER_BASE_URL || "https://wasenderapi.com/api").replace(/\/$/, "");
  const { buttons: _ignorado, ...resto } = body;
  return {
    url: `${base}/send-message`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(resto),
  };
}

/** Rebaixa botões para lista numerada, para provedores sem suporte interativo. */
export function buttonsAsNumberedText(text: string, buttons: ProviderButton[]): string {
  const linhas = buttons.map((b, i) => `*${i + 1}* — ${b.label}`);
  return [text, "", ...linhas].filter((l) => l !== undefined).join("\n");
}

/** Id da mensagem, qualquer que seja o provedor. */
export function extractProviderMessageId(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, any>;
  // Zapster: { message_id }
  if (typeof r.message_id === "string") return r.message_id;
  // Wafly: { messageId, instance }
  if (typeof r.messageId === "string" && r.messageId) return r.messageId;
  // Wasender: { data: { msgId } }
  const msgId = r.data?.msgId ?? r.data?.messageId;
  if (msgId !== undefined && msgId !== null) return String(msgId);
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Webhook de entrada                                                  */
/* ------------------------------------------------------------------ */

export type IncomingWebhookMessage = {
  provider: WhatsAppProvider;
  phone: string;
  text: string;
  messageId?: string;
  pushName?: string;
  buttonId?: string;
  /** Objeto cru da mensagem, para os extratores de áudio e mídia. */
  raw: Record<string, unknown>;
  timestampMs?: number;
  /** Áudio já descriptografado pelo provedor, pronto para transcrição. */
  audioUrl?: string;
  /** Imagem recebida (comprovante de PIX, foto do veículo). */
  imageUrl?: string;
  /** Mensagem enviada pelo próprio número conectado (autoteste). */
  fromMe?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Primeiro valor de string não vazio encontrado nos caminhos informados. */
function pick(source: Record<string, unknown>, caminhos: string[]): string | undefined {
  for (const caminho of caminhos) {
    let atual: unknown = source;
    for (const parte of caminho.split(".")) {
      atual = asRecord(atual)?.[parte];
      if (atual === undefined || atual === null) break;
    }
    if (typeof atual === "string" && atual.trim()) return atual.trim();
    if (typeof atual === "number") return String(atual);
  }
  return undefined;
}

/**
 * Normaliza o webhook da Zapster (`{ id, type, created_at, data }`).
 *
 * A documentação pública não detalha os campos de `data`, então a extração é
 * defensiva: tenta os nomes mais prováveis e devolve o objeto cru para
 * inspeção. O primeiro webhook real confirma o formato — por isso o
 * `logUnknownShape`.
 */
export function parseZapsterWebhook(payload: unknown): IncomingWebhookMessage | null {
  const root = asRecord(payload);
  if (!root) return null;

  const type = typeof root.type === "string" ? root.type : "";
  if (type && type !== "message.received") return null;

  const data = asRecord(root.data) ?? root;
  const message = asRecord(data.message) ?? data;

  const phone =
    pick(data, ["from", "sender", "chat_id", "chat", "recipient", "phone", "sender_id"]) ??
    pick(message, ["from", "sender", "phone"]);
  if (!phone) return null;

  const text =
    pick(message, ["text", "body", "content", "caption", "conversation"]) ??
    pick(data, ["text", "body", "content"]) ??
    "";

  const buttonId =
    pick(message, ["button.id", "button_id", "selected_id", "reply.id"]) ??
    pick(data, ["button.id", "button_id", "selected_id"]);

  const timestamp = pick(data, ["timestamp", "created_at"]) ?? pick(root, ["created_at"]);
  const timestampMs = timestamp
    ? /^\d+$/.test(timestamp)
      ? Number(timestamp) * (timestamp.length <= 10 ? 1000 : 1)
      : Date.parse(timestamp) || undefined
    : undefined;

  return {
    provider: "zapster",
    // Só dígitos: `from` costuma vir como "5511999999999@s.whatsapp.net".
    phone: digits(phone.split("@")[0]),
    text,
    messageId: pick(data, ["id", "message_id", "key.id"]) ?? pick(root, ["id"]),
    pushName: pick(data, ["push_name", "pushName", "sender_name", "contact.name", "notify"]),
    buttonId,
    raw: message,
    timestampMs,
  };
}

/**
 * Normaliza o webhook da Wafly. O formato segue a família Z-API: campos de
 * topo `phone`/`text.message`, e a escolha de botão ou de lista chega em
 * `buttonsResponseMessage` / `listResponseMessage`.
 *
 * A extração é defensiva porque a documentação pública não fixa os nomes; o
 * `logUnknownShape` registra o payload cru no primeiro webhook real.
 */
export function parseWaflyWebhook(payload: unknown): IncomingWebhookMessage | null {
  const root = asRecord(payload);
  if (!root) return null;

  // Eventos de status de entrega não trazem mensagem.
  if (typeof root.type === "string" && root.type !== "ReceivedCallback") return null;
  if (root.status !== undefined && root.phone === undefined) return null;

  // Grupo, lista de transmissão, canal e aviso de sistema chegam no mesmo
  // formato de uma conversa. Sem este filtro o bot respondia dentro do grupo —
  // e com `phone` valendo o id do grupo, abria uma sessão de atendimento falsa.
  if (
    root.isGroup === true ||
    root.isNewsletter === true ||
    root.broadcast === true ||
    root.isStatusReply === true ||
    root.notification !== undefined ||
    root.participantPhone !== undefined ||
    root.reaction !== undefined
  ) {
    return null;
  }

  // `connectedPhone` é o número da própria instância. Usá-lo como remetente
  // fazia o bot iniciar uma conversa consigo mesmo em qualquer payload sem
  // `phone`.
  const phoneBruto = pick(root, ["phone", "from", "sender", "chatId"]) ?? "";
  if (!phoneBruto) return null;

  const text =
    pick(root, [
      "text.message",
      "message",
      "body",
      "text",
      "image.caption",
      "audio.caption",
      // O rótulo tocado pelo cliente também é conteúdo: quando o id da opção
      // não é reconhecido, é ele que a etapa consegue interpretar.
      "buttonsResponseMessage.message",
      "listResponseMessage.title",
      "listResponseMessage.message",
    ]) ?? "";

  const buttonId =
    pick(root, [
      "buttonsResponseMessage.buttonId",
      "buttonsResponseMessage.id",
      "listResponseMessage.selectedRowId",
      "listResponseMessage.id",
      "buttonReply.id",
      "selectedRowId",
      "selectedButtonId",
    ]) ?? undefined;

  const timestamp = pick(root, ["momment", "moment", "timestamp", "messageTimestamp"]);
  const timestampMs = timestamp
    ? /^\d+$/.test(timestamp)
      ? Number(timestamp) * (timestamp.length <= 10 ? 1000 : 1)
      : Date.parse(timestamp) || undefined
    : undefined;

  // A Wafly entrega a mídia já descriptografada em uma URL pública, ao
  // contrário da Wasender, que exige uma chamada extra de decrypt.
  const audioUrl = pick(root, ["audio.audioUrl", "audio.url", "audio.mediaUrl", "ptt.audioUrl"]);
  const imageUrl = pick(root, ["image.imageUrl", "image.url", "image.mediaUrl"]);

  return {
    provider: "wafly",
    phone: digits(phoneBruto.split("@")[0]),
    text,
    messageId: pick(root, ["messageId", "id"]),
    pushName: pick(root, ["senderName", "chatName", "pushName", "notifyName"]),
    buttonId,
    raw: root,
    timestampMs,
    audioUrl,
    imageUrl,
    fromMe: root.fromMe === true,
  };
}

/**
 * Registra uma vez o formato bruto recebido, para confirmar os nomes de campo
 * sem depender da documentação. Some assim que o parsing estiver validado.
 */
export function logUnknownShape(tag: string, payload: unknown): void {
  if (process.env.WHATSAPP_WEBHOOK_DEBUG !== "true") return;
  try {
    console.log(`[Webhook/${tag}] payload cru:`, JSON.stringify(payload).slice(0, 2500));
  } catch {
    console.log(`[Webhook/${tag}] payload cru não serializável`);
  }
}
