import { Layout } from '@/components/layout/Layout';

export default function Privacy() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="font-serif text-4xl md:text-5xl text-gradient-gold mb-8">Política de Privacidade</h1>

        <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground">
          <p className="text-lg">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>

          <p>A EST ELITE respeita sua privacidade e está em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">1. Dados Coletados</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Cadastro:</strong> nome completo, e-mail, telefone (opcional) e senha (armazenada criptografada).</li>
            <li><strong className="text-foreground">Diagnóstico:</strong> fotos (frente, lateral, costas, rosto), medidas, respostas do questionário de estilo, preferências.</li>
            <li><strong className="text-foreground">Pagamento:</strong> dados processados diretamente pelo Mercado Pago. Não armazenamos números de cartão.</li>
            <li><strong className="text-foreground">Uso:</strong> data e hora de aceite dos termos, último login, IP, dispositivo (logs de segurança).</li>
          </ul>

          <h2 className="font-serif text-2xl text-foreground mt-8">2. Finalidades</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Gerar e entregar o diagnóstico contratado.</li>
            <li>Autenticação, prevenção de fraude e segurança da conta.</li>
            <li>Processamento de pagamentos e gestão de assinaturas.</li>
            <li>Comunicação operacional (status do diagnóstico, recibos, suporte).</li>
            <li>Aprimoramento do serviço com métricas agregadas e anônimas.</li>
          </ul>

          <h2 className="font-serif text-2xl text-foreground mt-8">3. Base Legal</h2>
          <p>Execução de contrato (art. 7º, V da LGPD), consentimento (art. 7º, I), legítimo interesse (art. 7º, IX) e cumprimento de obrigação legal/regulatória (art. 7º, II).</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">4. Armazenamento e Segurança</h2>
          <p>Dados são armazenados em infraestrutura cloud com criptografia em trânsito (TLS) e em repouso. Aplicamos controle de acesso por papéis (RLS), políticas de senha forte e auditoria.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">5. Retenção</h2>
          <p>Mantemos seus dados enquanto sua conta estiver ativa. Após exclusão da conta, dados pessoais são eliminados em até 30 dias, exceto registros fiscais retidos por obrigação legal (5 anos).</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">6. Compartilhamento</h2>
          <p>Não vendemos seus dados. Compartilhamos apenas com operadores estritamente necessários: provedor de hospedagem/banco (Supabase), gateway de pagamento (Mercado Pago) e provedor de IA (OpenAI), sempre sob contrato de proteção de dados.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">7. Direitos da Titular (art. 18 LGPD)</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Confirmação e acesso aos dados</li>
            <li>Correção de dados incompletos ou incorretos</li>
            <li>Anonimização, bloqueio ou eliminação</li>
            <li>Portabilidade</li>
            <li>Revogação do consentimento</li>
            <li>Informação sobre compartilhamentos</li>
          </ul>
          <p>Para exercer, envie e-mail para <a href="mailto:contato@estelite.com.br" className="text-primary hover:underline">contato@estelite.com.br</a>.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">8. Cookies</h2>
          <p>Consulte nossa <a href="/cookies" className="text-primary hover:underline">Política de Cookies</a> para detalhes sobre o uso e gerenciamento de cookies.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">9. Exclusão de Conta</h2>
          <p>A exclusão pode ser solicitada pelo e-mail oficial. Após confirmação, todos os dados pessoais, fotos e diagnósticos são removidos definitivamente.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">10. Encarregado de Dados (DPO)</h2>
          <p>E-mail: <a href="mailto:contato@estelite.com.br" className="text-primary hover:underline">contato@estelite.com.br</a></p>
        </div>
      </div>
    </Layout>
  );
}
