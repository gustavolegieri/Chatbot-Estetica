/**
 * Telefones autorizados enquanto o modo de teste está ligado.
 *
 * O campo `settings.testModePhone` nasceu com um número só, e por isso liberar
 * um segundo aparelho para testar exigia trocar o primeiro. Aqui o mesmo campo
 * passa a aceitar uma lista separada por vírgula (ou ponto e vírgula, ou quebra
 * de linha) — um valor antigo, com um número só, continua funcionando sem
 * migração.
 */

/** Lista de telefones autorizados, só dígitos, sem repetições nem vazios. */
export function parseTestModePhones(configured?: string | null): string[] {
  if (!configured) return [];
  const numeros = configured
    .split(/[,;\n]/)
    .map((valor) => valor.replace(/\D/g, ""))
    .filter((valor) => valor.length >= 10);
  return [...new Set(numeros)];
}

/**
 * Diz se um telefone pode conversar com o bot.
 *
 * Com o modo de teste desligado, todo mundo pode — é o comportamento de
 * produção. Ligado, só os números da lista.
 */
export function testModeAllowsPhone(
  phone: string,
  enabled: boolean,
  configured?: string | null
): boolean {
  if (!enabled) return true;
  const autorizados = parseTestModePhones(configured);
  if (autorizados.length === 0) return false;
  const numero = phone.replace(/\D/g, "");
  return autorizados.includes(numero);
}

/** Formato canônico para gravar no banco: números separados por vírgula. */
export function formatTestModePhones(configured?: string | null): string | null {
  const lista = parseTestModePhones(configured);
  return lista.length ? lista.join(",") : null;
}
