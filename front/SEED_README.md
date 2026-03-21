# Scripts de Seed - Pazini

Este diretório contém scripts para popular o banco de dados SurrealDB com dados de teste.

## Scripts Disponíveis

### 1. `init-db.ts` - Inicialização do Banco

Cria o namespace, database e tabela de produtos no SurrealDB.

```bash
bun run init:db
```

**O que faz:**
- Conecta ao SurrealDB
- Cria/verifica o namespace `dreibox`
- Cria/verifica o database `pazini`
- Define a estrutura da tabela `product` com todos os campos e índices

**Quando usar:**
- Primeira vez que configurar o projeto
- Após limpar o banco de dados
- Para garantir que a estrutura está correta

---

### 2. `seed-products.ts` - Seed de Produtos

Gera 50 produtos de teste com dados realistas.

```bash
bun run seed:products
```

**O que faz:**
- Verifica produtos existentes (avisa se já houver dados)
- Gera 50 produtos com:
  - Códigos únicos (EQ-0001, MT-0002, etc.)
  - Descrições variadas de equipamentos e materiais
  - Especificações técnicas em HTML
  - Preços aleatórios realistas
  - Unidades de medida apropriadas

**Categorias de produtos:**
- `EQ` - Equipamento (UN, KG, M)
- `MT` - Material (M, M², M³, KG)
- `FX` - Fixação (UN, CX, PCT)
- `AC` - Acessório (UN, PAR, JG)
- `CB` - Cabo (M, RL, UN)

**Quando usar:**
- Para popular o banco com dados de teste
- Para testar paginação e busca
- Para demonstrações do sistema

---

### 3. `verify-products.ts` - Verificação de Produtos

Verifica quantos produtos existem no banco e lista os primeiros 10.

```bash
npx tsx verify-products.ts
```

**O que faz:**
- Conta total de produtos no banco
- Conta produtos da empresa padrão (company_id=0)
- Lista os primeiros 10 produtos com código e descrição

**Quando usar:**
- Para verificar se o seed funcionou
- Para debugar problemas com produtos
- Para ver exemplos de dados no banco

---

## Fluxo Recomendado

### Primeira Configuração

```bash
# 1. Inicie o SurrealDB (se ainda não estiver rodando)
docker-compose up -d

# 2. Inicialize o banco de dados
bun run init:db

# 3. Popule com produtos de teste
bun run seed:products

# 4. Verifique os dados
npx tsx verify-products.ts
```

### Reset Completo

Se precisar limpar e recriar tudo:

```bash
# 1. Pare o SurrealDB
docker-compose down

# 2. Remova os dados (CUIDADO: isso apaga tudo!)
rm -rf surreal-data/*

# 3. Reinicie o SurrealDB
docker-compose up -d

# 4. Siga o fluxo de primeira configuração
bun run init:db
bun run seed:products
```

---

## Configuração

Os scripts usam as variáveis de ambiente do arquivo `front/.env`:

```env
SURREAL_URL=http://127.0.0.1:8000
SURREAL_NS=pazini
SURREAL_DB=core
SURREAL_USER=admin
SURREAL_PASS=<mesma-senha-do-surreal-sem-padrao-no-codigo>
```

**Importante:** `SURREAL_PASS` ou `SURREALDB_PASS` é **obrigatório** (a app não define senha padrão). Em dev local, use o mesmo valor que `--pass` no `docker-compose.yml` da raiz do repositório.

---

## Troubleshooting

### Erro de autenticação

```
There was a problem with authentication
```

**Solução:**
1. Verifique se o SurrealDB está rodando: `docker ps`
2. Verifique as credenciais no `front/.env`
3. Reinicie o container: `docker-compose restart`

### Produtos não aparecem

**Solução:**
1. Execute `npx tsx verify-products.ts` para verificar
2. Verifique se o namespace/database estão corretos
3. Execute `bun run init:db` novamente

### Banco não conecta

**Solução:**
1. Verifique se o Docker está rodando
2. Verifique se a porta 8000 está livre: `lsof -i :8000`
3. Reinicie o SurrealDB: `docker-compose down && docker-compose up -d`

---

## Dependências

- `tsx` - Executor TypeScript
- `dotenv` - Carregamento de variáveis de ambiente
- `surrealdb.js` - Cliente SurrealDB

Todas as dependências são instaladas automaticamente via `bun install`.
