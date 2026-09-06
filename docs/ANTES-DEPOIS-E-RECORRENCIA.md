# Antes/Depois automático e Motor de Recorrência

Duas automações que reaproveitam ativos que o sistema já tinha: as fotos do
Portão IA e o histórico de atendimentos concluídos.

## 1. Antes/Depois automático

### O que acontece

Quando a câmera registra a **saída** de um veículo (`GATE_VISION_EXIT`) e o
atendimento é identificado pela placa, o sistema:

1. recupera o snapshot da **entrada** daquele mesmo atendimento (busca no
   `AuditLog` pelo `appointmentId`, não pelo último evento — entre a entrada e a
   saída pode ter passado outro carro);
2. monta uma peça 1080×1080 com os dois quadros empilhados, faixas *ANTES* /
   *DEPOIS*, nome do veículo, serviço e a marca;
3. sobe a peça para o Cloudinary e grava a URL em `Appointment.beforeAfterUrl`;
4. envia ao cliente no WhatsApp (prompt `appointment_before_after`);
5. **se** `Settings.beforeAfterInstagram` estiver ligado, guarda o par de fotos
   como `InstagramStoryAsset` do tipo `before_after` — que o rodízio de Stories
   já sabia diagramar, mas que até agora dependia de cadastro manual.

### Privacidade

A foto do portão mostra a placa. Por isso:

- a peça enviada ao cliente é privada (mensagem direta);
- a publicação no Instagram é **opt-in** e vem desligada
  (`Settings.beforeAfterInstagram = false`);
- o material de Story nunca leva nome, telefone ou placa **no texto** — mas a
  placa continua visível na imagem. Antes de ligar a publicação automática,
  decida se quer o consentimento do cliente no fluxo de agendamento.

### Configuração

| Campo | Padrão | Efeito |
| --- | --- | --- |
| `Settings.beforeAfterEnabled` | `true` | Envia a peça ao cliente no WhatsApp |
| `Settings.beforeAfterInstagram` | `false` | Alimenta o rodízio de Stories |

Requisitos: credenciais do Cloudinary (`CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) e as fontes em `public/fonts`.

### Código

- `src/lib/before-after.ts` — composição, upload e persistência
- `src/lib/gate-vision.ts` — gancho no evento de saída
- `src/lib/appointment-whatsapp.ts` — `sendAppointmentBeforeAfter`

Falhas aqui nunca derrubam o processamento do evento do portão: o resultado
volta com `skipped` e o motivo fica no `AuditLog` do evento.

## 2. Motor de Recorrência

### O que acontece

Um cron diário varre os atendimentos **concluídos** e monta uma fila de
reengajamento. São dois motivos possíveis:

- **`due`** — já passou o intervalo recomendado desde o último serviço;
- **`warranty`** — a garantia do serviço vence nos próximos 15 dias
  (tem prioridade na fila, porque perde a validade).

### Como o intervalo é decidido

1. `Service.recurrenceDays`, se preenchido no cadastro;
2. senão, inferido pelo nome do serviço:

| Padrão no nome | Intervalo |
| --- | --- |
| vitrificação, cerâmica, coating, selante | 365 dias |
| polimento, revitalização, farol | 180 dias |
| higienização, estofado, couro | 180 dias |
| enceramento, cera | 90 dias |
| lavagem, completa, detalhada | 21 dias |

Sem correspondência, o serviço fica **de fora** — é melhor não contatar do que
inventar uma periodicidade.

### Trava de segurança

Um cliente só entra na fila quando:

- não tem nenhum agendamento ativo no futuro;
- não recebeu outra mensagem de recorrência dentro de `recurrenceQuietDays`;
- o atendimento-âncora nunca gerou contato antes (`recurrenceNotifiedAt`);
- o telefone não está em `BlockedPhone`.

Além disso vale o teto `recurrenceMaxPerDay`, a janela de horário
`recurrenceWindowStart`–`recurrenceWindowEnd` (fuso de São Paulo) e **um contato
por cliente por execução**.

### Configuração

| Campo | Padrão |
| --- | --- |
| `Settings.recurrenceEnabled` | `false` (ligue quando quiser começar) |
| `Settings.recurrenceMaxPerDay` | `10` |
| `Settings.recurrenceQuietDays` | `45` |
| `Settings.recurrenceWindowStart` / `End` | `09:00` / `19:00` |
| `Service.recurrenceDays` | vazio (usa o catálogo) |
| `Service.warrantyDays` | vazio (sem aviso de garantia) |

### Endpoints

```bash
# Cron diário (Vercel, 13:00 UTC = 10:00 em São Paulo)
GET /api/cron/recurrence?secret=$CRON_SECRET

# Simular sem enviar (não exige recurrenceEnabled)
GET /api/cron/recurrence?secret=$CRON_SECRET&dryRun=1

# Painel (requer sessão de ADMIN)
GET  /api/admin/recorrencia          # fila que seria enviada agora
POST /api/admin/recorrencia          # { "dryRun": true } simula
```

**Sugestão de rollout:** rode primeiro com `dryRun=1`, confira a fila, preencha
`recurrenceDays`/`warrantyDays` nos serviços principais, comece com
`recurrenceMaxPerDay` baixo (3–5) e só então ligue `recurrenceEnabled`.

### Código

- `src/lib/recurrence-engine.ts` — regras, fila e execução
- `src/lib/recurrence-engine.test.ts` — cobre a classificação e as travas
- `src/app/api/cron/recurrence/route.ts`
- `src/app/api/admin/recorrencia/route.ts`

## Migração

```bash
npx prisma migrate deploy   # ou: npx prisma db push
npx prisma generate
```

A migração `20260904_add_before_after_and_recurrence` usa `IF NOT EXISTS` em
todas as colunas, então é segura sobre um banco que já recebeu `db push`.

Os prompts novos (`appointment_before_after`, `recurrence_due`,
`recurrence_warranty`) vêm dos defaults; rode o seed de prompts se quiser
editá-los pelo painel.
