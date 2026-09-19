# Project Specification

## 1. Project name

**Smart E-Mobility Hub - Electric Mobility Coordination System for the VNU-HCM Urban Area**

## 2. Context

The VNU-HCM Urban Area contains universities, student dormitories, libraries, service facilities, and public transportation hubs. Students may arrive via Metro Line 1 and continue travelling between campuses and functional areas using shared electric bicycles, electric motorcycles, or other electric mobility.

The software problem is not only vehicle management. It also coordinates:

- parking capacity;
- charging resources;
- mobility demand across different locations.

## 3. System concept

The system models multiple **Mobility Hubs** at locations such as:

- Metro station;
- student dormitories;
- university campuses;
- service areas.

Each Hub contains:

- parking spaces;
- charging points;
- electric vehicles.

The system maintains state such as:

- vehicle status;
- battery level;
- parking occupancy;
- charging-point availability;
- Hub utilization.

State may be updated using **real sensor data or simulated data**. For this MVP, simulated data is used.

## 4. Stakeholders / actors supported by the assignment

### Student

Needs to:

- find suitable vehicles and Hubs;
- view availability and battery levels;
- reserve a vehicle or parking space;
- pick up and return shared vehicles;
- submit charging requests;
- for a privately owned EV, reserve parking and schedule charging.

### Operator

Needs to:

- monitor the Mobility Hub network;
- monitor vehicle and charging-point status;
- identify Hubs approaching capacity limits;
- coordinate vehicle redistribution;
- handle vehicle/charging incidents;
- coordinate smart charging;
- run what-if simulations and review recommendations.

### Sensor / Simulator (external system actor if represented in UML)

Provides vehicle, parking, charging, and operational-event state updates. The assignment permits simulated data, so the MVP uses a simulator rather than real hardware.

## 5. Project objectives

Build a demonstrable software MVP that coordinates shared electric mobility resources and lets students and operators exercise the workflows required by the assignment.

The system should demonstrate:

- state management;
- resource allocation;
- reservation handling;
- charging scheduling;
- vehicle dispatching/redistribution;
- event handling;
- operational scenario simulation.

## 6. In scope

See `docs/REQUIREMENTS.md` for the complete functional list.

## 7. Out of scope

The assignment explicitly says the focus is **not** physical hardware or a sophisticated 3D map interface. To avoid unsupported scope growth, this MVP also does not introduce payment, authentication, real navigation, cloud deployment, a mandatory backend database, or unrelated AI/ML features.

## 8. Data strategy

The assignment permits data to be hard-coded and does not require a backend database. This MVP therefore uses in-memory simulated data so the team can focus on required software behavior and demonstration quality.
