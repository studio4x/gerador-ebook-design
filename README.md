# Gerador de E-books Design

Aplicativo para transformar conteúdo em Markdown (`.md`) e especificações visuais em um e-book diagramado com pré-visualização, edição visual, exportação em PDF de alta fidelidade e exportação em EPUB.

O projeto foi pensado para fluxos de criação editorial em que o conteúdo textual já vem estruturado em Markdown e o layout é aplicado por regras visuais controladas pelo próprio app.

## Principais recursos

- Upload de um ou mais arquivos `.md`.
- Leitura de frontmatter/metadados do e-book.
- Upload de handoff visual em Markdown.
- Configuração visual de cores, fontes, cabeçalho, rodapé, densidade e sumário.
- Pré-visualização em páginas A4.
- Editor visual para ajustes pontuais no conteúdo.
- Histórico de desfazer/refazer no editor visual.
- Quebras manuais de página.
- Exportação PDF com layout de alta fidelidade.
- Links internos e externos clicáveis no PDF exportado.
- Exportação EPUB.
- Envio opcional de PDF/EPUB por e-mail, quando SMTP estiver configurado.
- Sincronização em nuvem via Firebase, quando habilitada.

## Fluxo recomendado de uso

1. Acesse a aba **Conteúdo**.
2. Faça upload dos arquivos `.md` do e-book.
3. Revise se o conteúdo foi carregado corretamente.
4. Acesse **Visual & Design**.
5. Importe o handoff visual ou ajuste manualmente as configurações.
6. Acesse **Visualizar & PDF**.
7. Revise a paginação.
8. Use a edição visual apenas para ajustes pontuais.
9. Clique em **Salvar & Voltar** para consolidar as edições visuais.
10. Exporte o PDF e, se necessário, o EPUB.

## Estrutura esperada do conteúdo Markdown

- Use `#` para capítulos principais.
- Use `##` e `###` para seções internas.
- Use frontmatter YAML quando quiser preencher metadados automaticamente.
- Use quebras manuais apenas quando necessário.

Exemplo mínimo:

```md
---
title: Não é Falta de Disciplina
subtitle: Rotina, energia e sobrecarga sensorial na vida adulta neurodivergente
autora: Dra. Deyse Simon
instituicao: Conexão Seres
website: https://conexaoseres.com.br
---

# Capítulo 1: Antes de falar em disciplina

Texto do capítulo...
```

## Quebras manuais de página

O app reconhece quebras manuais no conteúdo e no editor visual. O marcador recomendado no Markdown é:

```md
<!-- page-break -->
```

Durante o uso do editor visual, o botão **Quebra** insere o marcador visualmente e o conteúdo é consolidado apenas ao clicar em **Salvar & Voltar**.

## Exportação em PDF

A exportação PDF usa captura visual das páginas para preservar o layout. Após a imagem de cada página ser adicionada ao PDF, o app aplica uma camada invisível de links clicáveis para preservar:

- links internos do sumário;
- links externos para site, WhatsApp, e-mail, telefone e páginas de contato.

Durante a exportação, mantenha a aba aberta até o fim do processo.

## Variáveis de ambiente

Para envio de e-mail, configure:

```env
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

Para Firebase/CloudSync, configure as variáveis exigidas pelo arquivo de configuração Firebase do projeto.

## Comandos locais

Instalar dependências:

```bash
npm install
```

Rodar em desenvolvimento:

```bash
npm run dev
```

Validar TypeScript:

```bash
npm run lint
```

Gerar build de produção:

```bash
npm run build
```

Rodar build:

```bash
npm run start
```

Limpar build local:

```bash
npm run clean
```

## Checklist antes de publicar uma versão

Antes de considerar uma build pronta, execute:

1. `npm run lint`
2. `npm run build`
3. Upload de e-book em Markdown.
4. Upload de handoff visual.
5. Teste de edição visual.
6. Teste de desfazer/refazer.
7. Teste de quebra manual.
8. Exportação PDF.
9. Validação dos links do sumário no PDF.
10. Exportação EPUB.

Consulte também `docs/QA_CHECKLIST.md`.

## Versionamento

A versão exibida no cabeçalho do app fica em `buildVersionStr`, dentro de `src/App.tsx`.

Sempre que alterar comportamento funcional, incrementar a versão e registrar a mudança em `CHANGELOG.md`.
