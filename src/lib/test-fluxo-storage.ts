// Storage compartilhado para sessões de teste de fluxo
// Em produção, usar Redis ou banco de dados

interface TestSession {
  startedAt: Date;
  currentStep: number;
  completed: boolean;
  phone: string;
  currentStepName?: string;
}

class TestFluxoStorage {
  private sessions = new Map<string, TestSession>();

  set(sessionId: string, session: TestSession): void {
    this.sessions.set(sessionId, session);
  }

  get(sessionId: string): TestSession | undefined {
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  getAll(): Map<string, TestSession> {
    return this.sessions;
  }

  clear(): void {
    this.sessions.clear();
  }
}

// Exportar instância singleton
export const testFluxoStorage = new TestFluxoStorage();
