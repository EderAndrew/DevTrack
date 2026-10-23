# ADR-0004 — Integridade, Rastreabilidade e Evidências de Auditoria

**Status:** Proposta  
**Data:** 2026-10-23  
**Decisores:** Equipe responsável pela arquitetura e segurança do projeto  
**Relacionadas:** ADR-0002 e ADR-0003

## 1. Contexto

O projeto utiliza agentes de IA para desenvolver e auditar código-fonte.

O mecanismo atual registra alterações por meio de hooks do Claude Code, executa a Skill `owasp-security-auditor` e gera relatórios estruturados.

As auditorias utilizam identificadores de sessão e assinaturas SHA-256 para verificar a integridade dos arquivos analisados e dos relatórios.

Testes realizados demonstraram que alterações posteriores no relatório são detectadas e que confirmações inválidas são rejeitadas.

Entretanto, a integridade criptográfica não equivale à autenticidade das evidências. Um processo que consiga modificar tanto o relatório quanto os mecanismos de confirmação pode comprometer a confiabilidade da auditoria.

É necessário formalizar como as evidências serão produzidas, verificadas, preservadas e utilizadas em decisões de segurança.

## 2. Decisão arquitetural

Adotar um modelo de evidências de auditoria com:

1. Identificação explícita da sessão.
2. Registro dos arquivos auditados.
3. Hashes SHA-256 dos arquivos.
4. Relatório estruturado em JSON.
5. Hash SHA-256 do relatório.
6. Validação antes da confirmação.
7. Preservação de evidências para revisão posterior.
8. Separação entre confirmação técnica e aprovação de segurança.

O armazenamento protegido e a validação independente serão implementados progressivamente.

## 3. Identificação e isolamento

Cada auditoria deverá utilizar o `SESSION_ID` fornecido pelo hook correspondente.

O diretório de estado será identificado por:

`SESSION_HASH = SHA256(SESSION_ID)`

O mecanismo não deverá utilizar identificadores de outras sessões nem selecionar automaticamente a sessão mais recente.

Esse isolamento evita compartilhamento acidental de estados, mas não impede acesso indevido por processos que possuam permissões suficientes.

## 4. Estrutura das evidências

O relatório atual deverá conter:

- `schemaVersion`
- `sessionId`
- `status`
- `result`
- `files`
- `findings`

Cada arquivo deverá possuir caminho e hash SHA-256.

Cada achado deverá registrar regra, severidade, arquivo, descrição e recomendação.

O campo de linha poderá ser omitido quando não houver localização precisa.

O relatório poderá indicar ausência de achados, mas não deverá declarar que o código está comprovadamente livre de vulnerabilidades.

## 5. Estados e resultados

A auditoria deverá distinguir três conceitos:

**Execução:** a análise de segurança foi realizada.

**Confirmação:** o relatório foi validado e sua integridade corresponde aos arquivos analisados.

**Aprovação:** os resultados satisfazem os critérios de aceitação definidos pela política de segurança.

A confirmação não implica aprovação.

O resultado `passed` significa que não foram registrados achados na análise realizada.

O resultado `findings` significa que existem achados documentados.

Nenhum desses resultados constitui garantia absoluta de segurança.

## 6. Integridade dos arquivos

Cada arquivo auditado deverá possuir um hash SHA-256 calculado a partir de seu conteúdo.

O script de confirmação deverá comparar os hashes declarados no relatório com os hashes efetivamente calculados.

O hash agregado deverá ser calculado de maneira determinística, considerando a lista de arquivos pendentes.

Arquivos ausentes ou divergências deverão impedir a confirmação.

## 7. Integridade do relatório

O relatório JSON deverá possuir um hash SHA-256 calculado após sua geração.

A confirmação deverá registrar:

`HASH_DO_CODIGO HASH_DO_RELATORIO DATA_UTC`

O hook `Stop` deverá comparar os hashes registrados com o conteúdo atual.

Quando houver divergência:

- A confirmação deverá ser invalidada.
- A auditoria deverá permanecer pendente.
- A falha deverá ser registrada.
- Uma nova confirmação dependerá de nova validação.

A implementação atual detecta modificações posteriores no cenário em que o marcador de confirmação permanece íntegro.

## 8. Evidências de execução

A evolução do relatório deverá incluir informações verificáveis sobre as atividades realizadas.

Campos propostos:

- `checksPerformed`
- `checksNotPerformed`
- `toolsExecuted`
- `startedAt`
- `completedAt`
- `auditorVersion`

Esses campos deverão ser incorporados somente após atualização coordenada da Skill, do esquema JSON e do validador.

O preenchimento desses campos pelo próprio agente não constitui comprovação independente de execução.

Ferramentas externas deverão produzir resultados verificáveis quando possível.

## 9. Preservação e retenção

Os relatórios confirmados deverão ser preservados para revisão posterior.

A política de retenção deverá definir:

- Prazo de armazenamento.
- Responsável pela manutenção.
- Permissões de leitura e escrita.
- Procedimentos de arquivamento.
- Proteção contra alterações.
- Política de descarte.
- Tratamento de dados sensíveis.

O armazenamento atual em `.claude/hooks/.audit-state/` é local e não deve ser considerado um repositório imutável.

O prazo de retenção ainda será definido conforme os requisitos do projeto.

## 10. Proteção contra adulterações

A arquitetura deverá evoluir para reduzir a possibilidade de manipulação das evidências.

Medidas propostas:

- Restringir permissões de escrita nos diretórios de auditoria.
- Separar o processo auditor do processo responsável pela confirmação.
- Executar verificações independentes.
- Preservar cópias dos relatórios em armazenamento protegido.
- Registrar eventos em logs externos ou com proteção contra alteração.
- Avaliar assinaturas digitais ou mecanismos equivalentes de autenticidade.
- Controlar modificações nos scripts e nas políticas de segurança.

Essas medidas ainda não estão integralmente implementadas.

## 11. Concorrência e consistência

O mecanismo deverá considerar alterações simultâneas nos arquivos e no estado da auditoria.

Riscos conhecidos:

- Modificação do código entre análise e confirmação.
- Modificação do relatório durante a validação.
- Execução concorrente de hooks.
- Alterações simultâneas em uma mesma sessão.
- Confirmações associadas a versões diferentes dos arquivos.

A arquitetura deverá evoluir para utilizar operações atômicas e mecanismos de sincronização quando necessário.

A implementação atual não deve ser considerada livre de condições de corrida sem testes específicos.

## 12. Privacidade e dados sensíveis

Relatórios e logs não deverão armazenar credenciais, tokens, senhas ou outros segredos em texto puro.

Evidências deverão ser suficientes para análise sem reproduzir desnecessariamente informações sensíveis.

Quando uma vulnerabilidade envolver segredos, o relatório deverá registrar o problema sem divulgar o valor identificado.

O acesso às evidências deverá ser limitado aos responsáveis autorizados.

## 13. Responsabilidades

### Agente auditor

- Analisar os arquivos pendentes.
- Registrar achados e limitações.
- Produzir o relatório.
- Não falsificar evidências.
- Não modificar o código durante a auditoria.

### Script de confirmação

- Validar o relatório.
- Conferir hashes.
- Registrar a confirmação.
- Rejeitar inconsistências.

### Hook Stop

- Validar a confirmação.
- Detectar divergências.
- Preservar pendências em caso de falha.
- Encerrar a auditoria quando as condições técnicas forem satisfeitas.

### Responsável pela segurança

- Revisar achados relevantes.
- Avaliar exceções.
- Aprovar mudanças conforme a política aplicável.
- Investigar inconsistências.
- Autorizar alterações nos mecanismos de segurança.

## 14. Alternativas consideradas

**Armazenamento local sem verificação de integridade:** simples, mas não detecta alterações posteriores.

**Hashes SHA-256 locais:** detectam divergências, mas não garantem autenticidade.

**Assinaturas digitais e armazenamento protegido:** oferecem maior resistência a adulterações, mas exigem gerenciamento de chaves e infraestrutura adicional.

**Auditoria independente em CI/CD:** permite validações fora do processo local, mas depende de integração com o fluxo de desenvolvimento.

A decisão é manter os hashes atuais e evoluir progressivamente para mecanismos independentes de verificação e preservação.

## 15. Consequências

### Positivas

- Maior rastreabilidade das auditorias.
- Detecção de alterações posteriores.
- Padronização das evidências.
- Base para revisão e investigação.
- Preparação para controles independentes.

### Negativas

- Maior complexidade de armazenamento.
- Necessidade de políticas de retenção.
- Custos operacionais adicionais.
- Dependência da proteção dos mecanismos de confirmação.
- Possibilidade de falhas de sincronização e concorrência.

## 16. Critérios de aceitação

A implementação inicial deverá demonstrar:

1. Identificação correta da sessão.
2. Registro completo dos arquivos pendentes.
3. Validação dos hashes individuais.
4. Geração de relatório JSON válido.
5. Registro dos hashes do código e do relatório.
6. Detecção de adulteração posterior.
7. Preservação da pendência após falha.
8. Registro de evidências de confirmação.

A implementação avançada deverá acrescentar:

1. Proteção independente das evidências.
2. Controle de acesso ao armazenamento.
3. Política de retenção.
4. Verificações reproduzíveis.
5. Proteção contra condições de corrida.
6. Procedimentos de recuperação e investigação.

## 17. Referências

- ADR-0002 — Política de Segurança OWASP Top 10 e ASVS.
- ADR-0003 — Arquitetura de Auditoria Automatizada por Hooks.
- `.claude/hooks/security-check.sh`
- `.claude/hooks/audit-complete.sh`
- `.claude/skills/owasp-security-auditor/SKILL.md`
- OWASP Application Security Verification Standard — https://owasp.org/www-project-application-security-verification-standard/
