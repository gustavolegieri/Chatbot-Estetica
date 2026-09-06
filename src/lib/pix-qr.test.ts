import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePixPayload, generatePixQrCode } from './pix-qr';

test('generatePixQrCode returns a public URL instead of a data URL', async () => {
  const result = await generatePixQrCode(
    {
      amount: 55,
      description: 'Agendamento',
      merchantName: 'Garagem do Ka',
      merchantCity: 'Sao Paulo',
      key: 'f4e5c8d9e0f1a2b3c4d5e6f7a8b9c0d',
    },
    async () => ({ success: true, url: 'https://cdn.example.com/pix-qr.png' })
  );

  assert.equal(result, 'https://cdn.example.com/pix-qr.png');
  assert.match(result, /^https?:\/\//i);
  assert.doesNotMatch(result, /^data:/i);
});

test('o BR Code declara o tamanho real de cada campo', () => {
  const payload = generatePixPayload({
    amount: 75,
    description: 'Lavagem Completa',
    merchantName: 'Garagem do Ká',
    merchantCity: 'Jundiaí',
    key: 'contato@garagemdoka.com.br',
  });

  // Formato e moeda fixos da especificação.
  assert.match(payload, /^000201/);
  assert.match(payload, /5303986/);
  // Valor com dois decimais e tamanho declarado: "54" + "05" + "75.00".
  assert.match(payload, /54055?75\.00|540575\.00/);
  // A chave entra com o próprio tamanho — 26 caracteres neste caso.
  assert.match(payload, /0126contato@garagemdoka\.com\.br/);
  // Acento sai do nome, que o BR Code não aceita.
  assert.match(payload, /Garagem do Ka/);
  assert.match(payload, /Jundiai/);
  // CRC de quatro dígitos hexadecimais fecha o código.
  assert.match(payload, /6304[0-9A-F]{4}$/);
});

test('cada campo do BR Code pode ser lido de volta pelo tamanho declarado', () => {
  const payload = generatePixPayload({
    amount: 100.5,
    description: 'Teste',
    merchantName: 'Garagem do Ka',
    merchantCity: 'Jundiai',
    key: '+5511944400696',
  });

  // Percorre o código como o app do banco faria: id, tamanho, valor.
  let posicao = 0;
  const ids: string[] = [];
  while (posicao < payload.length) {
    const id = payload.slice(posicao, posicao + 2);
    const tamanho = Number(payload.slice(posicao + 2, posicao + 4));
    assert.ok(Number.isInteger(tamanho), `tamanho inválido no campo ${id}`);
    ids.push(id);
    posicao += 4 + tamanho;
  }
  assert.equal(posicao, payload.length, 'os tamanhos declarados devem cobrir o código inteiro');
  assert.deepEqual(ids, ['00', '26', '52', '53', '54', '58', '59', '60', '62', '63']);
});
