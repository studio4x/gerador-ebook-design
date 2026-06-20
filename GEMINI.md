# Instruções para Agente de IA (GEMINI.md)

Este arquivo assegura que o agente da IA siga as regras de versionamento automático estabelecidas em `AGENTS.md`.

## Regra de Versionamento de Build
- Para qualquer modificação, adição de componente ou refatoração no projeto, a string `buildVersionStr` em `src/App.tsx` **DEVE** ser incrementada de forma a refletir a nova versão construída e garantir clareza no histórico do aplicativo.
- Desta forma, o cabeçalho do applet exibirá de forma precisa o indicador correspondente do andamento do produto.
