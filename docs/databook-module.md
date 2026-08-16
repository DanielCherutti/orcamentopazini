# Módulo DataBook

## Estrutura implementada

O módulo independente reutiliza o compositor visual e o pipeline PDF do sistema,
sem substituir o DataBook experimental usado pelos projetos de entrega. As rotas são:

- `/dashboard/databook-documents`: documentos vinculados a clientes;
- `/dashboard/databook-documents/new`: criação;
- `/dashboard/databook-documents/[id]`: workspace do documento;
- `/dashboard/databooks`: modelos legados/atuais de entrega técnica.
- `/api/databooks/[id]/pdf`: renderização direta;
- `/api/document-generations`: criação de job assíncrono para DataBook ou orçamento;
- `/api/document-generations/[id]`: polling de progresso e ETA.

## Entidades

As tabelas são tenant-scoped e usam o padrão `SCHEMALESS` do projeto, com validação
Zod no servidor:

- `databook`;
- `databook_section`;
- `databook_installation`;
- `databook_installation_product`;
- `databook_media`;
- `databook_attachment`;
- `product_databook_config`;
- `product_manual`;
- `document_generation_job`.

A migração idempotente é executada com:

```bash
npm run migrate:databook
```

## Regras implementadas

- cliente obrigatório e pertencente ao tenant ativo;
- código e título obrigatórios;
- soft delete, versão do conteúdo e invalidação do PDF;
- auditoria de criação, edição e exclusão;
- schema JSON versionado para tabelas técnicas, incluindo validação de limites,
  chaves únicas e células mescladas sem sobreposição;
- numeração calculada de instalações/produtos;
- letras de anexos/apêndices além de `Z`;
- manual interno como apêndice e externo como anexo;
- deduplicação por registro e edição/checksum;
- ETA baseado em velocidade observada com média móvel exponencial.
- compositor compartilhado para capa, cabeçalho, rodapé, sumário, seções e textos;
- cadastro visual da estrutura técnica no produto;
- snapshot da tabela, textos, produto e manual ao inserir o item;
- upload de manuais PDF e imagens técnicas validado por magic bytes;
- lista de figuras e legendas;
- mesclagem dos manuais PDF ao final via `pdf-lib`;
- geração persistida com proteção contra job duplicado e download posterior;
- progresso e ETA compartilhados com a exportação de orçamentos.

## PDF e processamento assíncrono

O job é persistido em `document_generation_job`, responde imediatamente com `202`
e é executado pelo `after()` do Next.js. A interface consulta o estado a cada 1,5 s.
O arquivo final fica no storage privado já utilizado pelo sistema. React-PDF gera o
conteúdo principal e `pdf-lib` acrescenta cada manual consolidado uma única vez.

Limitação operacional: o repositório não possui broker ou processo worker separado.
Portanto, o job sobrevive à navegação do usuário, mas uma reinicialização do processo
Next.js durante a geração interrompe o trabalho. Para alta disponibilidade com
centenas de páginas, o executor de `runGenerationJob` deve ser chamado por um worker
externo mantendo o mesmo registro persistido e a mesma API de polling.

## Testes

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Os testes de domínio cobrem numeração, letras, classificação/deduplicação de
manuais, validação estrutural da tabela e ETA.
