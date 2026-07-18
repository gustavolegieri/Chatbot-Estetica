import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePixQrCode } from './pix-qr';

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
