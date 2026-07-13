// Teste simples do summary card com endereço longo
const testData = {
  customerName: "João Silva",
  serviceName: "Lavagem Completa",
  vehicle: "Toyota Corolla 2020",
  date: "14/07/2026",
  time: "08:30",
  paymentMethod: "PIX",
  totalPrice: 85.00,
  pickupAddress: "Rua das Flores, 1234, Apto 45, Bairro Jardim Primavera, São Paulo, SP"
};

console.log("Teste com endereço longo:", testData.pickupAddress);
console.log("Word wrap esperado:");
console.log("- Linha 1: Rua das Flores, 1234, Apto 45, Bairro");
console.log("- Linha 2: Jardim Primavera, São Paulo, SP");