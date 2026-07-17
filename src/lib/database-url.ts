const PROJECT_REF = "rifvdutsxappnlroennh";

/** Remove aspas e espaços que às vezes vêm do painel da Vercel */
export function sanitizeDatabaseUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw.trim().replace(/^["']|["']$/g, "");
}

export function analyzeDatabaseUrl(raw?: string): {
  host: string;
  port: string;
  user: string;
  malformedPath: boolean;
  usesDirectPortOnDbHost: boolean;
  usesPoolerHost: boolean;
  missingPgbouncer: boolean;
  wrongUserForPooler: boolean;
  hints: string[];
} {
  const url = sanitizeDatabaseUrl(raw) ?? "";
  const hints: string[] = [];
  if (!url) {
    return {
      host: "",
      port: "",
      user: "",
      malformedPath: false,
      usesDirectPortOnDbHost: false,
      usesPoolerHost: false,
      missingPgbouncer: false,
      wrongUserForPooler: false,
      hints: ["DATABASE_URL vazio"],
    };
  }

  if (/postgress+mode|postgressslmode/i.test(url)) {
    hints.push(
      'URL inválida: deve terminar com "/postgres?pgbouncer=true&sslmode=require" (não "postgressslmode").'
    );
  }

  let host = "";
  let port = "";
  let user = "";
  let malformedPath = false;

  try {
    const u = new URL(url.replace(/^postgresql:/, "postgres:"));
    host = u.hostname;
    port = u.port || "5432";
    user = u.username;
    if (!u.pathname.includes("postgres")) malformedPath = true;
  } catch {
    malformedPath = true;
    hints.push("DATABASE_URL não é uma URL válida.");
  }

  const usesDirectPortOnDbHost =
    host === `db.${PROJECT_REF}.supabase.co` && port === "5432";
  const usesPoolerHost = host.includes("pooler.supabase.com");
  const missingPgbouncer =
    (port === "6543" || usesPoolerHost) && !url.includes("pgbouncer=true");
  const wrongUserForPooler =
    usesPoolerHost && user === "postgres" && !user.includes(".");

  if (usesDirectPortOnDbHost) {
    hints.push(
      "Na Vercel use porta 6543 no mesmo host db.*.supabase.co (PgBouncer), não 5432."
    );
  }
  if (process.env.VERCEL === "1" && host === `db.${PROJECT_REF}.supabase.co`) {
    hints.push(
      "db.*.supabase.co costuma falhar na Vercel (IPv6). Use aws-*-REGION.pooler.supabase.com:6543."
    );
  }
  if (wrongUserForPooler) {
    hints.push(`No pooler aws-*, o usuário deve ser postgres.${PROJECT_REF}, não só postgres.`);
  }
  if (missingPgbouncer) {
    hints.push("Adicione ?pgbouncer=true na URL (obrigatório na porta 6543).");
  }
  if (malformedPath && hints.length === 0) {
    hints.push('O caminho da URL deve ser "/postgres" com parâmetros após "?".');
  }

  return {
    host,
    port,
    user,
    malformedPath,
    usesDirectPortOnDbHost,
    usesPoolerHost,
    missingPgbouncer,
    wrongUserForPooler,
    hints,
  };
}

/** Corrige typos comuns e completa parâmetros que a Vercel às vezes corta */
export function repairDatabaseUrl(raw?: string): string | undefined {
  let url = sanitizeDatabaseUrl(raw);
  if (!url) return undefined;

  url = url.replace(/\/postgress+sslmode=require/gi, "/postgres?sslmode=require");
  url = url.replace(/\/postgressslmode=require/gi, "/postgres?sslmode=require");

  const dbHost = `db.${PROJECT_REF}.supabase.co`;
  const onVercel = process.env.VERCEL === "1";

  if (url.includes(dbHost)) {
    if (onVercel && url.includes(`@${dbHost}:5432/`)) {
      url = url.replace(`@${dbHost}:5432/`, `@${dbHost}:6543/`);
    }
    if (url.includes(`@${dbHost}:6543/`) && !url.includes("pgbouncer=true")) {
      url += url.includes("?") ? "&pgbouncer=true" : "?pgbouncer=true";
    }
    if (!url.includes("sslmode=")) {
      url += url.includes("?") ? "&sslmode=require" : "?sslmode=require";
    }
    // Reduzir connection_limit para ambiente serverless com pooler (evita esgotamento em múltiplas instâncias)
    if (!url.includes("connection_limit=")) {
      url += url.includes("?") ? "&connection_limit=5" : "?connection_limit=5";
    } else {
      // Atualizar connection_limit se existir e for maior que 5
      url = url.replace(/connection_limit=\d+/g, "connection_limit=5");
    }
  }

  return url;
}

export function getRuntimeDatabaseUrl(): string | undefined {
  return repairDatabaseUrl(process.env.DATABASE_URL);
}
