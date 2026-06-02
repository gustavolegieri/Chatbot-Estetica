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

export function getRuntimeDatabaseUrl(): string | undefined {
  return sanitizeDatabaseUrl(process.env.DATABASE_URL);
}
