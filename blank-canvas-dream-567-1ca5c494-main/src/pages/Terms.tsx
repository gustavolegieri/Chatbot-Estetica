import { Layout } from '@/components/layout/Layout';

export default function Terms() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="font-serif text-4xl md:text-5xl text-gradient-gold mb-8">Termos de Uso</h1>

        <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground">
          <p className="text-lg">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">1. Aceitação dos Termos</h2>
          <p>Ao criar uma conta ou utilizar a EST ELITE (estelite.com.br), você declara ter lido, compreendido e aceitado integralmente estes Termos de Uso, a Política de Privacidade e a Política de Cookies. O aceite é registrado com data e hora no momento do cadastro.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">2. Descrição do Serviço</h2>
          <p>A EST ELITE é uma plataforma de diagnóstico de imagem pessoal feminino baseado em inteligência artificial. As análises (corpo, coloração, estilo, modelagens, peças essenciais e cápsula) são geradas algoritmicamente a partir das fotos, medidas e respostas fornecidas pela usuária.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">3. Cadastro e Conta</h2>
          <p>A usuária é responsável pela veracidade das informações fornecidas e pela guarda das suas credenciais. Contas com dados falsos, conteúdo impróprio ou tentativa de fraude poderão ser suspensas ou excluídas sem aviso prévio.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">4. Uso das Imagens</h2>
          <p>As fotos enviadas são utilizadas exclusivamente para gerar o diagnóstico contratado. Não são vendidas, treinadas em modelos de terceiros, nem divulgadas. A usuária pode solicitar exclusão a qualquer momento.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">5. Pagamentos e Assinaturas</h2>
          <p>Os planos vigentes (Essencial, Premium e Elite) são listados na página de Preços. Pagamentos são processados via Mercado Pago. A cobrança é recorrente conforme o ciclo do plano, com renovação automática até cancelamento. Não há fidelidade — o cancelamento pode ser feito a qualquer momento.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">6. Reembolso</h2>
          <p>Conforme o Código de Defesa do Consumidor, a usuária tem 7 dias após a contratação para solicitar reembolso integral, desde que não tenha consumido o serviço (gerado o diagnóstico).</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">7. Limitação de Responsabilidade</h2>
          <p>As recomendações geradas são sugestões de estilo e não substituem consultoria presencial, atendimento médico ou nutricional. A EST ELITE não se responsabiliza por decisões pessoais tomadas com base nos relatórios.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">8. Propriedade Intelectual</h2>
          <p>Marca, identidade visual, código, conteúdo editorial e os relatórios gerados pertencem à EST ELITE. É vedada a reprodução comercial sem autorização expressa.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">9. Exclusão de Conta</h2>
          <p>A usuária pode solicitar exclusão definitiva da conta e de todos os seus dados pelo e-mail <a href="mailto:contato@estelite.com.br" className="text-primary hover:underline">contato@estelite.com.br</a>. A exclusão é processada em até 30 dias.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">10. Alterações</h2>
          <p>Estes Termos podem ser atualizados. Alterações relevantes serão comunicadas por e-mail e/ou na plataforma.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">11. Foro</h2>
          <p>Fica eleito o foro da Comarca de Brasília/DF para dirimir quaisquer controvérsias.</p>

          <h2 className="font-serif text-2xl text-foreground mt-8">12. Contato</h2>
          <p>Dúvidas: <a href="mailto:contato@estelite.com.br" className="text-primary hover:underline">contato@estelite.com.br</a>.</p>
        </div>
      </div>
    </Layout>
  );
}
