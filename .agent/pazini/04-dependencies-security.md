# Dependências e Segurança

## Guardrails de dependências
- Evitar adicionar dependências novas
- **Antes de adicionar:**
  - Verificar se pode ser implementado sem dependência
  - Avaliar: tamanho, manutenção, licença, compatibilidade
  - Criar ADR justificando
  - Verificar vulnerabilidades
- **Dependências permitidas:**
  - Bibliotecas padrão (preferir)
  - Bibliotecas amplamente utilizadas
  - Evitar > 1MB ao binário
- **Versionamento:**
  - Fixar versões major (`v1.2.3` não `^v1.2.3`)
  - Atualizar regularmente (security patches)
  - Documentar em changelog

## Segurança
- Nunca logar segredos/tokens
- Não alterar configs sem confirmação
- Armazenamento seguro (XDG-compliant paths)

## Compatibilidade
- Suporte: macOS/Linux (Windows só se explicitado)
- Evitar paths hardcoded
- Respeitar XDG
- Mudanças de estado requerem plano de migração/rollback
