# Domain Model

This doc names the core concepts and ownership boundaries for the domain.

## Contract

- The integration is a customer-edge enforcement and reporting point, not the durable system of record.
- It gathers supported IaC and deploy context, redacts locally, signs an envelope, requests a SaaS decision, and renders the result where developers already work.
- GitHub Action command handling groups work into plan, synth, diff, deploy verification, and shell deploy classification. The first shipped action supports Terraform/OpenTofu plan JSON and CDK/CloudFormation synth or diff artifacts as first-class envelope inputs.
- The integration does not execute policy packs locally. It normalizes customer-edge evidence into an action envelope and asks the Control9 control plane for a decision.
- Deploy verification reuses the same signed envelope shape but calls the deploy verification API to compare the current artifact fingerprint against the approved fingerprint stored by the control plane. It does not re-run full policy evaluation for that step.

## Open implementation decisions

Implementation-level items not yet fully specified. `/refine-issue` resolves these into timeless contract prose and removes or collapses bullets when done.
