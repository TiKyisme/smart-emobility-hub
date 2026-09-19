# Whole-System Use-Case Catalog

This catalog is the textual basis for the group's whole-system Use Case Diagram. The diagram should show the complete system boundary and all relevant external interactions.

## Actors

- **Student**
- **Operator**
- **Sensor / Simulator** - optional external-system actor in the UML if the group chooses to model state/event input explicitly.

## Student use cases

- **UC-01 - View Mobility Hubs**
- **UC-02 - Find Suitable Hub / Vehicle**
- **UC-03 - View Vehicle Availability and Battery**
- **UC-04 - Reserve Shared Vehicle**
- **UC-05 - Reserve Parking Space**
- **UC-06 - Pick Up Shared Vehicle**
- **UC-07 - Return Shared Vehicle**
- **UC-08 - Submit Charging Request**
- **UC-09 - Schedule Private EV Charging**
- **UC-10 - Customize Interface Mode**

## Operator use cases

- **UC-11 - Monitor Mobility Hub Network**
- **UC-12 - Monitor Vehicle / Charging-Point Status**
- **UC-13 - Identify Hub Capacity Risk**
- **UC-14 - Coordinate Vehicle Redistribution**
- **UC-15 - Handle Operational Incident**
- **UC-16 - Schedule Charging Resources**
- **UC-17 - Run What-if Simulation**
- **UC-18 - Review Coordination Recommendations**
- **UC-19 - Customize Interface Mode**

## Sensor / Simulator use case

- **UC-20 - Provide State / Operational Event Update**

## Assignment-provided what-if scenarios

The scenario interface should be capable of representing at least:

- sudden increase in student arrivals at the Metro station during peak hours;
- a Mobility Hub reaching full parking capacity;
- surge in charging demand;
- partial charging-point failures;
- excessive concentration of vehicles at a location.

## Detailed use-case scenario template

For each group member's individual use case, use the lecturer's tabular fields:

- Use Case ID
- Use Case Name
- Created By
- Last Updated By
- Date Created
- Date Last Updated
- Actors
- Description
- Trigger
- Preconditions
- Postconditions
- Normal Flow
- Alternative Flows
- Exceptions
- Notes and Issues

Do not fabricate relationships such as `include` or `extend` merely to make the diagram look complex. Add a relationship only when the team can explain its meaning consistently with the modeled behavior.
