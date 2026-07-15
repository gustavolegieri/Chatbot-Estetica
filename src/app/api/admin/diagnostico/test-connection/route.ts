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
    // Fazer uma requisição de teste para verificar a conexão e limite diário
    // Usamos um número fictício para não enviar mensagem real
    const response = await fetch(`${WASENDER_BASE}/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to: "+5511999999999", // Número fictício para teste
        text: "Teste de conexão - diagnóstico"
      }),
    });

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: "Conexão estabelecida com sucesso",
        status: response.status
      });
    } else {
      const text = await response.text();
      let status = response.status;
      
      // Tentar parsear JSON para pegar detalhes
      try {
        const json = await response.clone().json();
        if (json.message?.toLowerCase().includes("daily") || json.message?.toLowerCase().includes("trial cap")) {
          return NextResponse.json({
            success: false,
            error: "Limite diário da API atingido",
            status: 429,
            details: json.message
          });
        }
      } catch { /* ignora */ }
      
      return NextResponse.json({
        success: false,
        error: `Erro na API: ${response.status} - ${text}`,
        status: status
      });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: `Erro de conexão: ${(error as Error).message}`
    });
  }
}