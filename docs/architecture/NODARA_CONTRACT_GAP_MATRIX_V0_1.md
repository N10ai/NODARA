# NODARA Contract Gap Matrix v0.1

Companion to `NODARA_TRANSACTION_CONTRACT_V0_1.md`.

Legend:
- **GREEN** — structurally supported by current canonical/stabilized model.
- **YELLOW** — possible today, but relies on duplicated fields, metadata, transaction-specific tables, or non-canonical behavior.
- **RED** — a foundational primitive is genuinely missing.

This is a design audit, not a claim that every UI flow is complete.

| # | Scenario | Status | Current foundation | Contract gap / decision |
|---|---|---|---|---|
| 1 | Simple local pickup, no customer agreement | GREEN | `transport_orders`, organization workflow defaults, Notes/Instructions | Keep company operating standard as fallback; customer agreement optional. |
| 2 | Pickup converted/linked to WR | YELLOW | Both transaction types exist and WR can be created from inbound context | Need canonical **transaction relationship** primitive (PRECEDES / CONVERTED_TO / FULFILLS / SOURCE_FOR) instead of ad hoc IDs. |
| 3 | WR: 1 pallet → 20 cartons → 100 units, mixed Part links/free text | GREEN | `cargo_units` hierarchy, `inventory_item_id`, Part/SKU snapshots, atomic WR cargo RPCs | Need final decision on long-term `cargo_units` vs `cargo_objects` source-of-truth responsibilities. |
| 4 | CSV-imported multi-SKU WR | YELLOW | Cargo tree can represent it; import can call canonical cargo insert | Need generic import/provenance batch identity and validation report; UI/import parser should not write tables directly. |
| 5 | Partial CR against WR inventory | GREEN | `cargo_release_lines`, allocation/release RPCs, inventory balance reconciliation | Preserve atomic allocation/release contract. |
| 6 | Full CR release and reversal | GREEN | Tested release/reversal restores quantity/location/balance | Need standard VOID/REVERSE lifecycle vocabulary across transactions. |
| 7 | Air export with MAWB/HAWB + volumetric/chargeable weight | YELLOW | Shipment mode metadata, references, cargo dimensions | Missing canonical **calculation snapshot/rule provenance**; chargeable weight should not be a contextless shipment field. |
| 8 | Air import with release authority + availability | YELLOW | Shipment workflow/orchestrator + operational context + evidence | Release/availability facts should become typed milestones/facts rather than remain workflow-specific metadata only. |
| 9 | Ocean FCL container/seal/VGM | YELLOW | Ocean mode metadata supports fields | Need canonical equipment/container/reference modeling decision; metadata is acceptable short-term, not final contract. |
| 10 | Ocean LCL / consolidation with houses | YELLOW | `consolidations` / `consolidation_houses` exist | Need map into Transaction Kernel relationships and generic references/parties; deletion/link semantics must be explicit. |
| 11 | Cross-dock cargo | YELLOW | WR + CR/transport + cargo status can represent flow | Need transaction relationship + operational subtype/cross-dock intent so system knows storage is bypassed rather than inferring from fast release. |
| 12 | Same Part/Lot in multiple warehouse locations | GREEN | Canonical `warehouse_location_id` balances; multi-location uniqueness fixed and reconciled | Legacy `location_id` remains compatibility-only and should eventually retire. |
| 13 | Serial-tracked item | GREEN | `inventory_items.serial_tracking`, cargo serial fields, individual tracking | Need clear rule for when serial identity belongs at cargo unit vs inventory identity layer. |
| 14 | Lot-tracked item | GREEN | Part Master + cargo lot + inventory balance lot | Define lot inheritance/split/repack semantics explicitly. |
| 15 | Billing: receiving/WR + handling/carton + storage/pallet/day | YELLOW | `operational_charges`, service/rate agreements, unit catalog | Need canonical **billing basis + calculation reference** so quantity is explainable and tied to a cargo layer/time rule. |
| 16 | Customer without agreement uses company defaults | GREEN | Operational-context/workflow fallback already designed | Freeze precedence: regulation → organization → agreement → transaction override. |
| 17 | DG / temperature-controlled cargo | YELLOW | DG fields in `operational_contexts`; generic metadata available | Need capability model for temperature range, handling requirements, regulatory facts/evidence. |
| 18 | FTZ admission/withdrawal preserving same physical cargo | RED/YELLOW | `operational_contexts` has FTZ flags/status, cargo identity exists | Missing full regulatory custody/admission/withdrawal/status ledger. Must attach to existing cargo/inventory, not create parallel FTZ inventory. |
| 19 | Email/document parse creates transaction with human confirmation | YELLOW | `documents.extraction/source`, context confidence, entities | Missing generic fact-level provenance + proposal/confirmation model. |
| 20 | Voice/AI creates/updates transaction through canonical operations | YELLOW | Stable RPCs exist for important WMS actions; workflow engine exists | Need canonical **command/action contract** and permission/confirmation policy; AI must never perform arbitrary direct table writes. |

---

# Foundational gaps ranked by importance

## P0 — define before Transaction Contract freeze

### 1. Transaction relationships

A generic relationship model is required for:
- Pickup → WR
- Shipment → Pickup/Delivery
- WR → CR
- Shipment → Consolidation
- Quote → Shipment
- Booking → Shipment
- Parent/child operational jobs

Suggested semantics:
- SOURCE_FOR
- CREATED_FROM
- PRECEDES
- FOLLOWS
- FULFILLS
- CONSOLIDATES
- HOUSE_OF
- CONVERTED_TO
- RELATED

The relation should be directional, workspace-scoped, auditable, and should not imply cascade deletion unless explicitly defined.

### 2. Generic transaction parties

Current domain tables contain hard-coded customer/shipper/consignee/carrier fields. Keep those as optimized projections initially, but define a generic party association for arbitrary logistics roles and address/contact snapshots.

This prevents adding `broker_id`, `notify_party_id`, `terminal_id`, `agent_id`, etc. to every transaction forever.

### 3. Generic transaction references

`expected_receipt_references` and `shipment_references` already demonstrate the right pattern, but the latter is historically WR-linked and both are transaction-specific.

Create one canonical typed reference primitive later, with existing reference columns preserved as convenience projections during migration.

### 4. Calculation snapshots

Required before intelligent pricing/billing/chargeable-weight automation.

Must capture:
- inputs
- normalized inputs
- formula/rule
- divisor/factor
- result
- unit
- rounding
- source agreement/company rule
- version
- timestamp
- provenance

### 5. Fact/action provenance

Need a generic way to distinguish:
- operator-entered
- document-parsed
- imported
- API
- voice
- AI proposed
- AI confirmed
- automation
- system calculated

This should be available at least for important facts and actions, not only embedded inconsistently in metadata.

### 6. Transaction activity/audit projection

Do not replace domain event tables. Build an aggregate activity contract that can project cargo events, inventory transactions, workflow events, document events, notes and canonical actions into one transaction timeline.

---

# P1 — define before billing/advanced forwarding expansion

### 7. Milestone model

Current ETD/ETA/scheduled/actual columns are useful optimized fields. Define a generic semantic milestone layer for extensibility and UI/AI consistency.

### 8. Generic document target links

Current `documents` is close to canonical, but direct WR/cargo/job columns will not scale elegantly to every target type. Introduce a link/coverage model rather than adding one FK column per future transaction.

### 9. Capability modules

Formal capability flags/contracts for:
- DG
- temperature control
- bonded
- FTZ
- serial tracking
- lot tracking
- regulatory evidence

Capabilities should add requirements/facts without changing the base transaction schema.

### 10. Extension fields

Need governed custom fields with:
- code/name
- data type
- allowed values
- scope
- required/default
- validation
- indexing/search behavior
- visibility
- provenance

Avoid ungoverned `metadata` becoming the permanent home for every future field.

---

# Current duplicated/legacy structures to treat carefully

## `cargo_units` and `cargo_objects`

Do not merge/delete yet.

Current practical interpretation:
- `cargo_units` = WMS physical/inventory custody representation tied to WR/inventory operations.
- `cargo_objects` = canonical assignable cargo/logistics representation used across transactions.

They are synchronized for WR cargo today. The eventual source-of-truth decision must preserve inventory lineage and assignment flexibility.

## `measurements` vs measurement fields on cargo

Keep both responsibilities:
- `measurements` = measurement history/evidence.
- current cargo fields = accepted current operational projection.

## `charges` vs `operational_charges`

Long-term preference: `operational_charges` as canonical commercial model. Do not delete `charges` until all active job/accounting paths are mapped.

## `documents` vs `warehouse_receipt_attachments`

Long-term preference: generic `documents` + generic target links. WR attachment table remains compatibility layer until preview/upload/workflow parity is proven.

## transaction-specific party/reference columns

Keep as fast projections during migration. Generic associations become extensibility/source layer; do not force an immediate rewrite of every query.

---

# Proposed contract-freeze gates

The Transaction Contract should not be marked v1.0 until all are true:

1. P0 primitives are explicitly designed.
2. All 20 scenarios are GREEN at the contract level (UI may still be incomplete).
3. WR → Inventory → CR regression remains green.
4. Shipment + Transport create/edit/delete regressions remain green.
5. No new transaction type requires an ad hoc party/reference/document pattern.
6. AI/voice can be expressed as canonical commands without direct-table permissions.
7. Billing calculations can explain their input/rule/result provenance.
8. FTZ can attach to existing physical cargo/inventory without duplicating stock.
