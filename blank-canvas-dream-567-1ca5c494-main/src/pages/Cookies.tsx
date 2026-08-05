import { Layout } from '@/components/layout/Layout';

export default function Cookies() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="font-serif text-4xl md:text-5xl text-gradient-gold mb-8">Política de Cookies</h1>

        <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground">
          <p className="text-lg">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">1. O que são cookies</h2>
          <p>Cookies são pequenos arquivos armazenados no seu dispositivo para garantir o funcionamento adequado de sites, lembrar preferências e gerar métricas anônimas de uso.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">2. Tipos de cookies que utilizamos</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-foreground">Necessários:</strong> sessão, autenticação, segurança e prevenção de fraude. Sem eles a plataforma não funciona corretamente.</li>
            <li><strong className="text-foreground">Analíticos:</strong> métricas agregadas e anônimas de navegação, usadas para melhorar a experiência.</li>
            <li><strong className="text-foreground">Marketing:</strong> personalização de ofertas, campanhas e remarketing. Sempre opcionais.</li>
          </ul>

          <h2 className="font-serif text-2xl text-foreground mt-8">3. Base legal (LGPD)</h2>
          <p>Tratamos cookies necessários com base no <em>legítimo interesse</em> e na <em>execução de contrato</em>. Cookies analíticos e de marketing dependem do seu <em>consentimento</em>, manifestado por meio do banner exibido no primeiro acesso.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">4. Gerenciamento</h2>
          <p>Você pode aceitar, recusar ou configurar suas preferências a qualquer momento no banner inicial ou nas configurações do seu navegador. A revogação pode limitar funcionalidades não essenciais.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">5. Compartilhamento</h2>
          <p>Não vendemos cookies a terceiros. Provedores de infraestrutura (autenticação, pagamentos via Mercado Pago, hospedagem) podem usar cookies estritamente operacionais.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">6. Retenção</h2>
          <p>Cookies de sessão expiram ao fechar o navegador. Cookies persistentes têm vida útil máxima de 12 meses, sendo renovados conforme uso.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">7. Contato (Encarregado de Dados)</h2>
          <p>Dúvidas, exclusão de dados ou exercício de direitos LGPD: <a href="mailto:contato@estelite.com.br" className="text-primary hover:underline">contato@estelite.com.br</a>.</p>
        </div>
      </div>
    </Layout>
  );
}
