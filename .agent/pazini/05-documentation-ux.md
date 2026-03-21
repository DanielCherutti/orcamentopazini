# Documentação e UX

## Documentação (README)
- **Centralizar em `README.md` na raiz**
- **NUNCA criar arquivos separados** (exceto se solicitado)
- **Estrutura:**
  - Visão Geral
  - Instalação
  - Uso
  - Comandos Disponíveis
  - Atualização
  - Desenvolvimento
  - CI/CD e Releases
  - Compatibilidade
  - Especificações
  - Estrutura do Projeto
- **Ao finalizar entrega:** atualizar README

## Documentação de Código
- Funções públicas: sempre documentar
- Funções complexas: explicar lógica
- TODOs: incluir issue/spec número
- Interfaces: comentar contrato
- Structs complexas: comentar campos importantes

## UX de CLI
- Mensagens curtas e acionáveis
- Help sempre disponível (`--help`)
- Códigos de saída padronizados: 0 ok; 1 erro; 2 input inválido; 3 rede; 4 auth; 5 update
- stdout para output; stderr para erros/logs

## Observabilidade
- `--debug` opcional para logs verbosos
- **Níveis:** ERROR, WARN, INFO, DEBUG
- **Estrutura:** JSON em modo debug, incluir contexto
- **Métricas:** documentar na spec
