#!/usr/bin/env bash
# Publica a integração Wafly na Vercel.
#
# Lê os valores do .env local (fonte da verdade já validada) e grava as mesmas
# variáveis em produção, sem elas aparecerem em log ou linha de comando.
# Requer `npx vercel login` feito uma vez antes.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

if ! npx --yes vercel whoami >/dev/null 2>&1; then
  echo "❌ CLI da Vercel sem credencial. Rode primeiro:  npx vercel login"
  exit 1
fi
echo "✅ Autenticado como: $(npx --yes vercel whoami 2>/dev/null)"

valor_do_env() {
  # Pega o valor bruto do .env, sem aspas e sem espaços nas pontas.
  sed -n "s/^$1=//p" .env | head -1 | sed -e 's/^["'\'']//' -e 's/["'\'']$//' | tr -d '\r' | xargs
}

VARIAVEIS=(WHATSAPP_PROVIDER WAFLY_BASE_URL WAFLY_INSTANCE WAFLY_TOKEN WAFLY_WEBHOOK_TOKEN)

for nome in "${VARIAVEIS[@]}"; do
  valor="$(valor_do_env "$nome")"
  if [ -z "$valor" ]; then
    echo "❌ $nome não encontrada no .env — abortando antes de publicar pela metade."
    exit 1
  fi

  # Uma variável já existente precisa sair antes de entrar com o valor novo.
  npx --yes vercel env rm "$nome" production --yes >/dev/null 2>&1

  if printf '%s' "$valor" | npx --yes vercel env add "$nome" production >/dev/null 2>&1; then
    echo "✅ $nome gravada em produção (${#valor} caracteres)"
  else
    echo "❌ falha ao gravar $nome"
    exit 1
  fi
done

echo
echo "🚀 Publicando..."
npx --yes vercel deploy --prod
