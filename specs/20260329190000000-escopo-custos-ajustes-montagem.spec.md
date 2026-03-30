# Spec: Escopo — Custos, Observações, Ajustes e Montagem

**ID:** 20260329190000000
**Status:** Implementado
**Data:** 2026-03-29
**Prioridade:** Alta

---

## 1. Contexto e Objetivo

O cliente já utiliza a aba Escopo para organizar Locais, Trechos e Itens, mas precisa de controles comerciais adicionais para preparar a versão final do orçamento e da impressão.

O objetivo desta entrega é permitir:

- Exibição configurável de custos na impressão.
- Observações por item/grupo com impacto opcional no valor.
- Ajuste de preço por item em percentual ou valor monetário.
- Montagem em nível de local com três modos (percentual, valor fixo e manual), incluindo rateio proporcional quando aplicável.

Fora de escopo: mudanças visuais amplas fora da aba Escopo, novo motor de PDF, integrações externas e mudanças de permissões.

---

## 2. Requisitos Funcionais

### RF-01 — Botão `Exibir Custos`

- Deve existir um controle `Exibir Custos` na aba Escopo.
- Quando desmarcado, a impressão final não deve mostrar blocos/colunas de custos.
- Quando marcado, o usuário deve escolher uma opção de exibição:
  - `Custos por Local`
  - `Custos por Trecho`
  - `Custos Gerais`
- A opção selecionada deve ser respeitada na impressão final.

### RF-02 — Observação em Grupo ou Produto

- Cada grupo adicionado e cada produto adicionado deve ter ação `Observação`.
- Ao acionar `Observação`, deve abrir uma área compacta logo abaixo do item alvo.
- Essa área deve conter:
  - Campo de texto curto para observação.
  - Campo de valor adicional (monetário) para soma ao item.
  - Opção de exibir/não exibir a observação na impressão.
- O valor adicional da observação deve compor o total do item.

### RF-03 — Ajuste de Preço por Item

- Deve existir controle `Ajuste de Preço` com duas opções mutuamente exclusivas:
  - `Porcentagem (%)`
  - `Valor Monetário ($)`
- Quando uma opção estiver ativa, deve ser exibido no item um campo de entrada para ajuste.
- O ajuste informado deve impactar o valor do item no cálculo de totais.
- Ajustes positivos aumentam valor; ajustes negativos reduzem valor.

### RF-04 — Montagem por Local (Percentual)

- No modo `Montagem %`, o usuário informa um percentual para o local.
- O valor de montagem do local deve ser calculado sobre o somatório dos itens de todos os trechos do local.
- O valor total de montagem do local deve ser rateado proporcionalmente entre os itens do local, conforme participação de cada item no subtotal do local.

### RF-05 — Montagem por Local (Valor Fixo)

- No modo `Montagem $`, o usuário informa um valor fixo para o local.
- Esse valor deve ser rateado proporcionalmente entre os itens do local, com a mesma lógica de proporção por participação no subtotal.

### RF-06 — Montagem Manual por Item

- No modo `Montagem Manual`, o usuário informa o valor de montagem diretamente em cada item.
- O total de montagem do local deve ser a soma dos valores manuais dos itens.
- Neste modo não deve ocorrer rateio automático.

### RF-07 — Regras de Cálculo e Arredondamento

- O rateio proporcional deve considerar apenas itens ativos do local.
- Se o subtotal do local for zero, o sistema não deve dividir por zero:
  - O rateio automático deve resultar em zero por item.
  - Deve haver feedback claro ao usuário quando o valor informado não puder ser distribuído por ausência de base.
- O somatório dos valores rateados por item deve fechar exatamente com o valor de montagem do local (ajuste de arredondamento no último item ou regra equivalente de fechamento).

---

## 3. Contratos e Interfaces

### UI/UX

- A aba Escopo deve exibir os controles:
  - `Exibir Custos` + seletor de modo de exibição.
  - `Ajuste de Preço` (% ou $) com campo de entrada por item.
  - `Montagem` (% / $ / Manual) no contexto do local.
  - `Observação` por grupo/produto com área expandível sob o item.
- Estados de leitura:
  - Em modo somente leitura, campos e ações de alteração permanecem visíveis, porém desabilitados.

### Dados e Persistência

Devem ser persistidos, no contexto do orçamento/escopo, no mínimo:

- Configuração de exibição de custos para impressão.
- Observação textual por item/grupo.
- Indicador de exibir observação na impressão.
- Valor adicional de observação por item/grupo.
- Tipo e valor de ajuste de preço por item.
- Tipo e valor de montagem por local.
- Valor de montagem manual por item quando aplicável.
- Resultado de rateio por item para os modos automáticos.

### Saída para Impressão

- A impressão final deve consumir:
  - Configuração `Exibir Custos` e modo selecionado.
  - Observações com o filtro `exibir na impressão`.
  - Valores finais após ajuste de preço e montagem.

---

## 4. Fluxos e Estados

### Fluxo Feliz (resumo)

1. Usuário habilita `Exibir Custos` e escolhe o modo de visualização.
2. Usuário define ajuste de preço (% ou $) para itens necessários.
3. Usuário define montagem do local (%, $ ou manual).
4. Sistema recalcula totais do item, trecho e local.
5. Usuário adiciona observações em itens/grupos e escolhe exibição na impressão.
6. Impressão final reflete exatamente as escolhas.

### Estados Alternativos

- Valor inválido em campos monetários/percentuais: bloquear salvamento e exibir mensagem de validação.
- Local com subtotal zero em modo de rateio automático: manter valores rateados em zero e informar condição.
- Troca de modo de montagem:
  - Ao alternar entre `%`, `$` e `Manual`, o sistema deve preservar dados úteis do modo anterior quando possível, sem misturar cálculos indevidos entre modos.

### Feedback

- Mensagens de erro curtas e acionáveis para entradas inválidas.
- Atualização visual de totais após alterações.
- Indicação clara do modo ativo de ajuste e montagem.

---

## 5. Dados

### Entidades impactadas

- Orçamento (configuração de exibição de custos para impressão).
- Local (configuração de montagem e valor de referência).
- Item do escopo (ajuste de preço, observação, valor adicional, montagem manual e/ou rateio aplicado).

### Regras de negócio

- Ordem de cálculo por item:
  1. Valor base do item.
  2. Aplicação do ajuste de preço (% ou $).
  3. Soma de valor adicional da observação.
  4. Soma da parcela de montagem (rateada ou manual).
- Totais agregados:
  - Trecho = soma dos itens do trecho.
  - Local = soma dos itens dos trechos.
  - Geral = soma de todos os locais.

---

## 6. NFRs (Não Funcionais)

- **Desempenho:** alteração de campos deve refletir nos totais com latência perceptível baixa em uso normal.
- **Confiabilidade:** cálculos de rateio devem ser determinísticos e reproduzíveis.
- **Segurança e validação:** entradas numéricas devem ser validadas em cliente e servidor.
- **Observabilidade:** falhas de persistência/cálculo devem registrar erro com contexto funcional (sem dados sensíveis).

---

## 7. Guardrails

- Não quebrar fluxos já existentes da aba Escopo.
- Manter compatibilidade com orçamentos anteriores sem os novos campos.
- Evitar dependências novas para implementar esta entrega.
- Garantir consistência entre visualização no editor e saída de impressão.

---

## 8. Critérios de Aceite

- `Exibir Custos` controla exibição de custos na impressão e respeita o modo selecionado (`Local`, `Trecho`, `Geral`).
- `Observação` abre área abaixo do item/grupo com texto, valor adicional e toggle de impressão.
- Valor adicional da observação compõe corretamente o total do item.
- `Ajuste de Preço` em `%` e `$` funciona por item e recalcula totais.
- `Montagem %` calcula valor do local sobre subtotal e rateia proporcionalmente entre itens.
- `Montagem $` rateia valor fixo do local proporcionalmente entre itens.
- `Montagem Manual` permite informar valor por item e totaliza por soma simples.
- Fechamento de rateio garante que soma dos itens seja igual ao valor de montagem do local.
- Impressão final reflete observações habilitadas e valores finais calculados.

---

## 9. Testes

### E2E (principais)

- Cenário 1: habilitar `Exibir Custos` e validar cada modo na impressão.
- Cenário 2: adicionar observação com valor e validar impacto no total.
- Cenário 3: aplicar ajuste por `%` e por `$` no mesmo conjunto de itens (em momentos distintos).
- Cenário 4: aplicar montagem `%` com rateio e validar fechamento matemático.
- Cenário 5: aplicar montagem `$` com rateio e validar fechamento matemático.
- Cenário 6: aplicar montagem manual item a item e validar somatório.

### Integração

- Validação de contratos de persistência dos novos campos.
- Validação de algoritmo de rateio proporcional com casos de arredondamento.
- Validação de comportamento com subtotal zero.

### Manual

- Conferir UX de abertura/fechamento da observação abaixo do item.
- Conferir desabilitação em modo somente leitura.
- Conferir consistência entre tela e impressão para cada configuração.

---

## 10. Migração / Rollback

- **Migração:** adicionar/compatibilizar campos necessários sem remover campos legados.
- **Compatibilidade:** registros antigos devem continuar abrindo sem erro, assumindo valores padrão.
- **Rollback:** reverter a versão da aplicação sem perda dos dados existentes; novos campos não devem impedir leitura da estrutura anterior.

---

## 11. Abertos / Fora de Escopo

- Definição final de nomenclatura exibida no PDF para cada modo de custo.
- Formatação visual detalhada da impressão (tipografia e layout refinado).
- Automação de relatórios gerenciais fora da impressão padrão do orçamento.

## Checklist Rápido
- [x] Requisitos funcionais claros e testáveis?
- [x] Interfaces (UI e dados) definidas?
- [x] Fluxos de erro e estados alternativos cobertos?
- [x] Guardrails de segurança e performance verificados?
- [x] Critérios de aceite cobrem happy path e edge cases?
- [x] Migração/rollback e compatibilidade documentados?
