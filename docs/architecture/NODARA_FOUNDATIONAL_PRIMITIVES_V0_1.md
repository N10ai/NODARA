# NODARA Foundational Primitives v0.1

Status: DESIGN DRAFT — no schema freeze.

This document specifies the minimum shared primitives required before the Transaction Contract can become v1.0.

---

# 1. Transaction Relationships

Purpose: model how operational records relate without embedding one-off FK columns in every transaction.

Suggested logical schema:

```text
transaction_relationships
- id uuid
- organization_id uuid
- from_type text
- from_id uuid
- relationship_type text
- to_type text
- to_id uuid
- is_primary boolean
- metadata jsonb
- provenance jsonb
- created_by uuid
- created_at timestamptz
```

Relationship vocabulary should be controlled but extensible:

- CREATED_FROM
- SOURCE_FOR
- PRECEDES
- FOLLOWS
- FULFILLS
- CONVERTED_TO
- CONSOLIDATES
- HOUSE_OF
- RELEASES
- RECEIVES
- TRANSPORTS
- RELATED

Rules:
- both targets must exist in same organization;
- directional relation;
- deleting either transaction does **not** automatically delete the other;
- deletion policy belongs to domain operations, not the relationship table;
- duplicate identical active relations prevented;
- creation recorded in activity stream.

Examples:

```text
PICKUP --CONVERTED_TO--> WAREHOUSE_RECEIPT
WAREHOUSE_RECEIPT --SOURCE_FOR--> CARGO_RELEASE
SHIPMENT --FULFILLS--> PICKUP
HOUSE_SHIPMENT --HOUSE_OF--> CONSOLIDATION
QUOTE --CREATED_FROM/RELATED--> SHIPMENT
```

This is required for clean conversion workflows and AI reasoning over transaction chains.

---

# 2. Transaction Parties

Purpose: preserve standard customer/shipper/consignee/carrier projections while allowing arbitrary logistics roles.

Suggested logical schema:

```text
transaction_parties
- id uuid
- organization_id uuid
- transaction_type text
- transaction_id uuid
- role_code text
- entity_id uuid nullable
- contact_id uuid nullable
- address_id uuid nullable
- party_name_snapshot text
- contact_snapshot jsonb
- address_snapshot jsonb
- is_primary boolean
- sequence_no integer
- source text
- provenance jsonb
- metadata jsonb
- created_at timestamptz
- updated_at timestamptz
```

Why snapshots matter:

If ABC Logistics changes its address next year, a 2026 shipment must still show the address actually used in 2026.

Master associations remain useful for automation, rates and repeated business, but historical transaction facts must not mutate when master data changes.

Rules:
- entity/contact/address must belong to same organization when linked;
- role_code comes from controlled party-role catalog with custom extension support;
- multiple parties per role allowed where logistics requires it;
- one may be marked primary per role;
- domain columns such as `shipments.shipper_id` can remain as optimized projections during migration.

---

# 3. Typed Transaction References

Purpose: stop adding `booking_reference`, `customer_reference`, `pro_number`, etc. forever while preserving convenient high-use columns.

Suggested logical schema:

```text
transaction_references
- id uuid
- organization_id uuid
- transaction_type text
- transaction_id uuid
- reference_type text
- reference_value text
- issuer_entity_id uuid nullable
- is_primary boolean
- source text
- provenance jsonb
- metadata jsonb
- created_at timestamptz
```

Reference type catalog examples:

CUSTOMER_REFERENCE, PO, SO, BOL, PRO, TRACKING, BOOKING,
MAWB, HAWB, MBL, HBL, CONTAINER, SEAL, APPOINTMENT,
ENTRY, IT, IE, TE, 7512, FTZ_ADMISSION, CARRIER_REFERENCE,
VENDOR_REFERENCE, CUSTOM.

Rules:
- same transaction may have multiple references of same type;
- optional issuer entity;
- one primary per reference type;
- existing `shipment_references` / `expected_receipt_references` migrate eventually;
- frequently queried domain columns may remain synchronized projections.

---

# 4. Calculation Snapshots

Purpose: make derived and commercial results explainable, versioned and reproducible.

Suggested logical schema:

```text
calculation_snapshots
- id uuid
- organization_id uuid
- target_type text
- target_id uuid
- calculation_type text
- scope_type text
- scope_id uuid nullable
- input_snapshot jsonb
- normalized_input jsonb
- rule_code text nullable
- rule_source_type text nullable
- rule_source_id uuid nullable
- formula_version text
- result_value numeric nullable
- result_unit text nullable
- result_json jsonb
- rounding_rule jsonb
- supersedes_id uuid nullable
- status text
- provenance jsonb
- calculated_by uuid nullable
- calculated_at timestamptz
```

Possible `calculation_type` values:

PHYSICAL_VOLUME
TOTAL_GROSS_WEIGHT
TOTAL_NET_WEIGHT
AIR_VOLUMETRIC_WEIGHT
AIR_CHARGEABLE_WEIGHT
COURIER_DIMENSIONAL_WEIGHT
OCEAN_REVENUE_TON
STORAGE_BILLING_QUANTITY
HANDLING_BILLING_QUANTITY
LOCATION_UTILIZATION
SPACE_OCCUPANCY
CUSTOM

Rules:
- snapshots are append/versioned, not silently overwritten;
- one snapshot may supersede another;
- source facts remain authoritative;
- cached current results may exist on cargo/transaction tables for performance;
- commercial calculation must capture the rule/divisor/source used;
- deterministic physical calculations can still be regenerated from raw facts.

Example result:

```json
{
  "calculation_type": "AIR_CHARGEABLE_WEIGHT",
  "input_snapshot": {
    "gross_weight_kg": 790,
    "volume_cbm": 5.05
  },
  "normalized_input": {
    "volume_cm3": 5050000
  },
  "rule_code": "AIR_DIM_6000",
  "formula_version": "1",
  "result_value": 842,
  "result_unit": "KG"
}
```

---

# 5. Provenance

Purpose: AI/voice/import automation requires NODARA to know **where a fact or action came from**.

Rather than a separate provenance row for every scalar field initially, use a standard provenance object shape across canonical writes:

```json
{
  "source_type": "USER | CSV | DOCUMENT | EMAIL | API | AI | VOICE | AUTOMATION | SYSTEM_CALC | CUSTOMER_RULE | COMPANY_RULE",
  "source_id": "uuid-or-external-key",
  "actor_id": "uuid",
  "confidence": 0.98,
  "proposed": false,
  "confirmed": true,
  "confirmed_by": "uuid",
  "captured_at": "timestamp",
  "correlation_id": "uuid"
}
```

For facts extracted from a source, add evidence pointer when available:

```json
{
  "document_id": "uuid",
  "page": 1,
  "field": "gross_weight",
  "raw_text": "Gross Weight: 790 KG"
}
```

Important distinction:
- `source_type=AI` should normally mean AI **interpreted/proposed** the fact;
- if the value came from a PDF parsed by AI, provenance should preserve DOCUMENT as the evidence origin and AI as processor;
- user confirmation should be recorded separately rather than rewriting history as `USER`.

---

# 6. Activity / Audit Projection

Purpose: one chronological transaction timeline without discarding domain-specific event ledgers.

Recommended approach: **projection/aggregation**, not replacing every event table.

Logical activity shape:

```text
transaction_activity
- id/event_key
- organization_id
- transaction_type
- transaction_id
- event_type
- domain
- actor_id
- source_type
- occurred_at
- summary
- payload jsonb
- correlation_id
- provenance jsonb
```

Activity may aggregate/project:
- cargo_events
- inventory_transactions
- inventory_movements
- workflow_events
- workflow task completion
- documents uploaded/generated/signed
- notes/comments
- charges created/changed/invoiced
- transaction status changes
- party/reference changes
- AI/voice/import actions

UI Activity tab reads from this contract and does not need to understand every source table independently.

---

# 7. Canonical Command Contract

Required before AI/voice automation.

AI should never receive permission to perform arbitrary SQL/table writes. It should issue typed commands that use the same domain operations as the UI.

Example logical command:

```json
{
  "command": "CREATE_TRANSPORT_ORDER",
  "organization_id": "...",
  "payload": {
    "order_type": "PICKUP",
    "customer": {"entity_id": "..."},
    "pickup": {"entity_id": "...", "address_id": "..."},
    "delivery": {"facility": "WAREHOUSE"},
    "scheduled_start": "2026-09-08T10:00:00-04:00",
    "cargo": [
      {"package_type": "PALLET", "quantity": 3, "uom": "PLT"}
    ],
    "references": [
      {"type": "CUSTOMER_REFERENCE", "value": "7781"}
    ]
  },
  "provenance": {
    "source_type": "VOICE",
    "processor": "AI",
    "confirmed": true
  }
}
```

Canonical operations validate:
- permissions
- entities
- required facts
- units
- numbering
- transaction rules
- customer/company operational requirements
- cargo integrity
- workflow compilation
- audit/provenance

Potential command families:

CREATE_TRANSACTION
UPDATE_TRANSACTION_CORE
ADD/REMOVE_PARTY
ADD/REMOVE_REFERENCE
ADD/UPDATE/REMOVE_CARGO
ASSIGN_CARGO
RECEIVE_CARGO
MOVE_CARGO
SPLIT/REPACK_CARGO
CREATE/ALLOCATE/CONFIRM/REVERSE_CR
UPLOAD/GENERATE/SIGN_DOCUMENT
ADD_CHARGE
CONFIRM_MILESTONE
ADD_NOTE
COMPLETE_WORKFLOW_TASK
VOID_TRANSACTION
CONVERT_TRANSACTION

This command layer is the bridge between reliable software and future intelligence.

---

# 8. Transaction Registry Decision

Open question: should NODARA create a physical universal `transactions` registry table?

## Option A — no registry

Each domain table remains independent. Generic tables use polymorphic `(transaction_type, transaction_id)` links.

Pros:
- less migration now;
- preserves current design.

Cons:
- every generic relationship needs target-validation logic;
- universal search/activity/navigation is harder;
- polymorphic integrity cannot use normal FKs.

## Option B — lightweight transaction registry

```text
transactions
- id uuid
- organization_id
- transaction_type
- domain_record_id
- document_number
- status_projection
- created_at
- updated_at
```

Every WR/CR/Shipment/Transport Order gets one registry identity.

Generic parties/references/documents/calculations/activity relate to `transaction_id` with real FKs.

Pros:
- strong referential integrity;
- easier global search/navigation;
- simpler generic primitives;
- strong foundation for AI command routing.

Cons:
- requires careful migration/synchronization;
- risks duplicating status/document number if registry becomes a second source of truth.

## v0.1 recommendation

Favor **Option B, but only as a registry/projection**, not as a giant universal transaction table.

Domain tables remain authoritative for domain-specific facts. Registry owns only:
- universal identity
- organization
- type
- pointer to domain record
- display/document number projection
- lifecycle/status projection

All writes occur through domain operations that update both atomically.

This is likely the cleanest long-term foundation for transaction relationships, generic parties/references/documents/activity and AI commands, but should be prototyped on a development migration before production adoption.

---

# 9. Proposed next design decisions

Before production schema migration, explicitly approve/revise:

1. lightweight Transaction Registry approach;
2. role-based Party associations + immutable snapshots;
3. typed repeatable References;
4. append/versioned Calculation Snapshots;
5. standard Provenance object;
6. Activity as projection over domain events;
7. AI/voice restricted to Canonical Commands;
8. no direct AI table-write path.

Once those are settled, we can draft the migration in a non-destructive compatibility-first form.
