# Specification Quality Checklist: 001 — Foundation, Identity & Access

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-21
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Clarifications resolved (2026-09-21): bootstrap activation link is sent by e-mail
  and shown in the terminal only via an explicit, audited command option (Q1: C);
  password recovery is in scope — User Story 8 and FR-029a–e (Q2: A).
- Review pass (2026-09-21) against four focus points — single multi-role identity,
  no MANAGER academic access, no academic entities, verifiable acceptance criteria.
  Fixes applied: self-invite blocked (FR-040a); MANAGER own-account exception and
  restricted teacher view (FR-050); ADMIN identity-level account consultation
  (FR-056); single source of role status in UserRole (FR-007) and separate account
  status (FR-008); single pending bootstrap (FR-032, US3-7); own-session listing and
  revocation as the 404 target (FR-027, US2-7/8); e-mail+origin rate limiting that
  cannot lock out the owner (FR-022, US2-4); negative scenarios for criteria 9, 15
  and 16 (US5-11, US6-9, US6-10); acceptance criteria traceability table.
- Intentional technical terms: HTTP status semantics (401/403/404), token hashing,
  password hashing and the `statusCode`/`code`/`message` error shape are mandated by
  Constitution v2.0.0 (II, XXIV, XXV and error handling) and the user's request; no
  language, framework, library or database is named.
- The spec is security-focused, so some vocabulary (session, token, rate limit) is
  unavoidable; each term is described by its observable behavior.
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
- Plan alignment (2026-09-21), applied after `/speckit-plan`: final permission list
  (`professores.suspender` and `managers.reenviar_convite` added;
  `conta.propria.visualizar` replaced by session-only access to identity, logout and
  logout-all); "pending ADMIN" represented only by the `PENDING` bootstrap — `User`
  and `ADMIN` assignment are created on activation (US3-1, US3-6, US3-7, FR-032,
  FR-034); unknown fields in public requests are rejected with 400 (US1-2, FR-010);
  FR-061's 403 example is the account consultation (FR-056), with `/students`
  deferred to Spec 002.
