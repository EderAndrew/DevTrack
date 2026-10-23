# ADR-0005 — Política de Aprovação e Bloqueio por Severidade

**Status:** Proposta  
**Data:** 2026-10-23  
**Decisores:** Equipe responsável pela arquitetura e segurança do projeto  
**Relacionadas:** ADR-0002, ADR-0003 e ADR-0004

## 1. Contexto

O projeto utiliza agentes de inteligência artificial para desenvolver e auditar código-fonte.

O mecanismo atual de auditoria utiliza hooks do Claude Code, uma Skill especializada em segurança OWASP, relatórios JSON e verificações de integridade SHA-256.

A auditoria já consegue registrar resultados `passed` e `findings`, além de classificar os achados por severidade.

Entretanto, a confirmação técnica de uma auditoria não significa que a alteração seja segura ou esteja autorizada para integração ou implantação.

Atualmente, relatórios que contenham vulnerabilidades podem ser confirmados tecnicamente, independentemente da severidade.

É necessário estabelecer critérios formais de aprovação, bloqueio e aceitação de riscos.

## 2. Decisão arquitetural proposta

Adotar uma política de aprovação baseada na severidade dos achados, na conclusão das verificações obrigatórias e na existência de exceções formalmente autorizadas.

O processo deverá separar:

1. **Auditoria executada:** análise realizada e relatório produzido.
2. **Auditoria confirmada:** integridade dos arquivos e do relatório validada.
3. **Alteração aprovada:** requisitos de segurança satisfeitos.
4. **Alteração bloqueada:** riscos ou falhas impedem aprovação.
5. **Alteração aprovada por exceção:** risco aceito formalmente por responsável autorizado.

O mecanismo de aprovação deverá operar de maneira independente da simples confirmação de integridade.

## 3. Classificação de severidade

Os achados utilizarão as classificações:

| Severidade | Definição |
|---|---|
| Critical | Vulnerabilidade com impacto potencial crítico e necessidade de tratamento imediato |
| High | Vulnerabilidade com impacto elevado que exige correção prioritária |
| Medium | Vulnerabilidade relevante que requer correção ou avaliação formal |
| Low | Problema de baixo risco que deve ser registrado |
| Info | Observação ou melhoria sem risco de segurança demonstrado |

A classificação deverá considerar impacto, exposição, condições de exploração e contexto do sistema.

O agente não deverá reduzir artificialmente a severidade para permitir aprovação.

## 4. Política de aprovação por severidade

| Maior severidade encontrada | Decisão padrão |
|---|---|
| Critical | Bloqueado |
| High | Bloqueado |
| Medium | Requer revisão ou aceitação formal |
| Low | Elegível para aprovação |
| Info | Elegível para aprovação |
| Nenhum achado | Elegível para aprovação |

A elegibilidade não representa aprovação automática quando verificações obrigatórias estiverem incompletas.

A presença de um achado de severidade superior prevalece sobre achados de menor severidade.

## 5. Bloqueio obrigatório

A alteração deverá ser bloqueada quando:

- Existirem achados `critical` ou `high` sem exceção formal válida.
- A auditoria obrigatória não tiver sido executada.
- O relatório estiver ausente, inválido ou incompleto.
- Existirem divergências de integridade.
- Os arquivos auditados não corresponderem aos arquivos modificados.
- Verificações obrigatórias não tiverem sido realizadas.
- Houver tentativa de adulteração das evidências.
- A política de segurança não puder ser avaliada adequadamente.

O bloqueio deverá preservar evidências suficientes para investigação.

## 6. Tratamento de achados médios

Achados `medium` deverão passar por revisão antes da aprovação.

A revisão poderá resultar em:

- Correção da vulnerabilidade.
- Reclassificação justificada mediante evidências.
- Aceitação formal de risco.
- Manutenção do bloqueio.

A revisão não poderá ser considerada concluída apenas pela declaração do agente que realizou a auditoria.

## 7. Achados baixos e informativos

Achados `low` e `info` poderão permitir aprovação quando não existirem impedimentos adicionais.

Os achados deverão permanecer registrados para acompanhamento.

A aprovação não deverá eliminar ou ocultar as evidências.

## 8. Auditorias inconclusivas

Uma auditoria deverá ser considerada inconclusiva quando não houver evidências suficientes para avaliar os requisitos obrigatórios aplicáveis.

Exemplos:

- Ferramentas obrigatórias indisponíveis.
- Arquivos relevantes não analisados.
- Falhas na coleta de evidências.
- Impossibilidade de executar verificações necessárias.
- Resultados contraditórios não resolvidos.

Auditorias inconclusivas não deverão receber aprovação automática.

O esquema de relatório deverá evoluir para representar explicitamente esse estado.

## 9. Exceções e aceitação de risco

Exceções deverão ser autorizadas por responsável distinto do agente que realizou a auditoria.

Cada exceção deverá conter:

- Identificador único.
- Achado ou requisito relacionado.
- Justificativa técnica.
- Impacto potencial.
- Medidas compensatórias.
- Responsável pela aprovação.
- Data da aprovação.
- Prazo de validade.
- Data de revisão.

Exceções vencidas deverão perder validade.

A aprovação por exceção não deverá alterar nem remover o achado original.

## 10. Separação de responsabilidades

### Agente desenvolvedor

Responsável por implementar alterações e corrigir problemas identificados.

Não poderá aprovar suas próprias alterações por meio da manipulação de relatórios ou marcadores.

### Agente auditor

Responsável por identificar riscos, produzir evidências e recomendar correções.

Não poderá conceder exceções de segurança.

### Mecanismo de validação

Responsável por verificar a integridade das evidências e aplicar regras determinísticas de aprovação.

### Responsável humano autorizado

Responsável por avaliar riscos relevantes, autorizar exceções e revisar decisões contestadas.

## 11. Modelo de decisão proposto

O mecanismo deverá produzir uma decisão estruturada e distinta do resultado da auditoria.

Estados propostos:

- `approved`
- `blocked`
- `review_required`
- `approved_with_exception`

Esses estados não substituem os campos atuais `passed` e `findings`.

O resultado da auditoria descreve os achados; a decisão de aprovação aplica a política de segurança.

## 12. Integração com os hooks

A arquitetura deverá evoluir para incorporar uma etapa de avaliação da política após a confirmação técnica.

Fluxo proposto:

1. O agente modifica o código.
2. O hook registra os arquivos.
3. A Skill realiza a auditoria.
4. O relatório JSON é produzido.
5. O script confirma a integridade.
6. O mecanismo de política avalia os achados.
7. A alteração recebe uma decisão de aprovação.
8. O resultado é registrado e apresentado ao usuário.

Uma confirmação válida não deverá ser interpretada como autorização automática para implantação.

O bloqueio deverá ser aplicado em um ponto de controle apropriado, como a integração de código ou o pipeline de CI/CD.

## 13. Segurança do mecanismo de aprovação

O agente auditor não deverá conseguir conceder a si próprio permissões de aprovação.

O mecanismo deverá adotar:

- Regras determinísticas.
- Separação de responsabilidades.
- Controle de acesso às exceções.
- Proteção das evidências.
- Registros de decisões.
- Validação independente sempre que possível.

Alterações nas regras de aprovação deverão passar por revisão autorizada.

## 14. Observabilidade e rastreabilidade

Cada decisão deverá registrar:

- Identificador da auditoria.
- Resultado da auditoria.
- Maior severidade identificada.
- Política aplicada.
- Decisão produzida.
- Justificativa.
- Exceções utilizadas.
- Data e hora.
- Identificação do responsável, quando aplicável.

Os registros deverão permitir reconstruir a decisão posteriormente.

## 15. Implementação incremental

A implementação será dividida em fases.

### Fase 1 — Classificação determinística

Implementar um avaliador que interprete o relatório JSON e identifique a maior severidade encontrada.

### Fase 2 — Decisão de aprovação

Aplicar a política de aprovação e produzir um resultado estruturado.

### Fase 3 — Integração com hooks

Integrar a decisão ao fluxo automatizado sem confundir confirmação de auditoria com aprovação.

### Fase 4 — Integração com CI/CD

Impedir integração ou implantação quando existirem bloqueios de segurança.

### Fase 5 — Exceções autorizadas

Implementar o processo de aceitação de risco com controle de acesso e rastreabilidade.

## 16. Alternativas consideradas

**Aprovar qualquer auditoria confirmada:** simples, mas permite que vulnerabilidades graves avancem sem tratamento.

****Bloquear qualquer achado:** conservador, mas pode gerar bloqueios desnecessários para observações informativas.

**Decisão exclusivamente por IA:** flexível, mas não oferece regras determinísticas e independentes.

**Política determinística com revisão humana:** oferece previsibilidade e permite decisões proporcionais ao risco.

A última alternativa é a abordagem proposta.

## 17. Consequências

### Positivas

- Critérios claros de aprovação.
- Bloqueio de vulnerabilidades graves.
- Separação entre auditoria e autorização.
- Rastreabilidade das exceções.
- Maior previsibilidade no fluxo de desenvolvimento.

### Negativas

- Possibilidade de falsos positivos.
- Aumento do tempo de revisão.
- Necessidade de responsáveis por aprovações.
- Maior complexidade operacional.
- Necessidade de manutenção das regras de classificação.

## 18. Critérios de aceitação

Esta ADR poderá ser considerada implementada quando:

1. A decisão de aprovação for independente da confirmação de integridade.
2. Achados críticos e altos resultarem em bloqueio por padrão.
3. Achados médios exigirem revisão ou exceção.
4. Achados baixos e informativos forem tratados conforme a política.
5. Auditorias incompletas não forem aprovadas automaticamente.
6. Exceções possuírem autorização e prazo de validade.
7. As decisões forem registradas.
8. Os testes cobrirem cenários positivos e negativos.
9. O bloqueio for aplicado em um ponto de controle efetivo.

## 19. Referências

- ADR-0002 — Política de Segurança OWASP Top 10 e ASVS.
- ADR-0003 — Arquitetura de Auditoria Automatizada por Hooks.
- ADR-0004 — Integridade, Rastreabilidade e Evidências de Auditoria.
- `.claude/skills/owasp-security-auditor/SKILL.md`
- `.claude/hooks/security-check.sh`
- `.claude/hooks/audit-complete.sh`