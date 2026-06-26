# Instruções para Agentes de IA (AI Coding Agents)

Este arquivo define regras obrigatórias de desenvolvimento, versionamento e publicação para o projeto **Gerador de E-books**.

## Repositório oficial

- URL do repositório GitHub: `https://github.com/studio4x/gerador-ebook-design`
- Branch principal e branch de publicação: `main`
- Salvo instrução explícita em contrário do usuário, os commits finais devem ser feitos em `main`

## Versionamento automático de build

1. **Sempre incremente a versão da build**
   Toda vez que qualquer alteração, correção, refatoração, ajuste visual, atualização de documentação relevante ao app ou nova funcionalidade for implementada por você, é obrigatório atualizar a string estática de build em `src/App.tsx`.

   Trecho de referência:
   ```typescript
   // Build version is statically defined corresponding to the workspace/app structure deployment
   const buildVersionStr = "v1.4.x";
   ```

2. **Regra de incremento**
   Use SemVer no formato `Major.Minor.Patch`, normalmente incrementando `Patch` em `+1`.

   Exemplo:
   - `v1.4.3` -> `v1.4.4`

3. **Nunca finalizar alterações sem build atualizada**
   Não encerre o trabalho com arquivos alterados sem também atualizar a build correspondente.

## Validação obrigatória

Depois de qualquer alteração concluída:

1. Rode `npm run lint`
2. Rode `npm run build`
3. Só considere o ciclo concluído se ambos passarem
4. Na resposta final, informe explicitamente a versão consolidada da build

## Política de commit e push

1. **Sempre publicar quando a solicitação envolver conclusão operacional**
   Se o usuário pedir para concluir/publicar as alterações, faça `commit` e `push` ao final do trabalho.

2. **Branch de publicação**
   O destino padrão é `main`.

3. **Escopo limpo**
   Nunca inclua por padrão mudanças não relacionadas que já estejam no working tree.
   Faça stage apenas dos arquivos realmente envolvidos na tarefa atual.

4. **Mensagens de commit**
   Use mensagens curtas, objetivas e relacionadas ao efeito principal da alteração.

5. **Push**
   Após commit bem-sucedido, publique com push para `origin/main`, salvo instrução explícita diferente.

## Segurança operacional

- Não reverta mudanças do usuário sem solicitação explícita
- Se houver alterações locais não relacionadas, preserve-as fora do commit atual
- Se estiver em outra branch e o usuário exigir publicação padrão, leve o commit final para `main`
- Se houver conflito entre conveniência e rastreabilidade, priorize rastreabilidade

## Resposta final obrigatória

Ao concluir um ciclo com alterações, a resposta final deve incluir:

- o que foi alterado
- se `lint` e `build` passaram
- a versão final da build
- hash do commit e status do push, quando houver publicação
