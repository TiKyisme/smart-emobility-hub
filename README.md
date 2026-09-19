# Smart E-Mobility Hub

Course project scaffold for **Software Engineering - HK261**.

This repository is deliberately grounded in the lecturer's assignment and course slides. The MVP uses **HTML + CSS + JavaScript**, **simulated/in-memory data**, and no required backend database, matching the assignment constraints.

## Run

From the repository root:

```bash
python -m http.server 5173
```

Open `http://localhost:5173`.

## Read before coding

1. `AGENTS.md` - mandatory instructions for any coding AI.
2. `docs/PROJECT_SPEC.md` - project context, stakeholders, scope.
3. `docs/REQUIREMENTS.md` - functional/non-functional requirements.
4. `docs/USE_CASE_CATALOG.md` - whole-system use-case catalog.
5. `docs/ARCHITECTURE.md` - architecture and code mapping.
6. `docs/TRACEABILITY.md` - requirement -> use case -> module -> test mapping.
7. `docs/IMPLEMENTATION_PLAN.md` - phased implementation plan.

## Submission #1

See:
- `docs/SUBMISSION_1_REPORT_TEMPLATE.md`
- `docs/SUBMISSION_1_CHECKLIST.md`

## Current implementation

The repository contains a runnable static MVP with simulated in-memory data. The page exposes both Student and Operator workspaces so the required resource, reservation, charging, incident, redistribution, simulation, mode, and simulated-update flows can be demonstrated without a backend database.

For a short demonstration, inspect the Hub cards, reserve and pick up `EV-01`, return it to another Hub, submit a shared or private charging request, apply an operator charging schedule, report an incident, coordinate a redistribution, and run each What-if scenario. The page also supports manual or optional 15-second simulated updates.
