import { NextRequest, NextResponse } from "next/server";

const WASENDER_BASE = process.env.WASENDER_BASE_URL || "https://wasenderapi.com/api";

export async function GET() {
  const apiKey = process.env.WASENDER_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      success: false,
      error: "WASENDER_API_KEY não configurada"
    });
  }

  try {
    // Fazer uma requisição simples para testar a conexão
    // Não vamos enviar mensagem real, apenas verificar se a API responde
    const response = await fetch(`${WASENDER_BASE}/status`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: "Conexão estabelecida com sucesso"
      });
    } else {
      const text = await response.text();
      return NextResponse.json({
        success: false,
        error: `Erro na API: ${response.status} - ${text}`
      });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Erro de conexão: ${(error as Error).message}`
    });
  }
}