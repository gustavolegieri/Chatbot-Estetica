# Integração de leads com o HubSpot

A página pública `/jundiai` registra cada contato autorizado no CRM da Garagem do Ka e, quando configurada, também envia o cadastro ao HubSpot. Se o HubSpot estiver indisponível, o lead permanece salvo no CRM local.

## Configuração única no portal 51824457

1. No HubSpot, acesse **Marketing > Formulários** e crie o formulário **Avaliação Estética — Jundiaí**.
2. Inclua os campos de contato `firstname` (Nome), `phone` (Telefone) e `city` (Cidade).
3. Inclua o aviso de privacidade/consentimento para tratamento dos dados.
4. Nas configurações de formulários da conta, habilite a criação de contatos por envios sem e-mail.
5. Publique o formulário e copie o identificador GUID exibido no link de compartilhamento ou no código de incorporação.
6. Configure no ambiente local e na Vercel:

```env
HUBSPOT_PORTAL_ID="51824457"
HUBSPOT_FORM_GUID="cole-o-guid-publicado-aqui"
```

Depois de um novo deploy, o painel **Pipeline CRM** exibirá `HubSpot conectado`. Os novos cadastros da página de Jundiaí aparecerão nos dois sistemas.

## Referências oficiais

- Criação e edição de formulários: https://knowledge.hubspot.com/forms/create-and-edit-forms
- Contatos por formulários sem e-mail: https://knowledge.hubspot.com/forms/how-can-i-allow-form-submissions-without-email-addresses-to-create-contacts-in-hubspot
- API de envio de formulários: https://developers.hubspot.com/docs/api-reference/legacy/marketing/forms/v3-legacy/submit-data-unauthenticated
