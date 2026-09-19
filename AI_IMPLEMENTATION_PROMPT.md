# Prompt for Codex / Coding AI

You are implementing the MVP in this repository for the Software Engineering HK261 project **Smart E-Mobility Hub**.

## Mandatory first step

Before editing code, read completely:

1. `AGENTS.md`
2. `docs/PROJECT_SPEC.md`
3. `docs/REQUIREMENTS.md`
4. `docs/USE_CASE_CATALOG.md`
5. `docs/ARCHITECTURE.md`
6. `docs/TRACEABILITY.md`
7. `docs/IMPLEMENTATION_PLAN.md`
8. `tests/ACCEPTANCE_TESTS.md`

Then inspect every existing source file under `src/` and `index.html`.

## Grounding rule

Use only requirements supported by those repository specifications, which were distilled from the lecturer's assignment/slides. Do not invent login, payment, GPS, 3D maps, real IoT, cloud services, microservices, a required backend database, or AI/ML prediction.

If something is ambiguous, choose the smallest implementation consistent with the documented requirement and record the assumption in `docs/DECISIONS.md`. Do not silently add scope.

## Goal

Turn the existing scaffold into a complete, coherent, demonstrable MVP using plain HTML/CSS/JavaScript and simulated in-memory data.

## Required implementation order

Follow `docs/IMPLEMENTATION_PLAN.md` in phases. For each phase:

1. identify the `FR-*`, `UC-*`, and `AT-*` IDs affected;
2. inspect existing implementation before editing;
3. implement normal flow plus relevant failure/alternative paths;
4. keep UI/domain state consistent;
5. manually verify the associated acceptance tests;
6. update `docs/DECISIONS.md` only when a genuine design decision is needed.

## Required UX/demo flows

The finished MVP must make these flows easy to demonstrate:

### Student
- inspect Hub/resource state;
- find a suitable vehicle/Hub;
- reserve a vehicle;
- pick it up;
- return it to a Hub with parking capacity;
- reserve parking;
- submit/schedule charging including private EV charging.

### Operator
- inspect network state;
- see capacity risk;
- handle vehicle failure / charging-point unavailable incidents;
- coordinate redistribution;
- view smart charging priority/schedule;
- run each assignment-provided what-if scenario;
- review impact and coordination recommendations.

### System
- simulated state updates;
- interface mode customization;
- no double allocation or over-capacity confirmation.

## What-if rule

Simulation must start from current live state, operate on a copied/hypothetical state, show impact and recommendations, and must not silently overwrite live state.

## Quality bar

- Keep modules focused and readable.
- Avoid dead code and duplicate logic.
- Avoid dependencies unless unavoidable.
- Keep state changes explicit.
- Show useful validation/error messages.
- Preserve requirement traceability in code comments where it adds value.
- Do not change requirement wording just to fit the implementation.

## Completion response

When done, report:

- files changed;
- features completed grouped by `FR-*`;
- any assumptions recorded;
- acceptance cases verified;
- anything still incomplete/blocking.
