import { generateSummaryCard } from './src/lib/summary-card';

async function testSummaryCard() {
  // Teste com endereço longo para validar word wrap
  const testData = {
    customerName: "João Silva",
    serviceName: "Lavagem Completa",
    vehicle: "Toyota Corolla 2020",
    date: "14/07/2026",
    time: "08:30",
    paymentMethod: "PIX",
    totalPrice: 85.00,
    pickupAddress: "Rua das Flores, 1234, Apto 45, Bairro Jardim Primavera, São Paulo, SP" // Endereço longo
  };

  console.log("Gerando resumo com endereço longo...");
  const result = await generateSummaryCard(testData);
  
  console.log("SVG gerado com sucesso!");
  console.log("Data URL length:", result.length);
  
  // Salvar em arquivo para visualização
  const fs = require('fs');
  const base64Data = result.replace(/^data:image\/svg\+xml;base64,/, '');
  fs.writeFileSync('test-summary.svg', base64Data, 'base64');
  console.log("Arquivo salvo: test-summary.svg");
}

testSummaryCard().catch(console.error);