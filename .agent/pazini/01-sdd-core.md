# Regras Core - Spec Driven Development

## Linguagem e comunicação
- Responder sempre em português (pt-BR).

## Fonte da verdade e fluxo SDD
- Especificar antes de codificar. Só gerar/alterar código a partir de specs em `specs/` validadas.
- Não implementar feature sem `*.spec.md` completa e checada pelo `specs/checklist.md`.
- Antes de iniciar implementação, passar a spec pelo checklist; se houver item reprovado, solicitar atualização da spec ao usuário e oferecer-se para fazê-la, pedindo apenas revisão.

## Fluxo obrigatório de consulta de specs
- **SEMPRE**, antes de implementar qualquer funcionalidade, feature ou mudança solicitada pelo usuário:
  1. Consultar as specs existentes em `specs/` para verificar se a funcionalidade já está especificada.
  2. Se a funcionalidade **estiver especificada** em uma spec válida:
     - Verificar se a spec está completa e passa pelo checklist.
     - Se estiver completa, **implementar diretamente** conforme a spec.
     - Se houver pendências no checklist, solicitar atualização da spec ao usuário antes de implementar.
  3. Se a funcionalidade **NÃO estiver especificada**:
     - Identificar qual spec existente deve ser ajustada (se aplicável) OU se é necessário criar uma nova spec.
     - Se ficar em dúvida sobre qual spec ajustar ou se deve criar nova, **PERGUNTAR ao usuário** qual spec ajustar ou se deve criar nova.
     - Propor a criação/ajuste da spec e **AGUARDAR CONFIRMAÇÃO EXPLÍCITA do usuário** antes de implementar.
  4. **NUNCA implementar código sem ter uma spec válida e confirmada pelo usuário** (exceto para correções de bugs críticos ou ajustes técnicos menores que não alterem comportamento funcional).
  5. Se o usuário solicitar algo que requer mudança em spec existente, mostrar o que será alterado na spec e aguardar aprovação antes de modificar tanto a spec quanto o código.

## Estrutura e diretórios
- Respeitar a estrutura definida em `specs/00-architecture.spec.md`. Não criar novas pastas fora do acordado.
- `specs/` não recebe código executável.
- **Nomenclatura**: Novas specs de funcionalidade devem seguir o padrão `{YYYYMMDDhhmmss}-descricao.spec.md`.

## Especificações: Abstração de Detalhes de Implementação
- **NUNCA incluir detalhes de implementação técnica nas specs de funcionalidades**.
- **Detalhes de stack técnica** devem estar **APENAS** em `00-stack.spec.md`.
- **O que NÃO deve aparecer em specs de funcionalidades:**
  - Nomes de ferramentas de build específicas
  - Comandos de build específicos
  - Nomes de linguagens/runtimes específicos em contexto de implementação
  - Detalhes de ferramentas de desenvolvimento
  - Bibliotecas específicas de implementação
- **O que DEVE aparecer em specs de funcionalidades:**
  - Comportamento funcional
  - Contratos e interfaces
  - Requisitos não funcionais
  - Referências genéricas quando necessário
- **Quando em dúvida:** Referenciar `00-stack.spec.md`.
