# Portão IA — agente local da webcam

Este agente roda no computador da estética. A webcam é processada localmente e o vídeo não é enviado para a internet. O CRM recebe somente dois eventos:

- `ENTER`: o veículo cruzou de fora para dentro; a lavagem é iniciada.
- `EXIT`: o veículo cruzou de dentro para fora; o atendimento entra em finalização.

## Posicionamento da câmera

Instale a webcam em local alto e protegido, apontando para a passagem do portão. A imagem precisa mostrar aproximadamente 2 m antes e 2 m depois do portão.

O programa desenha duas linhas virtuais:

```text
RUA ─── linha FORA ─── portão ─── linha DENTRO ─── GARAGEM
```

A ordem das linhas define a direção. Pessoas são ignoradas; o modelo acompanha apenas carro, moto, ônibus e caminhão.

## Instalação no Windows

1. Instale Python 3.11 ou superior.
2. Abra o terminal nesta pasta.
3. Crie o ambiente: `python -m venv .venv`.
4. Ative: `.venv\Scripts\activate`.
5. Instale: `pip install -r requirements.txt`.
6. Copie `.env.example` para `.env` e preencha URL e token.
7. Na Vercel, crie `GATE_VISION_DEVICE_TOKEN` com o mesmo token.
8. Inicie com `python gate_vision_agent.py`.

Na primeira execução, os modelos leves de detecção e OCR são baixados automaticamente. A prévia mostra as duas linhas, a caixa do veículo e a placa reconhecida. Ajuste `GATE_OUTSIDE_LINE` e `GATE_INSIDE_LINE` até que uma fique antes e a outra depois do portão. Pressione `Q` para fechar.

Para uma leitura confiável, use imagem 1080p, boa iluminação e posicione a webcam de modo que a placa dianteira ou traseira ocupe pelo menos 100 pixels de largura. Evite ângulo muito lateral, reflexo direto e contraluz.

## Regras de segurança operacional

- O sistema aceita somente uma entrada por vez; outra entrada é ignorada até ocorrer uma saída.
- Eventos possuem identificador único e são deduplicados pelo servidor.
- Se a internet cair, eventos ficam em `pending-events.json` e são reenviados.
- O estado ocupado/livre fica salvo em `gate-state.json`, inclusive após reiniciar o computador.
- A placa precisa ter confiança mínima e coincidir exatamente com a placa cadastrada pelo cliente no WhatsApp.
- Sem leitura confiável ou sem correspondência, o PWA alerta a equipe e o sistema não altera um cliente aleatório.
- Clientes antigos sem placa cadastrada precisam informá-la no próximo agendamento.

Para uso diário, configure o programa no Agendador de Tarefas do Windows para iniciar junto com o computador.
