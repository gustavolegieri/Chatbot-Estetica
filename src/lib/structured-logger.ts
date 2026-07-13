/**
 * Sistema de Logs Estruturados
 * Logs formatados em JSON para fácil análise e debugging
 */

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  FATAL = "FATAL",
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  sessionId?: string;
  phone?: string;
  stage?: string;
  message: string;
  data?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  userId?: string;
  environment: string;
}

class StructuredLogger {
  private context: string;
  private environment: string;

  constructor(context: string) {
    this.context = context;
    this.environment = process.env.NODE_ENV || "development";
  }

  private formatEntry(
    level: LogLevel,
    message: string,
    data?: Record<string, any>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      environment: this.environment,
    };

    if (data) {
      entry.data = data;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  private log(entry: LogEntry) {
    // Em produção, enviar para serviço de logs (Sentry, DataDog, etc)
    // Em desenvolvimento, apenas console.log
    if (this.environment === "production") {
      // TODO: Integrar com serviço de logs
      console.log(JSON.stringify(entry));
    } else {
      console.log(`[${entry.level}] [${entry.context}] ${entry.message}`, entry.data || "", entry.error || "");
    }
  }

  debug(message: string, data?: Record<string, any>) {
    this.log(this.formatEntry(LogLevel.DEBUG, message, data));
  }

  info(message: string, data?: Record<string, any>) {
    this.log(this.formatEntry(LogLevel.INFO, message, data));
  }

  warn(message: string, data?: Record<string, any>) {
    this.log(this.formatEntry(LogLevel.WARN, message, data));
  }

  error(message: string, error?: Error, data?: Record<string, any>) {
    this.log(this.formatEntry(LogLevel.ERROR, message, data, error));
  }

  fatal(message: string, error?: Error, data?: Record<string, any>) {
    this.log(this.formatEntry(LogLevel.FATAL, message, data, error));
  }

  // Métodos com contexto de sessão
  withSession(sessionId: string, phone?: string, stage?: string) {
    const logger = new StructuredLogger(this.context);
    return {
      debug: (message: string, data?: Record<string, any>) => {
        const entry = logger.formatEntry(LogLevel.DEBUG, message, data);
        entry.sessionId = sessionId;
        entry.phone = phone;
        entry.stage = stage;
        logger.log(entry);
      },
      info: (message: string, data?: Record<string, any>) => {
        const entry = logger.formatEntry(LogLevel.INFO, message, data);
        entry.sessionId = sessionId;
        entry.phone = phone;
        entry.stage = stage;
        logger.log(entry);
      },
      warn: (message: string, data?: Record<string, any>) => {
        const entry = logger.formatEntry(LogLevel.WARN, message, data);
        entry.sessionId = sessionId;
        entry.phone = phone;
        entry.stage = stage;
        logger.log(entry);
      },
      error: (message: string, error?: Error, data?: Record<string, any>) => {
        const entry = logger.formatEntry(LogLevel.ERROR, message, data, error);
        entry.sessionId = sessionId;
        entry.phone = phone;
        entry.stage = stage;
        logger.log(entry);
      },
      fatal: (message: string, error?: Error, data?: Record<string, any>) => {
        const entry = logger.formatEntry(LogLevel.FATAL, message, data, error);
        entry.sessionId = sessionId;
        entry.phone = phone;
        entry.stage = stage;
        logger.log(entry);
      },
    };
  }
}

// Loggers por contexto
export const botLogger = new StructuredLogger("WhatsAppBot");
export const testBotLogger = new StructuredLogger("TestBot");
export const apiLogger = new StructuredLogger("API");
export const paymentLogger = new StructuredLogger("Payment");
export const appointmentLogger = new StructuredLogger("Appointment");
