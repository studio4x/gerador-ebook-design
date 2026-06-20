# Instruções para Agentes de IA (AI Coding Agents)

Este arquivo define comportamentos essenciais de ciclo de desenvolvimento e padrões de versionamento obrigatórios para o projeto **Gerador de E-books**.

## Versionamento Automático de Build

1. **Sempre Incrementar a Versão da Build**:
   Toda vez que uma nova alteração, correção ou nova funcionalidade for implementada por você (como agente de IA), você **OBRIGATORIAMENTE** deve atualizar a string com a versão estática da build localizada no arquivo `src/App.tsx`.
   
   - Localize o seguinte trecho no arquivo `src/App.tsx`:
     ```typescript
     // Build version is statically defined corresponding to the workspace/app structure deployment
     const buildVersionStr = "v1.4.x";
     ```
   - Incremente a numeração de versão seguindo o padrão de SemVer (Major.Minor.Patch), geralmente aumentando o número de Patch em `+1`.
   - Exemplo: se a versão atual for `v1.4.3`, atualize-a para `v1.4.4` ao fazer qualquer edição que cause ou dependa de uma nova compilação.

2. **Garantia de Sincronismo**:
   Esta instrução deve ser estritamente seguida em todo ciclo de alteração concluído. Nunca conclua seu turno sem registrar e exibir a versão de build atualizada e consolidada após rodar os testes e o linter.
