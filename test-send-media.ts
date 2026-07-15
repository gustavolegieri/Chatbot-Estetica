import { sendMedia } from './src/lib/evolution-api';

async function testSendMedia() {
  console.log('=== Testando envio de mídia ===');
  
  try {
    // Testar envio com a URL gerada anteriormente
    const calendarUrl = 'https://res.cloudinary.com/w8hjdhf2/image/upload/v1784127573/calendars/calendar-calendar-test-2026-07-1784127574317-1784127574583.png';
    const phone = '5511972851072';
    const legend = `✅ Dias disponíveis:
🟢 Mais vazio  🟡 Médio  🔴 Mais movimentado
🚫 Domingos: fechado
📍 Hoje: destacado em azul

💬 *Digite o número do dia* (ex: 15)
🔙 *0* para voltar ao menu`;
    
    console.log('1. Enviando mídia para', phone);
    console.log('2. URL:', calendarUrl);
    
    const result = await sendMedia({
      number: phone,
      mediaUrl: calendarUrl,
      caption: legend
    });
    
    console.log('3. Resultado do envio:', result);
    console.log('=== Teste concluído ===');
  } catch (error) {
    console.error('=== Erro no teste ===', error);
  }
}

testSendMedia();