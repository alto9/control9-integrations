# Domain Model

This doc names the core concepts and ownership boundaries for the domain.

## Contract

- The integration is a customer-edge enforcement and reporting point, not the durable system of record.
- It gathers supported IaC and deploy context, redacts locally, signs an envelope, requests a SaaS decision, and renders the result where developers already work.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.

### Control9 project plan
- Define command categories recognized for plan, synth, diff, deploy verification, and shell deploy classification.
