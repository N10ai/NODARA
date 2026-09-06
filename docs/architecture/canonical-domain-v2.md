# NODARA Canonical Domain Architecture v2

## Product invariant

NODARA has one operational truth underneath every interaction mode. Guided UI, expert UI, voice, email/document parsing, API automation and customer onboarding must all read/write the same transaction records, requirement instances, workflow tasks, evidence and audit history.

A UI step is never the source of truth. It is a view/action over the domain model.

## Core layers

### 1. Transaction
What is happening: Warehouse Receipt, Cargo Release, Shipment, Pickup/Delivery/Drayage, Consolidation, FTZ transaction, etc.

Each transaction owns factual data and links to parties, cargo/planned cargo, references, documents, charges and related transactions.

### 2. Service Catalog
`service_catalog` is the canonical catalog of services NODARA can perform and/or bill: receiving, storage, cross dock, drayage, air export, FTZ handling, labeling, etc.

Service is not transaction type. One transaction may involve several services.

### 3. Service Agreement
`service_agreements` is the canonical umbrella contract between a customer and a service.

It owns/version-controls:
- operational requirements (`service_agreement_requirements`)
- billing rules (`service_agreement_billing_rules`)
- communication rules (`service_agreement_communication_rules`)
- SLA/defaults/provenance
- source signed document when applicable

An agreement answers: what did we promise this customer, how do we execute it, how do we communicate it, and how do we charge it?

### 4. Operational Context
`operational_contexts` describes the legal/operational reality of a specific transaction: direction, mode, customs regime, bonded, FTZ, FTZ status, DG, UN numbers, origin/destination, stage, etc.

Context is not an exception flag and is not pricing by itself. Context may activate additional requirements or billing rules.

### 5. Exceptions
Physical or operational exceptions such as damaged, fragile, oversize, temperature-controlled, security, hold and high value belong in the exception/flag model. They can create additional requirements/tasks.

FTZ, bonded and DG must not also exist as generic exception flags when they are already transaction context.

### 6. Requirement compilation
`transaction_requirement_instances` is the canonical truth for what a specific transaction must satisfy.

Instances are compiled from:
1. transaction-type baseline
2. active service agreement
3. operational context
4. cargo/item facts
5. exception facts
6. authorized overrides

Every instance stores provenance. NODARA must be able to answer "why is this required?"

### 7. Workflow
`workflow_runs_v2` and `workflow_tasks_v2` turn requirements into actions.

Tasks contain an `action_type`, input schema, completion rule and provenance. A task can therefore open camera capture, document upload, cargo editor, location assignment, label printing, booking, notification, signature, etc.

The workflow state is evidence-driven. Voice/AI/autocomplete can satisfy a task automatically only when the completion rule can be proven from transaction data/evidence.

### 8. Overrides
`transaction_overrides` records waivers and intentional changes with who/when/why. Do not silently remove a requirement because the operator skipped a screen.

### 9. Billing
`service_agreement_billing_rules` is the customer/service rule definition. `operational_charges` is the preferred event-generated commercial ledger.

A billing rule is separate from an operational requirement. A required action may be included or billable; that relationship must be explicit.

### 10. Documents and signatures
`document_templates_v2` defines reusable structured templates and merge fields. `signature_requests` tracks e-sign lifecycle. Final generated/signed artifacts belong in `documents` with transaction/entity linkage and provenance.

Signed PDF text is evidence of an agreement, not the executable configuration. Important agreement clauses must also exist as structured service agreement rules.

## Cargo boundary

- Planned cargo can exist on shipment/transport transactions.
- Actual physical warehouse handling units are created by receiving/WR.
- `cargo_units` is the current canonical warehouse physical/inventory hierarchy.
- Outbound transactions allocate/use existing warehouse cargo rather than creating new warehouse inventory.

## Interaction modes

### Guided
One actionable task at a time. Best for training, unusual work and compliance-sensitive processes.

### Expert
Compact record/table workspace. Users may jump directly to any area while the requirement engine still tracks completeness.

### AI Command
Voice, paste, email, file and API input produce structured intents and transaction facts. The engine validates them and asks only for missing/ambiguous required information.

These are three interfaces over one domain model, not three workflows.

## Resolution order

When values/rules overlap, use this precedence unless a domain-specific rule says otherwise:

1. Explicit authorized transaction override
2. Transaction-specific verified fact/context
3. Active customer Service Agreement
4. Customer profile/default
5. Service Catalog default
6. Transaction-type/system default

Every inherited value should retain provenance.

## Deprecation policy

Do not delete legacy tables or historical data during the stabilization phase. New features must use canonical models. Existing screens may use compatibility adapters while data is migrated.

Destructive cleanup comes only after reconciliation, backfill and verification.