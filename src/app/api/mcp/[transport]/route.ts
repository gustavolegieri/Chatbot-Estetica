import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { verifyN8nMcpToken } from "@/lib/auth-n8n-mcp";
import {
  consultarAgendamentosCliente,
  consultarCliente,
  consultarDisponibilidade,
  listServicosPrecos,
} from "@/lib/n8n-queries";

/** Necessário na Vercel (Fluid Compute) para sessões MCP longas */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function toolText(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "consultar_servicos_precos",
      {
        title: "Consultar serviços e preços",
        description:
          "Lista os serviços ativos da estética automotiva com id, nome, descrição, preço base, duração e variação de preço por porte de veículo (hatch/suv). Use quando o cliente perguntar sobre serviços, preços ou pacotes. Somente leitura.",
        inputSchema: {},
      },
      async () => {
        try {
          const data = await listServicosPrecos();
          return toolText({ data });
        } catch (error) {
          console.error("[mcp] consultar_servicos_precos", error);
          return toolError("Não foi possível listar os serviços. Tente novamente.");
        }
      }
    );

    server.registerTool(
      "consultar_disponibilidade",
      {
        title: "Consultar disponibilidade",
        description:
          "Retorna os horários livres em uma data (YYYY-MM-DD), considerando agendamentos existentes, horário de funcionamento e bloqueios. Use quando o cliente quiser saber se há vaga em um dia. Somente leitura — não agenda.",
        inputSchema: {
          data: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "data deve ser YYYY-MM-DD")
            .describe("Data no formato YYYY-MM-DD"),
          servico_id: z
            .string()
            .optional()
            .describe("Opcional: id do serviço para calcular slots pela duração correta"),
        },
      },
      async (args) => {
        try {
          const data = args.data;
          if (!data) return toolError("Parâmetro data é obrigatório (YYYY-MM-DD).");
          const result = await consultarDisponibilidade(data, args.servico_id);
          if (!result.ok) return toolError(result.error);
          return toolText(result);
        } catch (error) {
          console.error("[mcp] consultar_disponibilidade", error);
          return toolError("Não foi possível consultar a disponibilidade. Tente novamente.");
        }
      }
    );

    server.registerTool(
      "consultar_agendamentos_cliente",
      {
        title: "Consultar agendamentos do cliente",
        description:
          "Lista os agendamentos futuros de um cliente pelo telefone (status diferente de cancelado). Use para verificar se o cliente já tem horário marcado. Somente leitura — não cancela nem remarca.",
        inputSchema: {
          telefone: z
            .string()
            .min(10)
            .describe("Telefone do cliente com DDI/DDD, apenas dígitos ou formatado"),
        },
      },
      async (args) => {
        try {
          const telefone = args.telefone;
          if (!telefone) return toolError("Parâmetro telefone é obrigatório.");
          const result = await consultarAgendamentosCliente(telefone);
          if (!result.ok) return toolError(result.error);
          return toolText(result);
        } catch (error) {
          console.error("[mcp] consultar_agendamentos_cliente", error);
          return toolError("Não foi possível consultar os agendamentos. Tente novamente.");
        }
      }
    );

    server.registerTool(
      "consultar_cliente",
      {
        title: "Consultar cliente",
        description:
          "Busca um cliente pelo telefone e retorna dados cadastrais, estado_conversa e dados_conversa do fluxo. Se não existir, indica que é cliente novo. Use no início do atendimento para personalizar a conversa. Somente leitura.",
        inputSchema: {
          telefone: z
            .string()
            .min(10)
            .describe("Telefone do cliente com DDI/DDD, apenas dígitos ou formatado"),
        },
      },
      async (args) => {
        try {
          const telefone = args.telefone;
          if (!telefone) return toolError("Parâmetro telefone é obrigatório.");
          const result = await consultarCliente(telefone);
          return toolText(result);
        } catch (error) {
          console.error("[mcp] consultar_cliente", error);
          return toolError("Não foi possível consultar o cliente. Tente novamente.");
        }
      }
    );
  },
  {
    serverInfo: {
      name: "estetica-automotiva-mcp",
      version: "1.0.0",
    },
  },
  {
    // Rota em src/app/api/mcp/[transport]/route.ts → /api/mcp/mcp (HTTP) ou /api/mcp/sse
    basePath: "/api/mcp",
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV === "development",
  }
);

const authHandler = withMcpAuth(handler, verifyN8nMcpToken, {
  required: true,
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
