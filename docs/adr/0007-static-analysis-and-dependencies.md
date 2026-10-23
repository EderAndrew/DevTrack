# ADR-0007 — Análise Estática, Dependências e Validações Automatizadas

**Status:** Proposta  
**Data:** 2026-10-23  
**Decisores:** Equipe responsável pela arquitetura e segurança do projeto  
**Relacionadas:** ADR-0002, ADR-0003, ADR-0004, ADR-0005 e ADR-0006

## 1. Contexto

O projeto utiliza agentes de IA para desenvolver código-fonte e executar auditorias de segurança.

Atualmente, a auditoria utiliza hooks do Claude Code, uma Skill especializada em OWASP, relatórios JSON e verificações de integridade SHA-256.

Embora a análise contextual realizada por IA seja útil para identificar problemas de segurança, ela possui limitações de cobertura, reprodutibilidade e confiabilidade.

É necessário incorporar ferramentas independentes para complementar a análise, especialmente na identificação de vulnerabilidades conhecidas, configurações inseguras e problemas de dependências.

## 2. Decisão arquitetural proposta

Adotar uma estratégia de segurança em camadas, combinando:

1. Análise contextual por agentes de IA.
2. Análise estática de segurança (SAST).
3. Análise de composição de software (SCA).
4. Detecção de segredos.
5. Validação de configurações.
6. Testes automatizados de segurança.
7. Aplicação determinística de políticas de aprovação.

As verificações deverão ser executadas conforme a linguagem, a tecnologia, a superfície de ataque e o risco da alteração.

Nenhuma ferramenta isolada deverá ser considerada suficiente para garantir a segurança do sistema.

## 3. Análise estática de segurança — SAST

A análise estática deverá identificar padrões potencialmente inseguros no código-fonte.

Entre os problemas a verificar:

- Injeção de comandos.
- SQL Injection.
- Cross-Site Scripting.
- Uso inseguro de funções.
- Tratamento inadequado de entradas.
- Exposição de informações sensíveis.
- Configurações inseguras.
- Falhas comuns de autenticação e autorização identificáveis estaticamente.

A cobertura dependerá da linguagem e das regras disponíveis.

### Ferramenta candidata

**Semgrep**

Poderá ser utilizado para executar regras de segurança sobre os arquivos do projeto.

A escolha definitiva deverá considerar cobertura, manutenção, licenciamento, custo e compatibilidade com o ambiente.

A ferramenta ainda não está integrada ao mecanismo atual.

## 4. Análise de dependências — SCA

A análise de composição de software deverá identificar vulnerabilidades conhecidas em bibliotecas e dependências.

As verificações deverão considerar:

- Dependências diretas.
- Dependências transitivas.
- Versões utilizadas.
- Avisos de segurança publicados.
- Correções disponíveis.
- Risco contextual da vulnerabilidade.

Ferramentas candidatas incluem:

- OSV-Scanner.
- npm audit, para projetos compatíveis.
- Ferramentas equivalentes para outros ecossistemas.

A seleção deverá considerar os gerenciadores de pacotes utilizados e a disponibilidade de bases de vulnerabilidades.

Um resultado sem vulnerabilidades conhecidas não significa ausência de vulnerabilidades.

## 5. Detecção de segredos

O projeto deverá utilizar verificações automatizadas para identificar possíveis credenciais expostas.

Exemplos:

- Tokens de acesso.
- Chaves de API.
- Senhas.
- Chaves privadas.
- Credenciais de bancos de dados.
- Segredos inseridos em arquivos de configuração.

### Ferramenta candidata

**Gitleaks**

Poderá ser utilizado para analisar arquivos e histórico Git, conforme a política adotada.

A identificação de um segredo deverá iniciar um procedimento de avaliação, remoção e, quando necessário, revogação ou rotação.

O simples apagamento de uma credencial do código não garante que ela deixou de estar exposta.

## 6. Validação de configurações

As verificações deverão considerar arquivos e configurações relevantes para a segurança.

Exemplos:

- Dockerfiles.
- Docker Compose.
- Configurações de CI/CD.
- Arquivos de infraestrutura.
- Configurações de serviços.
- Permissões e variáveis de ambiente.

Ferramentas adicionais poderão ser adotadas conforme a infraestrutura utilizada.

## 7. Integração com a auditoria por IA

A Skill `owasp-security-auditor` deverá evoluir para considerar os resultados das ferramentas automatizadas.

Fluxo proposto:

1. Identificar arquivos modificados.
2. Determinar as verificações aplicáveis.
3. Executar ferramentas autorizadas.
4. Coletar resultados estruturados.
5. Realizar análise contextual.
6. Consolidar achados.
7. Registrar limitações.
8. Produzir relatório de auditoria.
9. Validar evidências e integridade.
10. Aplicar a política de aprovação.

A integração não deverá permitir que o agente declare uma ferramenta executada sem evidência correspondente.

## 8. Resultados estruturados

O relatório de auditoria deverá evoluir para registrar resultados das ferramentas.

Campos propostos:

- `toolsExecuted`
- `checksPerformed`
- `checksNotPerformed`
- `toolResults`
- `limitations`

Cada execução deverá registrar, quando possível:

- Nome da ferramenta.
- Versão.
- Comando ou configuração utilizada.
- Data da execução.
- Código de saída.
- Resultado.
- Referência à evidência produzida.

A inclusão desses campos dependerá de atualização coordenada do esquema JSON, da Skill e dos scripts de validação.

## 9. Classificação e consolidação de achados

Os resultados das ferramentas deverão ser normalizados para as severidades definidas na ADR-0005:

- `critical`
- `high`
- `medium`
- `low`
- `info`

A normalização deverá preservar a severidade original, quando disponível.

Achados duplicados poderão ser agrupados, desde que suas origens e evidências permaneçam rastreáveis.

O agente não deverá descartar ou reduzir automaticamente a severidade de um achado apenas para permitir aprovação.

## 10. Política de execução

As ferramentas deverão ser executadas conforme uma matriz de aplicabilidade.

Exemplos:

| Tipo de alteração | Verificações candidatas |
|---|---|
| Código TypeScript/JavaScript | SAST e testes aplicáveis |
| Dependências ou lockfiles | SCA |
| Arquivos de configuração | Verificação de configuração e segredos |
| Código de autenticação | SAST e testes específicos |
| Consultas SQL | Análise de injeção e permissões |
| Alterações de infraestrutura | Análise de configuração |
| Alterações em hooks de segurança | Revisão específica e testes de regressão |

Essa matriz deverá ser refinada conforme a arquitetura do projeto.

## 11. Tratamento de falhas

Falhas na execução de ferramentas obrigatórias não deverão ser interpretadas como resultados seguros.

Exemplos:

- Ferramenta indisponível.
- Timeout.
- Configuração inválida.
- Erro de execução.
- Falha ao interpretar resultados.
- Cobertura insuficiente.

Essas situações deverão ser registradas como limitações ou verificações não concluídas.

Quando impedirem a avaliação dos requisitos obrigatórios, a auditoria não deverá receber aprovação automática.

## 12. Política de bloqueio

A decisão de aprovação seguirá a ADR-0005.

Achados `critical` e `high` deverão resultar em bloqueio por padrão, salvo exceção formal válida.

Achados `medium` deverão exigir revisão ou aceitação formal.

Achados `low` e `info` poderão permitir aprovação quando não houver outros impedimentos.

A implementação técnica dessa política deverá ser independente da interpretação livre do agente.

## 13. Integração com CI/CD

A arquitetura deverá evoluir para executar verificações de segurança também no pipeline de integração contínua.

O pipeline poderá:

- Executar SAST.
- Verificar dependências.
- Detectar segredos.
- Validar configurações.
- Executar testes de segurança.
- Aplicar regras de bloqueio.
- Preservar relatórios.

A execução independente em CI/CD reduzirá a dependência das verificações realizadas no ambiente local do agente.

## 14. Desempenho e execução incremental

As verificações deverão equilibrar cobertura e tempo de execução.

Estratégia proposta:

**Verificações locais:** análises rápidas e direcionadas às alterações.

**Verificações em pull requests:** análise ampliada das mudanças e dependências relevantes.

**Verificações periódicas:** reavaliação de vulnerabilidades conhecidas e configurações do projeto.

A execução incremental não deverá eliminar verificações completas exigidas pela política de segurança.

## 15. Segurança das ferramentas

As ferramentas de análise também deverão seguir o princípio do menor privilégio.

Requisitos:

- Executar com permissões restritas.
- Evitar acesso desnecessário a segredos.
- Controlar acesso à rede.
- Utilizar versões verificadas.
- Proteger configurações e regras.
- Tratar resultados como dados potencialmente não confiáveis.
- Registrar falhas e limitações.

Ferramentas externas não deverão receber acesso irrestrito ao ambiente sem necessidade justificada.

## 16. Implementação incremental

### Fase 1 — Levantamento tecnológico

Identificar linguagens, gerenciadores de pacotes e configurações presentes no projeto.

### Fase 2 — Prova de conceito SAST

Selecionar e testar uma ferramenta de análise estática.

### Fase 3 — Verificação de dependências

Integrar uma ferramenta compatível com os gerenciadores de pacotes utilizados.

### Fase 4 — Detecção de segredos

Adicionar verificações sobre arquivos e histórico Git, conforme a política definida.

### Fase 5 — Consolidação de relatórios

Integrar os resultados ao esquema de evidências da auditoria.

### Fase 6 — Política de aprovação

Aplicar as regras determinísticas definidas na ADR-0005.

### Fase 7 — CI/CD

Executar verificações independentes no pipeline de integração contínua.

## 17. Alternativas consideradas

**Auditoria exclusivamente por IA:** permite análise contextual, mas não oferece cobertura e reprodutibilidade suficientes.

**Auditoria exclusivamente por ferramentas automatizadas:** oferece verificações reproduzíveis, mas pode deixar de identificar problemas arquiteturais e de lógica de negócio.

**Auditoria manual:** permite avaliação especializada, mas exige maior esforço e não escala facilmente.

**Estratégia combinada:** integra análise contextual, ferramentas automatizadas e revisão humana proporcional ao risco.

A estratégia combinada é a abordagem proposta.

## 18. Consequências

### Positivas

- Maior cobertura de segurança.
- Verificações reproduzíveis.
- Detecção de vulnerabilidades conhecidas.
- Redução da dependência exclusiva da IA.
- Melhor rastreabilidade dos resultados.
- Base para controles de segurança em CI/CD.

### Negativas

- Maior tempo de execução.
- Necessidade de manutenção de ferramentas.
- Possibilidade de falsos positivos.
- Custos operacionais.
- Necessidade de normalização dos resultados.
- Complexidade adicional de integração.

## 19. Critérios de aceitação

Esta ADR poderá ser considerada implementada quando:

1. As ferramentas aplicáveis forem selecionadas e configuradas.
2. As verificações produzirem resultados reproduzíveis.
3. Os resultados forem incorporados ao processo de auditoria.
4. As falhas de execução forem registradas.
5. Os relatórios preservarem a origem dos achados.
6. A política de severidade for aplicada.
7. As verificações obrigatórias forem executadas em CI/CD.
8. Existirem testes positivos e negativos.
9. A documentação operacional estiver atualizada.

## 20. Referências

- ADR-0002 — Política de Segurança OWASP Top 10 e ASVS.
- ADR-0003 — Arquitetura de Auditoria Automatizada por Hooks.
- ADR-0004 — Integridade, Rastreabilidade e Evidências de Auditoria.
- ADR-0005 — Política de Aprovação e Bloqueio por Severidade.
- ADR-0006 — Privilégios Mínimos e Isolamento dos Agentes de IA.
- OWASP ASVS — https://owasp.org/www-project-application-security-verification-standard/
- Semgrep — https://semgrep.dev/
- OSV-Scanner — https://google.github.io/osv-scanner/
- Gitleaks — https://github.com/gitleaks/gitleaks
