import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sendText } from './src/lib/evolution-api';

const PHONE = '5511972851072';
const path = join(__dirname, 'fluxo-oficial.md');
const content = readFileSync(path, 'utf-8');

function extractOfficialSteps(md: string) {
  const lines = md.split(/\r?\n/);
  const steps: { title: string; body: string[]; order: number }[] = [];
  let current: { title: string; body: string[]; order: number } | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(\d+)\.\s+(.*)$/);
    if (headingMatch) {
      if (current) {
        steps.push(current);
      }
      const order = Number(headingMatch[1]);
      current = { title: headingMatch[2].trim(), body: [], order };
      continue;
    }
    if (current) {
      current.body.push(line);
    }
  }

  if (current) steps.push(current);
  return steps.filter((step) => step.order >= 1 && step.order <= 23);
}

function normalizeBody(bodyLines: string[]) {
  const cleaned = bodyLines
    .map((line) => line.replace(/\t/g, '    '))
    .map((line) => line.replace(/\r?\n$/, ''))
    .join('\n')
    .trim();
  return cleaned;
}

async function main() {
  const steps = extractOfficialSteps(content);
  console.log(`Encontradas ${steps.length} etapas oficiais no fluxo-oficial.md`);

  for (const step of steps) {
    const text = `Etapa ${step.order}: ${step.title}\n\n${normalizeBody(step.body)}`;
    console.log(`Enviando etapa ${step.order}: ${step.title}`);
    const result = await sendText({ number: PHONE, text, skipBotLog: true, sender: 'ADMIN' });
    console.log(JSON.stringify(result));
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  console.log('Envio das 23 etapas concluído.');
}

main().catch((err) => {
  console.error('Erro ao enviar fluxo:', err);
  process.exit(1);
});
