import { sendText } from './src/lib/evolution-api';

async function testSendText() {
  console.log('=== Testando envio de texto simples ===');
  
  try {
    const phone = '5511972851072';
    const text = '📅 Teste de envio de texto - Calendário';
    
    console.log('1. Enviando texto para', phone);
    
    const result = await sendText({
      number: phone,
      text: text
    });
    
    console.log('2. Resultado do envio:', result);
    console.log('=== Teste concluído ===');
  } catch (error) {
    console.error('=== Erro no teste ===', error);
  }
}

testSendText();