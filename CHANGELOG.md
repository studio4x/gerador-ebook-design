# Changelog

Registro das principais alterações do Gerador de E-books Design.

## v1.4.69

- Ajustado o editor visual para não consolidar Markdown a cada ação.
- Comandos de formatação passam a atuar apenas no DOM temporário durante a edição.
- O conteúdo editado é consolidado somente ao clicar em **Salvar & Voltar**.
- Corrigido efeito colateral que fazia capa, folha de rosto, sumário e página final desaparecerem durante a edição visual.

## v1.4.68

- Corrigido o histórico de desfazer/refazer para quebras manuais de página.
- O botão **Quebra** passa a capturar snapshot antes de inserir a quebra.
- Removida duplicação de serialização no handler da quebra, usando `serializeEditorDomToMarkdown()`.

## v1.4.67

- Adicionada camada de links clicáveis no PDF exportado.
- Links internos do sumário passam a navegar para a página correspondente no PDF.
- Links externos (`http`, `https`, `mailto`, `tel`) passam a ser preservados como anotações clicáveis.

## v1.4.66

- Criado motor de undo/redo por snapshot no editor visual.
- Centralizada a serialização HTML -> Markdown do editor visual.
- Botões de formatação passaram a usar histórico visual próprio.

## v1.4.65

- Adicionada proteção contra fechamento/reload durante exportação PDF.
- Adicionado uso progressivo da Screen Wake Lock API durante geração de PDF.

## v1.4.64

- Removida a aba separada **Editar Conteúdo**.
- Corrigido o paginador para tratar quebras manuais como comando de fluxo, sem inserir marcadores invisíveis nas páginas.
- Mantido o editor visual como principal ponto de ajustes pontuais.

## v1.4.63 e anteriores

- Estrutura inicial do app com importação de Markdown, handoff visual, pré-visualização, PDF e EPUB.
