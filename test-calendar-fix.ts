import { generateCalendarImageOnlyForTest, generateCalendarLegend } from './src/lib/calendar-helper';

async function testCalendarFix() {
  console.log('=== Testando calendário com conversão PNG ===');
  
  try {
    // Testar geração de imagem
    console.log('1. Gerando imagem do calendário...');
    const calendarImageUrl = await generateCalendarImageOnlyForTest(null);
    console.log('2. URL gerada:', calendarImageUrl);
    
    // Testar geração de legenda
    console.log('3. Gerando legenda...');
    const legend = generateCalendarLegend();
    console.log('4. Legenda gerada:', legend);
    
    console.log('=== Teste concluído com sucesso ===');
  } catch (error) {
    console.error('=== Erro no teste ===', error);
  }
}

testCalendarFix();