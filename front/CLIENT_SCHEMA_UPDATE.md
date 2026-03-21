# Atualização do Schema de Clientes

## Resumo
A função `searchClientsAction` foi atualizada para incluir os campos **cidade (city)** e **CNPJ (cnpj)** na busca e retorno de clientes.

## Alterações Realizadas

### 1. Tipo Client (`/src/actions/client-actions.ts`)
```typescript
export type Client = {
    id: string;
    name: string;
    email?: string;
    city?: string;      // Novo campo
    cnpj?: string;      // Novo campo
    details?: string;   // Mantido para compatibilidade
};
```

### 2. Função searchClientsAction
- **Busca expandida**: Agora busca por nome, email, cidade e CNPJ
- **Retorno completo**: Inclui todos os novos campos na resposta
- **Compatibilidade**: Mantém o campo `details` com cidade e CNPJ combinados

### 3. Componente ClientSelector
- **Exibição aprimorada**: Mostra cidade e CNPJ abaixo do nome/email quando disponíveis
- **Formatação**: Campos são combinados com " - " quando ambos existem

### 4. Schema do SurrealDB (`/src/lib/surreal-schemas.ts`)
Criado arquivo com definição completa do schema:
```sql
DEFINE TABLE client SCHEMAFULL;
DEFINE FIELD name ON client TYPE string ASSERT $value != NONE AND $value != "";
DEFINE FIELD email ON client TYPE string ASSERT $value = NONE OR string::is::email($value);
DEFINE FIELD city ON client TYPE string;
DEFINE FIELD cnpj ON client TYPE string;
DEFINE FIELD created_at ON client TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON client TYPE datetime DEFAULT time::now();
```

### 5. Script de Setup (`/scripts/setup-surreal-schema.ts`)
Script para criar o schema e popular dados de exemplo:
```bash
bun run setup:surreal-schema
```

## Uso

### Busca de Clientes
A função agora aceita busca por qualquer um dos campos:
```typescript
const resultado = await searchClientsAction("São Paulo"); // Busca por cidade
const resultado = await searchClientsAction("12.345.678"); // Busca por CNPJ
const resultado = await searchClientsAction("João"); // Busca por nome
```

### Retorno
```typescript
{
  success: true,
  data: [{
    id: "client:abc123",
    name: "Construtora Silva Ltda",
    email: "contato@construtorasilva.com.br", 
    city: "São Paulo",
    cnpj: "12.345.678/0001-90",
    details: "São Paulo - 12.345.678/0001-90"
  }]
}
```

## Próximos Passos
1. Executar o script de setup para criar o schema: `bun run setup:surreal-schema`
2. Verificar se os dados existentes precisam ser migrados
3. Atualizar formulários de cadastro/edição de clientes para incluir os novos campos

## Notas de Compatibilidade
- O campo `details` foi mantido para garantir compatibilidade com código existente
- Os novos campos `city` e `cnpj` são opcionais (pode ser undefined)
- A busca é case-insensitive e funciona com partial matches