# AGENTS.md - Mandatory project rules

## 1. Authority and grounding

This project must stay within the supplied assignment and lecturer slides. Treat the files under `docs/` as the repository's authoritative, distilled specification.

Do **not** invent features just because they are common in production systems. If a behavior is not supported by the assignment/specification, either omit it or mark it as a documented assumption for team review.

## 2. Required MVP scope

Implement only the software-centered Smart E-Mobility Hub capabilities specified in `docs/REQUIREMENTS.md`:

- Mobility Hub/vehicle/parking/charging state display.
- Find suitable Hub/vehicle.
- View vehicle availability and battery.
- Reserve shared vehicle.
- Reserve parking space.
- Pick up and return shared vehicle.
- Submit/schedule charging requests, including private EV charging.
- Operator network monitoring.
- Detect capacity risk from current state.
- Vehicle redistribution coordination.
- Operational incident handling.
- Smart charging scheduling with priority for low battery/upcoming usage.
- What-if simulation with recommendations.
- Interface mode customization.
- Simulated near-real-time state updates.

## 3. Explicitly out of scope unless the assignment changes

Do not add:

- payment/billing;
- login/account management;
- real GPS/navigation;
- sophisticated 3D maps;
- real IoT hardware integration;
- cloud infrastructure;
- microservices;
- mandatory backend database;
- AI/ML prediction features.

## 4. Technical constraints

- Use plain HTML/CSS/JavaScript for the MVP.
- Keep data in memory / simulated data. Persistence is not required.
- Use ES modules and keep modules small and responsibility-focused.
- Keep UI, domain state, and business logic separated according to the layered design documented in `docs/ARCHITECTURE.md`.
- Avoid dependencies unless they are truly necessary for an assignment-supported capability.

## 5. Implementation discipline from the lecturer slides

Follow this flow:

1. Requirements define what must be satisfied.
2. Design only what is required.
3. Implement the design.
4. Test against design and requirements.

Before writing code for a feature, identify its `FR-*` and `UC-*` references in `docs/TRACEABILITY.md`.

## 6. Business invariants

- A shared vehicle can only be reserved if it is available.
- Pickup must require an active reservation for the selected vehicle.
- Returning a vehicle must use a Hub with parking capacity.
- A parking reservation must not exceed Hub parking capacity.
- Charging scheduling must not exceed available charging capacity.
- Charging priority must consider low battery and upcoming usage requirements, as stated by the assignment.
- What-if simulations must evaluate a hypothetical state without silently overwriting the live state.
- Incident handling must support at least vehicle failure and unavailable charging point.

If a numerical threshold is not supplied by the assignment, do not invent it in requirements. Keep it configurable or document it as a team decision.

## 7. Definition of done for each feature

A feature is done only when:

- its behavior matches the corresponding requirement/use case;
- normal and failure paths are handled;
- UI state stays consistent with domain state;
- no out-of-scope functionality is introduced;
- the manual acceptance case in `tests/ACCEPTANCE_TESTS.md` can be demonstrated.

## 8. Coding-AI behavior

When using this repository with Codex or another coding AI:

- first read all files listed in the README under "Read before coding";
- inspect existing code before changing it;
- implement in small coherent steps;
- do not rewrite specifications to match code; fix code to match specifications;
- call out ambiguities instead of fabricating lecturer requirements;
- preserve traceability IDs in comments/commit summaries where useful.
