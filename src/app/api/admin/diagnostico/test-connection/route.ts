import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { activeProvider } from "@/lib/whatsapp-provider";

const WASENDER_BASE = process.env.WASENDER_BASE_URL || "https://wasenderapi.com/api";

/**
 * Estado da instância da Wafly: credencial, sessão e número conectado.
 *
 * `status` diz se a sessão está de pé e `device` devolve o telefone logado —
 * é ele que o painel precisa mostrar, porque um QR lido em outro aparelho
 * mantém a API respondendo 200 enquanto as mensagens saem do número errado.
 */
async function diagnosticarWafly() {
  const instancia = process.env.WAFLY_INSTANCE?.trim();
  const token = process.env.WAFLY_TOKEN?.trim();
  if (!instancia || !token) {
    return NextResponse.json({
      success: false,
      error: "WAFLY_INSTANCE ou WAFLY_TOKEN não configurados",
    });
  }

  const base = (process.env.WAFLY_BASE_URL?.trim() || "https://wafly.com.br/api-bridge-whats").replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    "Client-Token": process.env.WAFLY_CLIENT_TOKEN?.trim() || token,
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const resposta = await fetch(`${base}/instances/${instancia}/token/${token}/device`, {
      headers,
      signal: controller.signal,
    });
    const texto = await resposta.text();

    if (!resposta.ok) {
      return NextResponse.json({
        success: false,
        error: `Erro na API da Wafly: ${resposta.status} - ${texto.slice(0, 300)}`,
        status: resposta.status,
      });
    }

    const dados = JSON.parse(texto) as {
      phone?: string;
      connected?: boolean;
      smartphoneConnected?: boolean;
    };

    if (!dados.connected) {
      return NextResponse.json({
        success: false,
        error: "Instância da Wafly sem sessão ativa. Leia o QR Code novamente no painel da Wafly.",
        provider: "wafly",
      });
    }

    return NextResponse.json({
      success: true,
      message: dados.smartphoneConnected
        ? `Conectado ao número ${dados.phone ?? "(não informado)"}`
        : `Sessão ativa no número ${dados.phone ?? "(não informado)"}, mas o celular está offline`,
      provider: "wafly",
      phone: dados.phone,
      sentMessage: false,
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      success: false,
      error: mensagem.includes("abort")
        ? "Tempo limite ao contatar a Wafly"
        : `Erro de conexão com a Wafly: ${mensagem}`,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Diagnóstico da conexão com a WASender.
 *
 * Antes esta rota fazia POST em `/send-message` para "+5511999999999", com o
 * comentário de que era um número fictício. Não era: é um número brasileiro
 * válido, a mensagem saía de verdade e o envio ainda passava por fora de
 * `wasenderFetch`, escapando da trava do modo de teste. Agora a verificação usa
 * um endpoint de leitura, que confirma credencial e sessão sem enviar nada.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ success: false, error: "Acesso restrito ao administrador." }, { status: 403 });
    }
    return NextResponse.json({ success: false, error: "Erro de autenticação." }, { status: 500 });
  }

  // O diagnóstico precisa olhar o provedor que está no ar. Com a Wafly ativa,
  // checar a WASender respondia "conexão estabelecida" enquanto o WhatsApp real
  // podia estar desconectado — e "chave não configurada" quando estava tudo bem.
  if (activeProvider() === "wafly") {
    return diagnosticarWafly();
  }

  const apiKey = process.env.WASENDER_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ success: false, error: "WASENDER_API_KEY não configurada" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${WASENDER_BASE}/contacts?paginated=true&page=1&limit=1`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: "Conexão estabelecida com sucesso",
        status: response.status,
        sentMessage: false,
      });
    }

    const text = await response.text();
    let details: string | undefined;
    try {
      const json = JSON.parse(text) as { message?: string };
      details = json.message;
      if (/daily|trial cap/i.test(json.message ?? "")) {
        return NextResponse.json({
          success: false,
          error: "Limite diário da API atingido",
          status: 429,
          details: json.message,
        });
      }
    } catch {
      /* corpo não-JSON: o texto cru já vai na mensagem de erro */
    }

    return NextResponse.json({
      success: false,
      error: `Erro na API: ${response.status} - ${text.slice(0, 300)}`,
      status: response.status,
      details,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      success: false,
      error: message.includes("abort") ? "Tempo limite ao contatar a WASender" : `Erro de conexão: ${message}`,
    });
  } finally {
    clearTimeout(timeout);
  }
}
