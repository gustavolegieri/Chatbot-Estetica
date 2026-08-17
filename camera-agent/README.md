# Portão IA — agente local da webcam

Este agente roda no computador da estética. A webcam é processada localmente e o vídeo não é enviado para a internet. O CRM recebe somente dois eventos:

- `ENTER`: o veículo cruzou de fora para dentro; a lavagem é iniciada.
- `EXIT`: o veículo cruzou de dentro para fora; o atendimento entra em finalização.

## Posicionamento da câmera

Instale a webcam em local alto e protegido, apontando para a passagem do portão. A imagem precisa mostrar aproximadamente 2 m antes e 2 m depois do portão.

Na instalação com a câmera dentro da garagem olhando para a rua, mantenha a rua na parte superior da imagem e o interior da garagem na parte inferior. Use `GATE_FLIP_VERTICAL=false`. Posicione `GATE_LINE` exatamente sobre a risca física do portão: cruzou para baixo, entrou e inicia a lavagem; cruzou para cima, saiu e finaliza.

O programa desenha uma única linha virtual:

```text
RUA / RAMPA ───────── RISCA DO PORTÃO ───────── GARAGEM
```

A direção do cruzamento define entrada ou saída. Pessoas são ignoradas; o modelo acompanha apenas carro, moto, ônibus e caminhão. Uma margem invisível pequena evita eventos repetidos quando a caixa do veículo oscila sobre a risca.

## Instalação no Windows

1. Instale Python 3.11 ou superior.
2. Abra o terminal nesta pasta.
3. Crie o ambiente: `python -m venv .venv`.
4. Ative: `.venv\Scripts\activate`.
5. Instale: `pip install -r requirements.txt`.
6. Copie `.env.example` para `.env` e preencha URL e token.
7. Na Vercel, crie `GATE_VISION_DEVICE_TOKEN` com o mesmo token.
8. Inicie com `python gate_vision_agent.py`.

## Validação segura

Antes do uso real, execute `python validate_gate_system.py --camera-seconds 6`. O teste verifica placas antigas e Mercosul sob diferentes ângulos, perspectiva, luz, desfoque, ruído e distância; simula entrada e saída na rampa; procura falsos positivos; e abre a webcam sem enviar nenhum evento ao servidor. Para testar apenas os cenários sintéticos, use `python validate_gate_system.py --skip-camera`.

Na primeira execução, os modelos leves de detecção e OCR são baixados automaticamente. A prévia mostra a risca do portão, a caixa do veículo e a placa reconhecida. Ajuste `GATE_LINE` até a linha da tela coincidir com a risca física do portão. Pressione `Q` para fechar.

Para uma leitura confiável, o agente solicita imagem 1920×1080, boa iluminação e a placa dianteira ou traseira deve ocupar pelo menos 100 pixels de largura. Evite ângulo muito lateral, reflexo direto e contraluz. Se a linha não coincidir com a passagem física, ajuste `GATE_LINE` observando a prévia.

## Regras de segurança operacional

- O sistema aceita somente uma entrada por vez; outra entrada é ignorada até ocorrer uma saída.
- Eventos possuem identificador único e são deduplicados pelo servidor.
- Se a internet cair, eventos ficam em `pending-events.json` e são reenviados.
- O estado ocupado/livre fica salvo em `gate-state.json`, inclusive após reiniciar o computador.
- A placa precisa ter confiança mínima e coincidir exatamente com a placa cadastrada pelo cliente no WhatsApp.
- Sem leitura confiável ou sem correspondência, o PWA alerta a equipe e o sistema não altera um cliente aleatório.
- Clientes antigos sem placa cadastrada precisam informá-la no próximo agendamento.

Para uso diário, configure o programa no Agendador de Tarefas do Windows para iniciar junto com o computador.
