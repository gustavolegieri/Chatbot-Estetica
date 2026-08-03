# Captação de leads — Jundiaí

## Estrutura

- Página pública: `/jundiai`
- Cadastro: `POST /api/leads/public`
- CRM: `/admin/pipeline`
- QR Code rastreável: `/api/leads/qr?source=instagram`

O formulário solicita nome, celular com DDD 11, bairro, veículo, interesse e
autorização para contato pelo WhatsApp. O cadastro cria ou atualiza o cliente,
evita duplicidade pelo telefone e registra a origem e a data da autorização no
CRM.

## Meta operacional: 10 leads por semana

O painel conta cadastros autorizados recebidos nos últimos sete dias. A meta é
móvel e não representa garantia de aquisição: ela depende da distribuição dos
links e QR Codes.

Plano inicial de distribuição:

- Instagram: meta de 3 leads/semana
- Perfil da empresa no Google: meta de 2 leads/semana
- Parceiros locais: meta de 3 leads/semana
- Indicações de clientes: meta de 2 leads/semana

Os quatro canais possuem URLs diferentes. O painel mostra a origem de cada lead
e permite baixar o QR Code correspondente, tornando possível substituir canais
que não estejam entregando resultado.

## Segurança

- Apenas celulares com DDD 11 são aceitos.
- O consentimento é obrigatório.
- Há campo invisível contra bots e limite básico de tentativas.
- Nenhuma mensagem é enviada automaticamente no cadastro.
- Após concluir o formulário, o próprio interessado pode iniciar a conversa
  pelo botão do WhatsApp.
