import assert from "node:assert/strict";
import test from "node:test";
import {
  ZAPSTER_MAX_BUTTONS,
  activeProvider,
  buildProviderRequest,
  buttonsAsNumberedText,
  extractProviderMessageId,
  parseWaflyWebhook,
  parseZapsterWebhook,
  providerSupportsButtons,
  providerSupportsLists,
} from "./whatsapp-provider";

function comEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const antes: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    antes[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("o provedor padrão continua sendo a Wasender", () => {
  comEnv({ WHATSAPP_PROVIDER: undefined }, () => {
    assert.equal(activeProvider(), "wasender");
    assert.equal(providerSupportsButtons(), false);
  });
});

test("só a Zapster anuncia suporte a botões", () => {
  comEnv({ WHATSAPP_PROVIDER: "zapster" }, () => {
    assert.equal(activeProvider(), "zapster");
    assert.equal(providerSupportsButtons(), true);
  });
});

test("texto simples vira o payload da Zapster", () => {
  comEnv({ WHATSAPP_PROVIDER: "zapster", ZAPSTER_INSTANCE_ID: "abc123" }, () => {
    const req = buildProviderRequest({ to: "+55 11 94440-0696", text: "oi" }, "token");
    assert.equal(req.url, "https://api.zapsterapi.com/v1/wa/messages");
    assert.equal(req.headers.Authorization, "Bearer token");
    assert.deepEqual(JSON.parse(req.body), {
      recipient: "5511944400696",
      instance_id: "abc123",
      text: "oi",
    });
  });
});

test("mídia da Zapster leva a legenda dentro de media", () => {
  comEnv({ WHATSAPP_PROVIDER: "zapster", ZAPSTER_INSTANCE_ID: "abc123" }, () => {
    const req = buildProviderRequest(
      { to: "5511944400696", text: "olha isso", imageUrl: "https://x/y.jpg" },
      "token"
    );
    const body = JSON.parse(req.body);
    assert.deepEqual(body.media, { url: "https://x/y.jpg", caption: "olha isso" });
    assert.equal(body.text, undefined);
  });
});

test("botões respeitam o limite de 3 e o corte de 20 caracteres", () => {
  comEnv({ WHATSAPP_PROVIDER: "zapster" }, () => {
    const req = buildProviderRequest(
      {
        to: "5511944400696",
        text: "Escolha",
        buttons: [
          { id: "1", label: "sexta 05/09 às 09:00 horas da manhã" },
          { id: "2", label: "sábado 08:00" },
          { id: "3", label: "Outro horário" },
          { id: "4", label: "Este não deve ir" },
        ],
      },
      "token"
    );
    const body = JSON.parse(req.body);
    assert.equal(body.buttons.length, ZAPSTER_MAX_BUTTONS);
    assert.ok(body.buttons.every((b: { label: string }) => b.label.length <= 20));
    assert.equal(body.buttons_mode, "interactive");
    assert.equal(body.buttons[0].type, "reply");
  });
});

test("a Wasender continua recebendo o corpo antigo e sem botões", () => {
  comEnv({ WHATSAPP_PROVIDER: "wasender" }, () => {
    const req = buildProviderRequest(
      { to: "5511944400696", text: "oi", buttons: [{ id: "1", label: "sim" }] },
      "token"
    );
    assert.match(req.url, /wasenderapi\.com\/api\/send-message$/);
    const body = JSON.parse(req.body);
    assert.equal(body.to, "5511944400696");
    assert.equal(body.buttons, undefined);
  });
});

test("o rebaixamento numera as opções", () => {
  const texto = buttonsAsNumberedText("Escolha:", [
    { id: "1", label: "sexta 09:00" },
    { id: "2", label: "sábado 08:00" },
  ]);
  assert.match(texto, /\*1\* — sexta 09:00/);
  assert.match(texto, /\*2\* — sábado 08:00/);
});

test("extrai o id da mensagem nos dois formatos", () => {
  assert.equal(extractProviderMessageId({ message_id: "3EB0" }), "3EB0");
  assert.equal(extractProviderMessageId({ data: { msgId: 76835033 } }), "76835033");
  assert.equal(extractProviderMessageId(null), undefined);
});

test("webhook da Zapster: texto simples", () => {
  const evento = {
    id: "evt_1",
    type: "message.received",
    created_at: "2026-09-04T14:00:00Z",
    data: {
      id: "msg_1",
      from: "5511944400696@s.whatsapp.net",
      push_name: "Gustavo",
      message: { text: "quero agendar" },
    },
  };
  const r = parseZapsterWebhook(evento);
  assert.equal(r?.phone, "5511944400696");
  assert.equal(r?.text, "quero agendar");
  assert.equal(r?.pushName, "Gustavo");
  assert.equal(r?.messageId, "msg_1");
});

test("webhook da Zapster: resposta de botão", () => {
  const r = parseZapsterWebhook({
    type: "message.received",
    data: { from: "5511944400696", message: { button_id: "2", text: "sábado 08:00" } },
  });
  assert.equal(r?.buttonId, "2");
  assert.equal(r?.phone, "5511944400696");
});

test("ignora eventos que não são mensagem recebida", () => {
  assert.equal(parseZapsterWebhook({ type: "message.sent", data: { from: "551199" } }), null);
  assert.equal(parseZapsterWebhook({ type: "instance.connected", data: {} }), null);
});

test("devolve null quando não há telefone", () => {
  assert.equal(parseZapsterWebhook({ type: "message.received", data: { message: { text: "oi" } } }), null);
  assert.equal(parseZapsterWebhook("texto"), null);
});

test("Wafly: texto usa send-text com Client-Token", () => {
  comEnv(
    { WHATSAPP_PROVIDER: "wafly", WAFLY_INSTANCE: "INST1", WAFLY_CLIENT_TOKEN: undefined },
    () => {
      const req = buildProviderRequest({ to: "+55 11 94440-0696", text: "oi" }, "TOK1");
      assert.match(req.url, /\/instances\/INST1\/token\/TOK1\/send-text$/);
      // Sem este header a API responde 400 "Client-Token not found".
      assert.equal(req.headers["Client-Token"], "TOK1");
      assert.deepEqual(JSON.parse(req.body), { phone: "5511944400696", message: "oi" });
    }
  );
});

test("Wafly: botões vão para send-button-list", () => {
  comEnv({ WHATSAPP_PROVIDER: "wafly", WAFLY_INSTANCE: "INST1" }, () => {
    const req = buildProviderRequest(
      {
        to: "5511944400696",
        text: "Escolha",
        buttons: [
          { id: "1", label: "sexta 09:00" },
          { id: "2", label: "sábado 08:00" },
        ],
      },
      "TOK1"
    );
    // `send-button-actions` responde 200 mas chega como texto puro no aparelho.
    assert.match(req.url, /send-button-list$/);
    const body = JSON.parse(req.body);
    assert.equal(body.message, "Escolha");
    assert.deepEqual(body.buttonList.buttons, [
      { id: "1", label: "sexta 09:00" },
      { id: "2", label: "sábado 08:00" },
    ]);
  });
});

test("Wafly: lista usa o formato aninhado optionList", () => {
  comEnv({ WHATSAPP_PROVIDER: "wafly", WAFLY_INSTANCE: "INST1" }, () => {
    const req = buildProviderRequest(
      {
        to: "5511944400696",
        text: "Qual serviço?",
        listTitle: "Serviços",
        listButtonLabel: "Ver",
        listOptions: [{ id: "a", title: "Lavagem Simples", description: "R$ 55" }],
      },
      "TOK1"
    );
    assert.match(req.url, /send-option-list$/);
    const body = JSON.parse(req.body);
    // O texto vai em `message`; sem ele a API responde 400.
    assert.equal(body.message, "Qual serviço?");
    assert.equal(body.optionList.buttonLabel, "Ver");
    assert.equal(body.optionList.options[0].title, "Lavagem Simples");
  });
});

test("Wafly: só a lista suporta mais de 3 opções", () => {
  comEnv({ WHATSAPP_PROVIDER: "wafly" }, () => {
    assert.equal(providerSupportsLists(), true);
  });
  comEnv({ WHATSAPP_PROVIDER: "zapster" }, () => {
    assert.equal(providerSupportsLists(), false);
  });
});

test("webhook da Wafly: texto e resposta de lista", () => {
  const texto = parseWaflyWebhook({
    phone: "5511944400696",
    senderName: "Gustavo",
    messageId: "abc",
    text: { message: "quero agendar" },
  });
  assert.equal(texto?.phone, "5511944400696");
  assert.equal(texto?.text, "quero agendar");
  assert.equal(texto?.pushName, "Gustavo");

  const lista = parseWaflyWebhook({
    phone: "5511944400696",
    listResponseMessage: { selectedRowId: "cat_1" },
  });
  assert.equal(lista?.buttonId, "cat_1");
});

test("webhook da Wafly marca a mensagem do próprio número em vez de descartar", () => {
  // O número de teste é o mesmo da instância: o autoteste acontece no autochat,
  // então quem decide se é eco do bot é a checagem de mensagens já enviadas.
  const recebida = parseWaflyWebhook({
    phone: "5511944400696",
    fromMe: true,
    text: { message: "oi" },
  });
  assert.equal(recebida?.fromMe, true);
  assert.equal(recebida?.text, "oi");
});

test("webhook da Wafly entrega o áudio já descriptografado", () => {
  const recebida = parseWaflyWebhook({
    phone: "5511944400696",
    messageId: "ABC",
    audio: { audioUrl: "https://cdn.wafly/audio.ogg", mimeType: "audio/ogg" },
  });
  assert.equal(recebida?.audioUrl, "https://cdn.wafly/audio.ogg");
  assert.equal(recebida?.messageId, "ABC");
});

test("webhook da Wafly lê a opção escolhida na lista", () => {
  const recebida = parseWaflyWebhook({
    phone: "5511944400696",
    listResponseMessage: { selectedRowId: "2026-09-08 09:00", title: "Segunda 08/09 · 09:00" },
  });
  assert.equal(recebida?.buttonId, "2026-09-08 09:00");
});

test("webhook da Wafly ignora grupo, canal e aviso de sistema", () => {
  // Sem este filtro o bot respondia dentro do grupo e ainda abria uma sessão de
  // atendimento usando o id do grupo como se fosse o telefone do cliente.
  assert.equal(
    parseWaflyWebhook({ phone: "120363000000000000", isGroup: true, text: { message: "oi" } }),
    null
  );
  assert.equal(
    parseWaflyWebhook({ phone: "5511944400696", isNewsletter: true, text: { message: "oi" } }),
    null
  );
  assert.equal(
    parseWaflyWebhook({ phone: "5511944400696", broadcast: true, text: { message: "oi" } }),
    null
  );
  assert.equal(
    parseWaflyWebhook({ phone: "120363000000000000", participantPhone: "5511944400696", text: { message: "oi" } }),
    null
  );
});

test("webhook da Wafly não usa o número da própria instância como remetente", () => {
  // `connectedPhone` é o número conectado. Como último candidato de `phone`, ele
  // fazia o bot iniciar uma conversa consigo mesmo em payloads sem remetente.
  assert.equal(parseWaflyWebhook({ connectedPhone: "5511944400696", text: { message: "oi" } }), null);
});

test("webhook da Wafly guarda o rótulo tocado além do id da opção", () => {
  // Quando o id não é reconhecido pela etapa, o texto da linha é a única pista
  // que sobra para entender a escolha do cliente.
  const recebida = parseWaflyWebhook({
    phone: "5511944400696",
    listResponseMessage: { selectedRowId: "1", title: "Lavagem & cuidado externo" },
  });
  assert.equal(recebida?.buttonId, "1");
  assert.equal(recebida?.text, "Lavagem & cuidado externo");
});
