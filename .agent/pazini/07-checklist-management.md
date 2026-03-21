# Gerenciamento de Checklist nas Specs

## Ao implementar funcionalidade
- Após concluir e validar, **marcar automaticamente todos os itens do checklist**
- Atualizar: `- [ ]` → `- [x]`
- Se item não se aplica: marcar com nota explicativa
- **Nunca marcar antes de implementar e validar**
- Implementação parcial: marcar apenas itens implementados

## Formato do checklist
- Formato padronizado: `- [ ]` pendente, `- [x]` concluído
- Localização: final da spec, após "Abertos / Fora de Escopo"
- Exatamente 6 itens conforme template

## Validação de status
- Spec completa: (1) seções obrigatórias E (2) checklist todo marcado
- Comandos úteis (se aplicável):
  - Validação: valida specs contra checklist
  - Verificação: consistência estrutural
  - Listagem: status de todas as specs
