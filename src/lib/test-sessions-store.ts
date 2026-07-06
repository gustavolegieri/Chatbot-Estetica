// Armazenamento em memória para sessões de teste do bot
// Nota: Este é um armazenamento temporário apenas para testes do admin
// Não persiste entre reinicializações do servidor

export const testSessions = new Map<string, any>();
