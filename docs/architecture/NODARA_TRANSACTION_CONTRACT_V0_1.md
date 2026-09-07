# NODARA Transaction Contract v0.1

Status: DESIGN DRAFT — not yet a schema freeze.

## Purpose

Define the durable logistics primitives that WR, CR, Shipments, Pickups/Deliveries/Drayage, Inventory, Billing, Documents, Workflow, AI and future FTZ capabilities will share. The objective is to stop transaction types from inventing their own competing data models while preserving enough extensibility for logistics-specific cases.

## Core design principles

1. **Stable kernel, composable modules.** A transaction has a small common core. Air, Ocean, Ground, Warehouse, FTZ, DG, etc. attach capabilities instead of bloating every transaction.
2. **Facts first.** User/import/device facts are authoritative. Normalized values and derived calculations are generated from those facts.
3. **No silent master-data creation.** Typing a Part/SKU/entity/reference never implicitly creates a master record.
4. **Explicit provenance.** Important facts can state where they came from: USER, CSV, DOCUMENT, EMAIL, API, AI, VOICE, AUTOMATION, SYSTEM_CALC, CUSTOMER_RULE, COMPANY_RULE.
5. **Internal identity is immutable.** UUID is the true database identity. Human transaction numbers are configurable display identifiers. External references remain separate.
6. **One active workflow per transaction.** Workflow guides execution but does not own transaction facts.
7. **Atomic operational writes.** Inventory, cargo assignment, release, movement, split/repack and similar operations must reconcile all affected state in one database transaction.
8. **Strong known fields + governed extensibility.** Known logistics concepts get canonical fields/models. Unknown customer-specific concepts use typed extensions, not arbitrary duplicated columns.

---

# 1. Canonical Transaction Kernel

Every operational transaction exposes the following capabilities, even if some are empty for a specific type.

## 1.1 Identity

- id (UUID, immutable)
- organization_id
- transaction_type
- transaction_subtype
- document_number
- status
- lifecycle_state
- facility / branch context
- created_by / created_at
- updated_by / updated_at
- completed_by / completed_at
- voided_by / voided_at / void_reason

The current physical tables (`warehouse_receipts`, `cargo_releases`, `shipments`, `transport_orders`, etc.) may remain as domain tables. The Transaction Contract is initially a **logical contract**, not a requirement to collapse everything into one giant table.

## 1.2 Parties

Use role-based transaction parties rather than endlessly adding columns.

Canonical party roles include:
- CUSTOMER
- SHIPPER
- CONSIGNEE
- CARRIER
- VENDOR
- BROKER
- AGENT
- NOTIFY_PARTY
- PICKUP_PARTY
- DELIVERY_PARTY
- TERMINAL
- AIRLINE
- STEAMSHIP_LINE
- TRUCKER
- CUSTOMS_BROKER
- BILL_TO
- PAY_TO
- OTHER/custom

Each party association may carry:
- entity_id
- role
- contact_id
- address_id
- snapshot name/address/contact
- sequence
- primary flag
- provenance

Important: transaction snapshots preserve what was actually used even if the Entity master later changes.

## 1.3 References

Typed, repeatable references:
- CUSTOMER_REFERENCE
- PO
- SO
- BOL
- PRO
- TRACKING
- BOOKING
- MAWB / HAWB
- MBL / HBL
- CONTAINER
- SEAL
- APPOINTMENT
- ENTRY
- IT / IE / TE / 7512
- FTZ_ADMISSION
- CUSTOMER_JOB
- CARRIER_REFERENCE
- VENDOR_REFERENCE
- CUSTOM

Attributes:
- reference_type
- reference_value
- is_primary
- issuer/entity if known
- source/provenance
- metadata

Existing `shipment_references` and `expected_receipt_references` show the correct pattern and should later converge into a generic reference primitive.

## 1.4 Milestones / Dates

Dates should be semantic rather than a proliferation of transaction-specific ad hoc columns.

Canonical milestone concepts:
- REQUESTED
- SCHEDULED_START / SCHEDULED_END
- APPOINTMENT
- CUTOFF
- AVAILABLE
- PICKUP
- RECEIVED
- TENDERED
- DEPARTURE
- ARRIVAL
- RELEASED
- DELIVERED
- COMPLETED
- LAST_FREE_DAY
- CUSTOM

Each milestone can carry planned/estimated/actual values plus source/provenance.

## 1.5 Notes / Instructions

Distinct concepts:
- INTERNAL_NOTE
- CUSTOMER_VISIBLE_NOTE
- OPERATING_INSTRUCTION
- EXCEPTION_NOTE
- SYSTEM_NOTE

Do not overload one `notes` field for all semantics. Existing plain `notes` fields remain valid compatibility projections until a richer note timeline is introduced.

---

# 2. Cargo Contract

Cargo must model physical packaging, inventory identity, transaction planning and warehouse custody without conflating them.

## 2.1 Distinct concepts

**Handling Unit** = physical package or movable logistics object (pallet, carton, crate, drum, etc.).

**Inventory Item / Part Master** = master identity of a SKU/part/product.

**Inventory Balance** = aggregate quantity of an item/lot at a warehouse location.

**Cargo Object** = canonical physical/logistics representation that can be assigned to transactions.

**Transaction Cargo / Planned Cargo** = expected or planned cargo for a transaction; it may exist before physical receipt.

These concepts relate but are not interchangeable.

## 2.2 Cargo hierarchy

Cargo supports arbitrary controlled nesting, e.g.:

1 pallet
- 20 cartons
  - 100 units

A parent has children; children may inherit context but retain independent facts.

Canonical attributes at any applicable level:
- package_type
- quantity
- operational_uom
- description
- inventory_item_id (optional explicit link)
- part_number text snapshot
- sku text snapshot
- barcode
- serial_number
- lot_number
- UIN / regulatory identity
- owner/customer
- condition
- warehouse_location_id
- cargo_status
- inventory_status
- customs/FTZ status (future domain capability)
- handling flags
- track_individually

## 2.3 Cargo quantity semantics

`quantity` always needs a UOM context.

Examples:
- 3 PLT
- 20 CTN
- 100 EA

A pallet's `quantity=1 PLT` does not mean the inventory balance equals 1 unless the linked Part Master is actually stocked in pallets. Inventory balance should be maintained in the item's base UOM where applicable.

## 2.4 Part Master behavior

Three explicit states:

1. **Free descriptive text** — operator types Part/SKU text; no master link is created.
2. **Linked** — user/AI explicitly selects an existing `inventory_item_id`.
3. **Create & Link** — explicit new master creation, then association.

No silent promotion of typed cargo text into master data.

---

# 3. Measurements and Calculations

## 3.1 Four layers

### A. Raw facts
What was entered or measured:
- L/W/H + dimension unit
- gross/net weight + weight unit
- quantity + UOM
- scale/device reading
- declared values

### B. Normalized facts
Canonical internal equivalents used for comparison and calculations:
- weight_kg
- weight_lb
- dimensions_cm / in
- volume_cbm
- volume_cuft

Normalization must never erase the raw entered values or original unit.

### C. Derived physical calculations
Examples:
- CBM / CUFT
- total gross weight
- total net weight
- pallet/carton/unit counts by hierarchy level
- footprint / occupied sqft
- utilization metrics

These may be cached for performance, but are reproducible from source facts.

### D. Commercial/context calculations
Examples:
- air volumetric weight
- air chargeable weight
- courier dimensional weight
- ocean W/M revenue ton
- storage billing quantity
- minimum-charge quantity

These depend on rules/context and therefore require a calculation snapshot.

## 3.2 Calculation snapshot

Future canonical calculation record should capture:
- id
- organization_id
- target_type / target_id
- calculation_type
- scope (cargo, shipment, WR, charge, etc.)
- input_snapshot JSON
- normalized_input JSON
- rule_code
- rule_source_type / rule_source_id
- formula_version
- result_value
- result_unit
- rounding_rule
- calculated_at
- supersedes_calculation_id
- provenance

Example:

AIR_CHARGEABLE_WEIGHT
- gross = 790 KG
- volumetric = 842 KG
- divisor = 6000 cm3/kg
- chargeable = 842 KG
- source = service/customer rule

This prevents a single contextless `chargeable_weight` field from becoming misleading.

## 3.3 Measurements history

Existing `measurements` is useful as a historical/evidence record. Current cargo fields are the current operational projection. We should preserve this split:

- measurement records = what was captured, when, by whom, confidence/verification
- cargo current values = latest accepted operational values
- calculations = reproducible derived/commercial results

---

# 4. Units

Two separate unit systems:

## Measurement units
WEIGHT, DIMENSION, VOLUME, TEMPERATURE, DISTANCE, CURRENCY.

## Operational UOM
PCS, EA, CARTON, BOX, PALLET, CRATE, DRUM, BAG, LOCATION, SQFT, DAY, HOUR, SHIPMENT, WR, etc.

Resolution hierarchy:

organization default -> transaction-type default -> actual field/cargo value

Never force all transactions into one presentation unit.

---

# 5. Documents

One canonical document concept should ultimately serve all transaction types.

Document attributes:
- id
- organization_id
- target relationships (transaction/cargo/entity/workflow/evidence)
- document_type
- category
- file_name / display_name
- storage_path
- MIME / size
- source (UPLOAD, GENERATED, EMAIL, API, AI_IMPORT, etc.)
- status
- version
- signature status
- extraction/OCR/parsed facts
- notes
- created/uploaded by
- timestamps
- provenance

Important capabilities:
- rename display name without changing storage identity
- preview
- download individually / group
- generated document templates
- signatures
- versioning
- document requirements
- association to a transaction and/or cargo item

Existing generic `documents` should become the preferred model. `warehouse_receipt_attachments` should eventually be migrated/treated as a compatibility layer, not remain a second permanent document system.

---

# 6. Charges and Billing

Prefer the richer `operational_charges` model over the older generic `charges` model as the long-term commercial primitive.

Canonical charge fields:
- service
- source transaction/event
- customer / vendor
- side (SELL / BUY / ACCRUAL)
- description
- billing basis
- quantity
- UOM
- rate
- minimum / maximum / tier rule
- sell amount
- estimated buy amount
- actual buy amount
- currency
- rate source / agreement
- calculation reference
- status
- customer invoice link
- vendor invoice/reference
- provenance

Billing quantity may be derived from any supported cargo layer or transaction scope:
- per pallet
- per carton
- per unit
- per location
- per sqft
- per day
- per shipment
- per WR
- per chargeable KG
- per W/M

The rate rule must state which layer it applies to rather than infer from UI position.

---

# 7. Workflow and Requirements

Existing `workflow_runs_v2`, `workflow_tasks_v2`, and `transaction_requirement_instances` are directionally correct.

Workflow owns:
- what needs to happen
- sequence / next action
- blocking vs recommended
- evidence requirements
- completion rules
- provenance of why the step applies

Workflow does **not** own core transaction facts. It reads/writes them through canonical transaction operations.

Rule precedence:
1. regulatory/safety hard rules
2. organization operating standard
3. customer/service agreement rules
4. transaction-specific override where permitted

No customer agreement must be required for a transaction to be operationally valid. Company defaults always provide a usable baseline.

---

# 8. Audit / Activity / Provenance

NODARA needs a unified activity model before autonomous AI actions become common.

Every material write should be attributable to:
- actor user/service
- source channel (UI, API, AI, VOICE, IMPORT, AUTOMATION, SYSTEM)
- action
- target type/id
- before/after or event payload
- timestamp
- correlation/action id
- confidence where relevant
- approval/confirmation status where relevant

Existing `cargo_events`, `inventory_transactions`, `inventory_movements`, and `workflow_events` remain domain event histories. A future transaction activity stream can aggregate/project them rather than replacing every specialized event table.

---

# 9. Domain Modules

## Warehouse Receipt
Adds:
- receiving context
- inbound source/transport linkage
- arrival/door/stage
- count/identity verification
- measurements
- condition/discrepancies
- photos/documents
- labeling
- put-away
- storage locations
- receiving completion/notification

## Cargo Release
Adds:
- release authority
- requested inventory
- allocation
- picking/staging
- driver/vehicle/pickup authority
- release confirmation
- POD/evidence
- reversal/void semantics

## Shipment
Common:
- mode
- direction
- origin/destination
- routing
- carrier
- booking
- planned/loaded cargo
- ETD/ETA/actual milestones

### Air module
- airline
- flight
- MAWB/HAWB
- cutoff
- security/TSA
- DG/temp control
- chargeable-weight rule/context

### Ocean module
- SSL/NVOCC
- vessel/voyage
- FCL/LCL/consolidation
- container/seal
- VGM
- CY/CFS
- free time / LFD
- MBL/HBL

### Ground module
- BOL/PRO
- equipment
- driver/tractor/trailer
- pickup/delivery appointments
- local/LTL/FTL/drayage

## Transport Order
- pickup/delivery/transfer/drayage type
- pickup and delivery party/address snapshots
- schedule
- carrier/driver/equipment
- instructions
- execution milestones
- POD

## Future FTZ capability
Should attach to cargo/inventory/transactions through regulatory identity and customs-status modules; it should not require a separate incompatible inventory system.

---

# 10. UI Information Architecture — Draft, not frozen

Common tab vocabulary:
- Overview
- Parties
- Cargo
- Routing / Execution
- Documents
- Charges
- Notes
- Activity

Not every transaction shows every tab.

Workflow is preferably a persistent compact guidance layer rather than another data tab.

Examples:

WR: Overview | Cargo | Documents | Charges | Notes | Activity

CR: Overview | Cargo | Execution | Documents | Charges | Notes | Activity

Air Shipment: Overview | Parties | Cargo | Routing | Documents | Charges | Notes | Activity

Transport Order: Overview | Parties | Cargo | Execution | Documents | Charges | Notes | Activity

Overview must remain a compact operational summary, not another field wall.

---

# 11. Scenario Validation Matrix

The contract is not ready to freeze until it represents these without new ad hoc schema:

1. Simple local pickup with no customer agreement.
2. Pickup converted/linked to WR.
3. WR: 1 pallet -> 20 cartons -> 100 units; mixed Part links and free-text cargo.
4. WR with CSV-imported multi-SKU cargo.
5. Partial CR against one WR item, followed by second CR for remainder.
6. Full CR release and reversal restoring location and inventory.
7. Air export with MAWB/HAWB, dimensions, volumetric and chargeable weight.
8. Air import with release authority and airport availability.
9. Ocean FCL with container/seal/VGM.
10. Ocean LCL / consolidation with multiple houses.
11. Cross-dock cargo that is received then leaves without storage.
12. Multi-location inventory for the same Part/Lot.
13. Serial-tracked item.
14. Lot-tracked item.
15. Customer-specific billing: receiving per WR, handling per carton, storage per pallet/day.
16. No-agreement customer using organization defaults.
17. DG or temperature-controlled cargo capability.
18. Future FTZ admission/withdrawal while preserving physical cargo/inventory identity.
19. Transaction created from email/document parse with provenance and human confirmation.
20. Transaction created/updated by voice/AI through the same canonical operations.

---

# 12. Migration Strategy

Do not rewrite everything at once.

Phase A — define contracts and compatibility projections.

Phase B — add missing generic primitives only where justified (transaction parties, references, calculations, activity/provenance, generic document target links).

Phase C — migrate active UI to canonical operations while retaining legacy reads where needed.

Phase D — reconcile/backfill and retire legacy duplicate tables/fields only after regression coverage proves parity.

Phase E — build AI/voice orchestration on canonical commands, never direct arbitrary table writes.

---

# 13. Decisions still open before schema freeze

1. Whether to introduce a physical `transactions` registry table or keep the kernel logical across domain tables.
2. Exact generic `transaction_parties` and `transaction_references` schemas.
3. Whether milestones should be generic rows or partly remain typed domain columns with a common projection.
4. Exact calculation snapshot schema and formula-version governance.
5. Whether current `cargo_units` or `cargo_objects` becomes the ultimate physical-cargo source of truth; migration must preserve inventory lineage.
6. Generic document target/link model.
7. Unified activity stream model and retention policy.
8. Extension-field governance: data types, validation, indexing and UI exposure.
9. Status/lifecycle vocabulary commonality vs domain-specific statuses.
10. How transaction snapshots of parties/addresses are stored and updated.

No schema freeze should occur until these are explicitly decided.
