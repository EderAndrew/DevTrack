# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]  
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]  
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify against `.specify/memory/constitution.md` (mark each ✅ / ❌ / N/A):

- [ ] **I. Security**: all external inputs validated in the backend; OWASP Top 10 risks considered
- [ ] **II. RBAC**: every protected operation lists its explicit permission(s) and resource-context check
- [ ] **III. Server authority**: state, time and submission rules enforced server-side; autosave where answers are entered
- [ ] **IV. Untrusted code**: no student code executed in the API process or main server
- [ ] **V. Data integrity**: schema changes via Prisma migrations; PK/FK/UNIQUE/NOT NULL/indexes defined
- [ ] **VI. Audit & logs**: critical operations audited; structured logs; no secrets/tokens logged
- [ ] **VII. Tests**: automated tests planned for every critical business rule touched
- [ ] **VIII. Layering**: no business rules or Prisma calls in controllers/React components
- [ ] **IX. Simplicity**: no new infra, dependency or shared abstraction without a spec-backed need
- [ ] **X. Evidence**: events recorded as observable facts; no single event treated as a conclusion; uncertainty represented
- [ ] **XI. Human oversight**: critical pedagogical decisions stay with the teacher; results typed as FACT / RULE_RESULT / SUGGESTION / HUMAN_DECISION
- [ ] **XII. Determinism first**: no AI where deterministic rules, tests or constraints suffice
- [ ] **XIII. Risk level**: automated/AI operations classified L1/L2/L3; L3 authorized, audited, human-confirmed when critical
- [ ] **XIV–XV. AI governance**: AI non-authoritative, least-privilege tools with schema/validation/timeout, grounded on identifiable sources
- [ ] **XVI. Explicit states**: critical workflows use explicit states and validated transitions, not boolean flags
- [ ] **XVII. Idempotency**: critical operations safe under retries/double submits
- [ ] **XVIII. Safe interruption**: long/risky operations support timeout, cancel and kill switch with recoverable state
- [ ] **XIX. AI evals**: AI features have automated evals / versioned Golden Set before release
- [ ] **XX. Pedagogy**: monitoring is proportional; least invasive option that preserves assessment integrity
- [ ] **XXI. Configurable domain**: no subject/language/technology hard-coded as enums or conditionals; disciplines, content and levels are data
- [ ] **XXII. Personalization & accessibility**: content difficulty and adaptation needs modeled separately; individual needs minimized, access-restricted, audited and never sent identifiable to AI
- [ ] **XXIII. Curricular traceability**: syllabus / learning plan / lessons kept distinct; activities linked to contents and objectives; AI generation limited to the class's taught scope and validated deterministically; uploads treated as data
- [ ] **XXIV. Academic isolation**: every class-scoped resource checked for permission AND academic link (teacher assignment / active enrollment); no horizontal access; out-of-context resources not revealed
- [ ] **XXV. Privileged provisioning**: no public signup for privileged roles; teacher accounts via invite (single-use, expiring, hashed); privilege changes audited; no self-escalation; deactivate instead of delete

Any ❌ MUST be justified in *Complexity Tracking* below.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
