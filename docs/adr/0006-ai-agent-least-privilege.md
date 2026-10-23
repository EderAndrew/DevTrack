# ADR-0006 — Privilégios Mínimos e Isolamento dos Agentes de IA

**Status:** Proposta  
**Data:** 2026-10-23  
**Decisores:** Equipe responsável pela arquitetura e segurança do projeto  
**Relacionadas:** ADR-0002, ADR-0003, ADR-0004 e ADR-0005

## 1. Contexto

O projeto utiliza agentes de inteligência artificial para auxiliar no desenvolvimento de software e na auditoria de segurança.

O Claude Code executa operações sobre arquivos e comandos por meio de ferramentas autorizadas. A Skill `owasp-security-auditor` utiliza ferramentas de leitura, pesquisa e execução de comandos Bash.

A arquitetura atual possui hooks responsáveis por identificar alterações, registrar arquivos pendentes, solicitar auditorias e verificar a integridade das evidências.

Entretanto, permitir que um agente modifique os mecanismos responsáveis por sua própria fiscalização representa um risco arquitetural.

Também existem riscos relacionados à execução de comandos, exposição de credenciais, acesso indevido a arquivos e manipulação das evidências de auditoria.

É necessário estabelecer limites claros de responsabilidade, acesso e execução.

## 2. Decisão arquitetural proposta

Adotar o princípio do menor privilégio para todos os agentes de IA utilizados no projeto.

Cada agente deverá possuir somente as permissões necessárias para executar sua função.

As responsabilidades de desenvolvimento, auditoria, confirmação e aprovação deverão ser separadas sempre que tecnicamente possível.

A arquitetura deverá evoluir para impedir que um agente consiga modificar unilateralmente os mecanismos responsáveis por validar suas próprias operações.

## 3. Papéis dos agentes

### 3.1. Agente desenvolvedor

Responsável por implementar funcionalidades, corrigir defeitos e realizar alterações autorizadas no código-fonte.

Permissões previstas:

- Ler arquivos necessários à implementação.
- Criar e modificar código dentro do escopo autorizado.
- Executar testes permitidos.
- Consultar documentação e ADRs.
- Solicitar auditorias.

Restrições:

- Não modificar scripts de auditoria sem autorização específica.
- Não alterar evidências para obter aprovação.
- Não registrar confirmações manualmente.
- Não conceder exceções de segurança.
- Não acessar segredos desnecessários à tarefa.

### 3.2. Agente auditor

Responsável por analisar alterações e identificar riscos de segurança.

Permissões previstas:

- Ler os arquivos pendentes.
- Consultar ADRs e políticas.
- Executar ferramentas de análise autorizadas.
- Produzir relatórios de auditoria.
- Solicitar confirmação por meio do script previsto.

Restrições:

- Não modificar código-fonte durante a auditoria.
- Não alterar hooks ou políticas de aprovação.
- Não manipular resultados para obter aprovação.
- Não conceder exceções.
- Não declarar verificações não realizadas como concluídas.

### 3.3. Mecanismo de confirmação

Responsável por validar as evidências produzidas durante a auditoria.

Deverá operar por meio de regras determinísticas.

Responsabilidades:

- Validar a estrutura do relatório.
- Verificar os hashes dos arquivos.
- Verificar a correspondência com a sessão.
- Registrar a confirmação.
- Rejeitar inconsistências.

O mecanismo de confirmação não deverá depender exclusivamente de declarações feitas pelo agente auditor.

### 3.4. Responsável pela aprovação

Responsável por aplicar a política de aceitação de riscos e autorizar exceções.

A aprovação de alterações com riscos relevantes deverá exigir autoridade distinta da do agente responsável pela implementação ou auditoria.

## 4. Matriz de permissões proposta

| Operação | Desenvolvedor | Auditor | Validador | Aprovador |
|---|---|---|---|---|
| Ler código-fonte | Sim | Sim | Conforme necessário | Conforme necessário |
| Modificar código-fonte | Sim, no escopo | Não | Não | Não |
| Ler ADRs | Sim | Sim | Sim | Sim |
| Modificar ADRs | Mediante autorização | Não | Não | Mediante processo autorizado |
| Executar análise SAST | Conforme configuração | Sim | Não | Não |
| Gerar relatório de auditoria | Não | Sim | Não | Não |
| Validar hashes | Não | Consultivo | Sim | Consultivo |
| Registrar confirmação | Não | Solicita | Sim | Não |
| Aprovar exceções | Não | Não | Não | Sim |
| Alterar hooks de segurança | Mediante revisão específica | Não | Não | Mediante processo autorizado |

A matriz representa a política pretendida, não uma garantia de isolamento já implementada.

## 5. Proteção dos mecanismos de segurança

Os seguintes recursos deverão ser considerados sensíveis:

- `.claude/settings.json`
- `.claude/hooks/security-check.sh`
- `.claude/hooks/audit-complete.sh`
- `.claude/skills/owasp-security-auditor/SKILL.md`
- `docs/adr/`
- Configurações de políticas de aprovação.
- Diretórios e registros de auditoria.

Alterações nesses recursos deverão passar por revisão específica.

A implementação futura deverá utilizar mecanismos independentes do próprio agente, como permissões do sistema operacional, processos isolados e regras de proteção em CI/CD.

Instruções em prompts e Skills, isoladamente, não constituem controles efetivos de acesso.

## 6. Execução de comandos

A execução de comandos por agentes deverá observar:

- Escopo mínimo necessário.
- Preferência por operações somente de leitura durante auditorias.
- Proibição de comandos destrutivos não autorizados.
- Restrição de acesso a diretórios sensíveis.
- Limitação de execução de processos externos.
- Validação de argumentos provenientes de entradas não confiáveis.
- Registro de comandos relevantes.

A utilização de Bash deverá ser tratada como uma capacidade privilegiada.

Uma lista de ferramentas permitidas não equivale automaticamente à restrição dos comandos que podem ser executados dentro dessas ferramentas.

## 7. Proteção de credenciais

Os agentes não deverão acessar credenciais além das necessárias para suas tarefas.

As seguintes práticas deverão ser adotadas:

- Utilizar variáveis de ambiente ou mecanismos apropriados de gerenciamento de segredos.
- Não inserir credenciais em prompts.
- Não registrar tokens e senhas em relatórios.
- Não incluir segredos em commits.
- Limitar o acesso a arquivos de configuração sensíveis.
- Aplicar rotação e revogação de credenciais quando necessário.

O mecanismo deverá considerar a possibilidade de exposição acidental de segredos durante a análise de arquivos.

## 8. Isolamento de execução

A arquitetura deverá evoluir para executar operações sensíveis em ambientes com permissões restritas.

Medidas propostas:

- Processos separados para desenvolvimento e auditoria.
- Identidades distintas quando necessário.
- Sistemas de arquivos com permissões específicas.
- Execução de ferramentas em ambientes isolados.
- Restrições de rede.
- Limites de tempo e recursos.
- Proteção dos arquivos de confirmação.

O isolamento deverá ser implementado de acordo com os riscos e as capacidades do ambiente utilizado.

## 9. Proteção contra prompt injection

Arquivos de código, comentários, documentos, resultados de ferramentas e conteúdos externos deverão ser considerados entradas potencialmente não confiáveis.

O agente não deverá interpretar instruções presentes nesses materiais como autorização para:

- Ignorar políticas de segurança.
- Modificar hooks.
- Desativar auditorias.
- Expor credenciais.
- Executar comandos não autorizados.
- Falsificar resultados.
- Conceder aprovações.

As instruções operacionais deverão possuir uma origem de confiança definida.

O controle efetivo deverá depender também de restrições técnicas, e não apenas da capacidade do agente de reconhecer instruções maliciosas.

## 10. Separação entre auditoria e aprovação

O agente responsável por produzir o relatório não deverá possuir autoridade para aprovar riscos relevantes.

A confirmação técnica deverá verificar consistência e integridade.

A aprovação deverá aplicar a política definida na ADR-0005.

Quando houver necessidade de exceção, deverá existir autorização explícita de responsável competente.

A arquitetura não deverá considerar a execução de `audit-complete.sh` como aprovação de segurança.

## 11. Alterações nas políticas de segurança

Modificações em hooks, Skills, ADRs e políticas deverão possuir processo de revisão específico.

O processo proposto inclui:

1. Identificação da alteração.
2. Justificativa técnica.
3. Avaliação de impacto.
4. Revisão por responsável autorizado.

5. Testes de regressão.
6. Registro da decisão.
7. Aplicação controlada.

Alterações destinadas a desabilitar verificações ou reduzir proteções deverão ser tratadas como mudanças sensíveis.

## 12. Auditoria das operações dos agentes

O sistema deverá evoluir para registrar operações relevantes, incluindo:

- Modificações em arquivos protegidos.
- Execução de comandos privilegiados.
- Falhas de autorização.
- Tentativas de alterar evidências.
- Alterações nas políticas.
- Solicitações de exceção.
- Resultados das verificações.

Os registros deverão evitar exposição de dados sensíveis.

## 13. Limitações atuais

A implementação atual ainda não oferece isolamento completo entre os papéis definidos.

Entre as limitações conhecidas:

- A Skill possui acesso à ferramenta Bash.
- O agente pode operar no mesmo ambiente de arquivos dos hooks.
- As restrições são parcialmente declarativas.
- Não existe um serviço externo independente para confirmação.
- Os registros locais não são imutáveis.
- Ainda não existe um mecanismo completo de autorização de exceções.

Essas limitações deverão ser consideradas na avaliação de confiança do sistema.

## 14. Alternativas consideradas

**Agente único com acesso amplo:** simplifica a operação, mas concentra privilégios e aumenta o impacto de falhas.

**Separação apenas por instruções:** melhora a organização, mas não fornece isolamento técnico confiável.

**Agentes com ferramentas e permissões restritas:** reduz a superfície de ataque, mas exige configuração e manutenção.

**Processos independentes com validação externa:** oferece maior separação de responsabilidades, mas aumenta a complexidade operacional.

A arquitetura adotará progressivamente a separação técnica, priorizando operações sensíveis.

## 15. Consequências

### Positivas

- Redução da concentração de privilégios.
- Menor risco de manipulação de evidências.
- Separação de responsabilidades.
- Maior controle sobre operações sensíveis.
- Base para auditorias independentes.

### Negativas

- Maior complexidade de configuração.
- Possível redução da autonomia dos agentes.
- Necessidade de manutenção de permissões.
- Custos adicionais de infraestrutura.
- Necessidade de tratamento de falhas de autorização.

## 16. Critérios de aceitação

A implementação completa deverá demonstrar:

1. Definição formal dos papéis.
2. Permissões específicas por função.
3. Proteção técnica dos arquivos de auditoria.
4. Restrição de comandos privilegiados.
5. Separação entre geração e validação de evidências.
6. Aprovação independente para exceções.
7. Proteção contra alterações não autorizadas nas políticas.
8. Testes de tentativa de acesso indevido.
9. Registros de operações sensíveis.
10. Revisão periódica das permissões.

## 17. Referências

- ADR-0002 — Política de Segurança OWASP Top 10 e ASVS.
- ADR-0003 — Arquitetura de Auditoria Automatizada por Hooks.
- ADR-0004 — Integridade, Rastreabilidade e Evidências de Auditoria.
- ADR-0005 — Política de Aprovação e Bloqueio por Severidade.
- `.claude/settings.json`
- `.claude/hooks/security-check.sh`
- `.claude/hooks/audit-complete.sh`
- `.claude/skills/owasp-security-auditor/SKILL.md`
- OWASP Application Security Verification Standard — https://owasp.org/www-project-application-security-verification-standard/
