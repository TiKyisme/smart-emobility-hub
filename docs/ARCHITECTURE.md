# Architecture

## 1. Course grounding

The lecturer slides present multiple architectural views (4+1) and architectural patterns including MVC and Layered Architecture. This repository uses a simple **layered organization** because it maps cleanly to the small MVP and keeps responsibilities separated without adding unnecessary infrastructure.

## 2. Repository layers

### Presentation / UI layer

`src/ui/` and `index.html`

Responsibilities:

- render Student and Operator views;
- collect user interaction;
- display current state, errors, recommendations, and simulation results.

### Application / Business Services layer

`src/services/`

Responsibilities:

- find suitable resources;
- reservation workflow;
- charging scheduling;
- operator coordination;
- what-if simulation orchestration.

### Domain / State layer

`src/domain/` and `src/state/`

Responsibilities:

- statuses and invariants;
- live application state;
- state mutation through explicit service operations.

### Data / Simulation layer

`src/data/`

Responsibilities:

- initial simulated Hub/vehicle/parking/charging data;
- deterministic demo input.

## 3. 4+1 mapping for later submissions

The course slides map views to UML artifacts as follows:

- **Logical view:** Class Diagram, Sequence Diagram.
- **Process view:** Activity Diagram.
- **Development view:** Component Diagram / Package Diagram.
- **Physical view:** Deployment Diagram.
- **Scenarios (+1):** Use Cases.

The group should keep future diagrams consistent with the repository instead of independently inventing a second design.

## 4. Development view candidate

At a high level:

```text
Browser
  -> Presentation/UI
  -> Business Services
  -> Domain State
  -> Simulated Data
```

## 5. Deployment view candidate

Because the assignment permits a lightweight MVP with hard-coded data, the minimal deployment is a browser loading static HTML/CSS/JavaScript from a local/static web server. No backend database is required.
