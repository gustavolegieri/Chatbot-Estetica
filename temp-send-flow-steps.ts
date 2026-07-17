import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sendText } from './src/lib/evolution-api';

const PHONE = '5511972851072';
const path = join(__dirname, 'fluxo-oficial.md');
const content = readFileSync(path, 'utf-8');

function extractSections(md: string) {
  const lines = md.split(/\r?\n/);
  const sections = [] as { title: string; body: string[] }[];
  let current: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.*)$/);
    if (headingMatch) {
      if (current) {
        sections.push(current);
      }
      current = { title: headingMatch[1].trim(), body: [] };
      continue;
    }
    if (current) {
      current.body.push(line);
    }
  }

  if (current) sections.push(current);
  return sections;
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
  const sections = extractSections(content);
  console.log(`Encontradas ${sections.length} seções em fluxo-oficial.md`);

  let index = 1;
  for (const section of sections) {
    const text = `Etapa ${index}: ${section.title}\n\n${normalizeBody(section.body)}`;
    console.log(`Enviando etapa ${index}: ${section.title}`);
    const result = await sendText({ number: PHONE, text, skipBotLog: true, sender: 'ADMIN' });
    console.log(JSON.stringify(result));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    index += 1;
  }

  console.log('Envio completo.');
}

main().catch((err) => {
  console.error('Erro ao enviar fluxo:', err);
  process.exit(1);
});
