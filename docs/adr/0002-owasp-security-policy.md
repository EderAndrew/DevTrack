# ADR-0002 — Política de Segurança OWASP Top 10 e ASVS

**Status:** Proposta  
**Data:** 2026-10-23  
**Decisores:** Equipe responsável pela arquitetura e segurança do projeto

## 1. Contexto

O projeto utiliza agentes de inteligência artificial para auxiliar no desenvolvimento de software.

Embora esses agentes possam produzir código funcional, suas implementações podem introduzir vulnerabilidades, configurações inseguras, falhas de autorização ou exposição de informações sensíveis.

O projeto já possui mecanismos de auditoria automatizada por hooks, geração de relatórios JSON e verificação de integridade SHA-256.

Entretanto, esses mecanismos não substituem uma política explícita de segurança, nem garantem que o código analisado esteja livre de vulnerabilidades.

É necessário estabelecer critérios consistentes para desenvolvimento, auditoria, classificação de achados e aprovação de alterações.

## 2. Decisão arquitetural proposta

Adotar OWASP Top 10 e OWASP ASVS como referências para estabelecer requisitos de segurança aplicáveis ao projeto.

Todo código criado ou modificado por agentes de IA deverá respeitar os controles de segurança pertinentes ao seu contexto tecnológico e funcional.

A aplicação desses controles deverá considerar o risco, a superfície de ataque e as funcionalidades envolvidas.

Não será obrigatório executar verificações sem relação com o código analisado, mas verificações não aplicáveis e não executadas deverão ser diferenciadas.

## 3. Requisitos de segurança

### 3.1. Controle de acesso

- Implementar autorização no backend para operações protegidas.
- Aplicar o princípio do menor privilégio.
- Não confiar exclusivamente em verificações realizadas no frontend.
- Validar o acesso aos recursos considerando o usuário e o contexto da operação.
- Evitar referências inseguras a objetos.

### 3.2. Autenticação e sessões

- Utilizar mecanismos de autenticação adequados à arquitetura.
- Proteger tokens, credenciais e identificadores de sessão.
- Configurar cookies de autenticação com atributos de segurança apropriados.
- Implementar expiração e revogação de sessões quando aplicável.
- Não registrar segredos em logs.

### 3.3. Validação de entradas

- Validar dados recebidos em limites de confiança.
- Utilizar consultas parametrizadas para acesso a bancos de dados.
- Evitar construção insegura de comandos.
- Aplicar codificação contextual de saída para prevenir injeção em interfaces.
- Não considerar apenas a validação de tipos como garantia de segurança.

### 3.4. Proteção de dados

- Evitar exposição desnecessária de dados sensíveis.
- Não armazenar credenciais diretamente no código.
- Utilizar mecanismos apropriados de gerenciamento de segredos.
- Proteger dados em trânsito e em repouso conforme os riscos e requisitos aplicáveis.
- Evitar divulgação de detalhes internos em mensagens de erro.

### 3.5. Configuração segura

- Evitar configurações inseguras por padrão.
- Restringir permissões de serviços e recursos.
- Não expor interfaces administrativas sem proteção.
- Aplicar configurações adequadas de CORS, cabeçalhos HTTP e comunicação entre serviços.
- Documentar exceções justificadas.

### 3.6. Dependências

- Manter inventário de dependências relevantes.
- Verificar vulnerabilidades conhecidas utilizando ferramentas autorizadas.
- Avaliar o risco antes de atualizar dependências críticas.
- Não declarar uma dependência segura sem evidências suficientes.

### 3.7. Logs e tratamento de erros

- Registrar eventos relevantes para investigação e auditoria.
- Não registrar senhas, tokens ou segredos.
- Evitar mensagens que exponham detalhes internos.
- Preservar informações suficientes para diagnosticar falhas.
- Restringir o acesso aos registros de segurança.

### 3.8. Comunicação externa

- Validar destinos de requisições realizadas a partir de entradas não confiáveis.
- Aplicar controles contra SSRF quando houver comunicação externa.
- Restringir acesso desnecessário a recursos internos.
- Estabelecer limites e timeouts apropriados.

## 4. Política de auditoria

Alterações de código realizadas por agentes deverão passar pelo mecanismo de auditoria configurado.

A auditoria deverá:

1. Identificar os arquivos modificados.
2. Consultar as ADRs aplicáveis.
3. Avaliar riscos relacionados às alterações.
4. Registrar vulnerabilidades e problemas identificados.
5. Classificar a severidade dos achados.
6. Informar verificações não realizadas.
7. Gerar relatório estruturado.
8. Confirmar a integridade dos arquivos e do relatório.

A auditoria não poderá declarar ausência absoluta de vulnerabilidades.

## 5. Classificação dos achados

Os achados deverão utilizar as seguintes severidades:

| Severidade | Descrição |
|---|---|
| Critical | Risco crítico que exige tratamento prioritário |
| High | Risco elevado que requer correção antes da aprovação, salvo exceção formal |
| Medium | Risco relevante que exige avaliação e tratamento |
| Low | Risco reduzido que deve ser registrado e acompanhado |
| Info | Observação, melhoria ou evidência sem risco de segurança demonstrado |

A severidade deverá considerar impacto, possibilidade de exploração, exposição e contexto da aplicação.

Achados inconclusivos deverão ser identificados explicitamente, sem serem tratados automaticamente como ausência de vulnerabilidade.

## 6. Estados da auditoria

O processo deverá distinguir:

**Auditoria concluída:** a análise foi realizada, o relatório foi gerado e sua integridade foi confirmada.

**Auditoria aprovada:** os resultados satisfazem a política de aceitação definida para o projeto.

**Auditoria bloqueada:** os resultados impedem a aprovação ou existem condições que inviabilizam a validação exigida.

A confirmação de integridade não representa aprovação de segurança.

## 7. Política de aprovação proposta

- Achados críticos ou altos deverão impedir a aprovação automática.
- Achados médios deverão exigir tratamento ou aceitação formal de risco.
- Achados baixos e informativos poderão permitir aprovação conforme o contexto.
- Auditorias incompletas não deverão ser aprovadas automaticamente.
- Exceções deverão possuir justificativa, responsável e prazo de revisão.

Esta política ainda depende de implementação técnica no mecanismo de aprovação.

## 8. Evidências e rastreabilidade

O processo deverá preservar evidências suficientes para permitir a revisão posterior da auditoria.

Os registros deverão incluir, conforme aplicável:

- Identificador da sessão.
- Arquivos analisados.
- Hashes dos arquivos.
- Resultado da análise.
- Achados e severidades.
- Recomendações de correção.
- Verificações executadas e não executadas.
- Identificação das ferramentas utilizadas.
- Data da confirmação.
- Hash do relatório.

A integridade SHA-256 permite detectar divergências, mas não constitui, isoladamente, prova de autoria ou proteção contra agentes com acesso para modificar os registros e as confirmações.

## 9. Restrições aos agentes de IA

Os agentes deverão:

- Respeitar o princípio do menor privilégio.
- Não modificar mecanismos de auditoria para contornar verificações.
- Não falsificar evidências ou resultados.
- Não declarar verificações não realizadas como concluídas.
- Não registrar manualmente marcadores de confirmação.
- Não modificar código-fonte durante uma auditoria somente de leitura.
- Comunicar limitações, falhas e resultados inconclusivos.

## 10. Consequências

### Positivas

- Padronização dos requisitos de segurança.
- Maior consistência nas auditorias.
- Rastreabilidade das decisões.
- Base para bloqueios automatizados.
- Melhor integração entre desenvolvimento assistido por IA e revisão de segurança.

### Negativas e custos

- Maior tempo de análise de alterações.
- Possibilidade de falsos positivos.
- Necessidade de manutenção das políticas.
- Custo de execução de ferramentas adicionais.
- Necessidade de revisão humana para decisões de risco relevantes.

## 11. Alternativas consideradas

**Auditoria exclusivamente manual:** oferece flexibilidade, mas dificulta padronização e rastreabilidade.

**Auditoria exclusivamente por IA:** facilita análise contextual, mas não oferece comprovação independente das verificações realizadas.

**Ferramentas SAST isoladas:** permitem verificações reproduzíveis, mas não substituem análise arquitetural e contextual.

**Abordagem combinada:** adotar políticas documentadas, análise por agentes, ferramentas automatizadas e revisão humana proporcional ao risco.

A abordagem combinada é a direção proposta.

## 12. Critérios de aceitação

Esta ADR poderá ser considerada implementada quando:

1. A Skill de auditoria consultar as ADRs aplicáveis.
2. Os relatórios identificarem achados e severidades.
3. As verificações não realizadas forem registradas.
4. A integridade do código e do relatório for validada.
5. Houver política técnica de aprovação e bloqueio.
6. As exceções de segurança forem documentadas.
7. Os mecanismos forem submetidos a testes positivos e negativos.

## 13. Referências

- OWASP Top 10 — https://owasp.org/www-project-top-ten/
- OWASP Application Security Verification Standard — https://owasp.org/www-project-application-security-verification-standard/
- ADR-0001 — Arquitetura de IA do projeto
- Skill `owasp-security-auditor`
- Scripts `security-check.sh` e `audit-complete.sh`
