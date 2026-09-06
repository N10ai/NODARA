# NODARA Foundation Audit — 2026-09-06

## Executive finding

The product already contains most of the right logistics concepts, but multiple implementation generations overlap. The current risk is not lack of features; it is ambiguity about which model is authoritative. That ambiguity will become severe once voice, AI parsing, onboarding and automation begin writing data without a human visually checking every screen.

This audit therefore marks one canonical path and preserves older structures as compatibility/legacy until migrated.

## Canonical / legacy map

| Domain | Canonical going forward | Existing overlap to deprecate/migrate | Notes |
|---|---|---|---|
| Physical warehouse cargo | `cargo_units` | `cargo_objects` + transaction-created physical cargo paths | Physical HU birth occurs at WR/receiving. `cargo_objects` remains historical compatibility for now. |
| Planned cargo | shipment/transport planned-cargo structures/metadata | direct physical cargo creation on non-WR transactions | Planned cargo is not warehouse inventory. |
| Warehouse location | `warehouse_locations` + `cargo_units.warehouse_location_id` | `locations` + `cargo_units.current_location_id` | Two location systems currently exist. New warehouse UI/actions should use `warehouse_locations`. |
| Inventory history | `inventory_transactions` for current warehouse operations | `inventory_movements` | Reconcile event coverage before removal. |
| Documents/evidence | `documents` as canonical document record; structured evidence links to it | `warehouse_receipt_attachments`, `cargo_release_evidence`, `document_groups` as specialized/legacy storage models | Compatibility adapters may remain, but new rule engine should reason over canonical evidence. |
| Customer/service contract | `service_agreements` | `entities.sop`, `service_profiles`, `customer_service_profiles`, service defaults scattered through UI | `entities.sop` must become legacy read-only compatibility after migration. |
| Service catalog | `service_catalog` | free-text service/workflow fields | Service is a first-class object, not an arbitrary string. |
| Customer pricing definition | `service_agreement_billing_rules` + existing `customer_rate_agreements` during transition | rates embedded in entity SOP; ad-hoc transaction rates as agreement source | Existing rate book remains source data until converted into agreement billing rules. |
| Generated charge ledger | `operational_charges` | `charges` | `charges` is legacy job ledger; do not create new billing logic against both. |
| Transaction context | `operational_contexts` | FTZ/Bonded/DG duplicated as generic flags | Context must drive rules and retain source/confidence. |
| Exceptions | `exceptions` / true `operational_flags` | context-as-flag | Damaged/hold/etc. can generate new requirements. |
| Requirements | `transaction_requirement_instances` | `compliance_requirements`, `readiness_requirements`, hard-coded UI validation | Existing requirement tables become source adapters where needed. |
| Workflow | `workflow_runs_v2` + `workflow_tasks_v2` | `workflow_definitions`, `workflow_progress`, UI-local/localStorage completion | Completion must come from evidence/data, not button state. |
| Workflow history | `workflow_events` | local-only completion state | Every material execution event should be persisted. |
| Overrides | `transaction_overrides` | silent UI skips/manual edits with no reason | Waive/override must be auditable. |
| Templates | `document_templates_v2` | hard-coded printable HTML/templates | Template system should become versioned and structured. |
| Signatures | `signature_requests` + final `documents` artifact | none / manual external process | Provider integration can be added later without changing domain semantics. |

## High-priority product corrections

### P0 — single sources of truth
1. Stop writing new warehouse locations to both location models.
2. Stop writing new physical cargo outside WR receiving.
3. Stop treating entity SOP JSON as an independent active configuration source once an active structured agreement exists.
4. Stop deriving workflow completion from localStorage/manual checklist state.
5. Stop creating customer billing logic in both `charges` and `operational_charges`.

### P0 — workflow engine
1. Compile requirements from transaction type + active agreement + context + cargo + exceptions.
2. Compile actionable tasks from requirement instances.
3. Every task declares completion rules that can be evaluated from data/evidence.
4. Guided UI, expert UI and AI command mode operate over the same task state.
5. Store provenance and overrides.

### P1 — customer onboarding
1. Entity/legal identity and contacts.
2. Locations/addresses.
3. Services selected from `service_catalog`.
4. Operational requirements per service.
5. Billing/rates/minimums/triggers per service.
6. Communication rules and recipients.
7. SLA.
8. Required documents/compliance setup.
9. Generate agreement/templates.
10. Signature lifecycle.
11. Activate versioned Service Agreement only when onboarding approval/signature requirements are satisfied.

### P1 — AI/voice contract
AI should never manipulate arbitrary DOM state as its primary action. It should produce a structured command, e.g.:

```json
{
  "intent": "CREATE_WAREHOUSE_RECEIPT",
  "facts": {
    "customer": "Merkan LLC",
    "reference": {"type": "PO", "value": "42884"},
    "cargo": [{"package_type": "PALLET", "quantity": 3}],
    "gross_weight_lb": 1240
  },
  "evidence": [],
  "confidence": {}
}
```

The domain engine resolves entities/defaults, validates facts, applies the service agreement/context, and returns missing/ambiguous requirements. UI then asks only what is still needed.

## UI audit findings

- Several screens are enhancement layers placed on top of earlier screens rather than replacement components. This has caused duplicated cards, MutationObserver complexity and occasional render loops.
- Some tabs historically scroll to sections rather than own a single view. This must be eliminated module-by-module.
- Several modules use DOM text to infer transaction identity. Core actions should receive explicit IDs/context instead.
- Some operational completion state is localStorage-only. This is acceptable for temporary UX state but not for transaction truth.
- Large `index.html` script fan-out makes load-order behavior fragile. Longer term, module routing should own its dependencies rather than globally loading every enhancer.
- There are numerous `*-enhancer`, `*-polish`, `*-patch`, and override modules. Some are useful, but each domain should eventually consolidate into one primary module plus small shared components.

## Data-quality concerns

- `cargo_units` contains both `current_location_id` and `warehouse_location_id` pointing to two separate location tables.
- `cargo_status` contains both lowercase lifecycle values and uppercase `RELEASED`, suggesting enum evolution without normalization.
- References and parties are more normalized for WR than for several other transaction types.
- Planned cargo is still represented differently across transaction types; a future canonical `planned_cargo_lines` model may be preferable to JSON metadata once behavior stabilizes.
- Polymorphic links (`target_type`, `target_id`) are useful for a universal engine but require application validation and consistent type constants.

## Stabilization rule

Until migration is complete: **new functionality writes only to canonical models; legacy models may be read through adapters but should not gain new business rules.**
