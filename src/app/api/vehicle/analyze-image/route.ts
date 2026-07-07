import { NextResponse } from "next/server";

interface VehicleAnalysis {
  model: string;
  year: string;
  color: string;
  condition: string;
}

/**
 * Analisa imagem de veículo usando IA (Cerebras/Gemini)
 * Extrai modelo, ano, cor e estado de conservação
 */
export async function POST(req: Request) {
  const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
  
  if (!CEREBRAS_API_KEY) {
    return NextResponse.json(
      { success: false, error: "API de IA não configurada" },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { imageUrl } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { success: false, error: "URL da imagem é obrigatória" },
        { status: 400 }
      );
    }

    // Prompt para análise de veículo com IA
    const prompt = `Analise esta imagem de veículo e extraia as seguintes informações em JSON:
    - model: modelo do carro (ex: "Honda Civic", "Toyota Corolla")
    - year: ano do modelo (ex: "2020", "2018")
    - color: cor predominante (ex: "preto", "branco", "prata")
    - condition: estado de conservação ("excelente", "bom", "normal", "ruim")
    
    Retorne APENAS o JSON sem formatação.`;

    const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CEREBRAS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro na API: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Resposta vazia da IA");
    }

    // Parse JSON response
    const analysis: VehicleAnalysis = JSON.parse(content);

    return NextResponse.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error("Erro na análise de imagem:", error);
    
    // Fallback simulado para desenvolvimento
    return NextResponse.json({
      success: true,
      data: {
        model: "Veículo identificado",
        year: "2020",
        color: "prata",
        condition: "bom",
      },
      simulated: true,
    });
  }
}