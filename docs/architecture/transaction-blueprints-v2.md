# Core Transaction Blueprints v2

These are baseline NODARA operator blueprints. They are editable system knowledge, not rigid UI wizards. Customer Service Agreements, operational context, cargo facts and exceptions compile additional requirements/tasks at runtime.

## Warehouse Receipt

Lifecycle: Verify → Receive Cargo → Measure → Evidence → Documents → Label → Put Away → Notify → Complete.

Baseline facts:
- customer/account
- at least one meaningful reference, or documented reason for no reference
- actual cargo hierarchy
- relevant parties: shipper, consignee, carrier, driver, billing party
- description/commodity when useful
- expected-source link when converted from pickup/shipment/ASN

Cargo facts can include package type, qty/UOM, nested contents, SKU/part/barcode/lot/serial, gross weight, dimensions, condition, location and identifiers.

Customer/context rules determine photo count/views, required documents, serial/lot depth, labeling, SLA, compliance and notification behavior.

## Cargo Release

Lifecycle: Verify Authority → Allocate → Pick → Verify Pick → Stage → Verify Driver/Recipient → Release → POD → Complete.

Baseline facts:
- customer
- release authority/reference
- requested cargo/quantity
- allocation to existing WR inventory
- destination/consignee where applicable
- pickup appointment/carrier/driver/vehicle where applicable

Physical release must be traceable to existing inventory; CR never creates new warehouse cargo.

## Pickup / Delivery / Drayage

Lifecycle: Verify Request → Plan → Book/Assign Carrier → Dispatch → Pickup → In Transit → Deliver/Receive → POD → Complete.

Baseline facts:
- customer
- origin and destination with saved address/contact when possible
- requested date/window
- planned cargo
- equipment/service requirements
- customer reference/instructions
- carrier/driver when assigned

If destination is the warehouse, conversion to WR carries expected cargo and lineage; it does not pre-create physical HUs.

## Air Export

Lifecycle: Qualify → Rate → Book → Arrange Pickup → Receive → Verify Cargo → Documents → Tender → Depart → Track → Notify → Bill → Complete.

Baseline facts:
- customer, shipper, consignee
- origin/destination
- cargo pieces, gross weight, dimensions/volume/chargeable weight
- service level
- airline/route/booking/cutoff once booked
- AWB/master/house references as applicable
- shipping instructions and commercial documents as applicable

Context/customer rules determine DG, TSA/security, export filing and special documentary requirements. NODARA asks only when applicable.

## Air Import

Lifecycle: Pre-alert → Track Arrival → Arrival → Document Review → Release/Customs → Recover → Receive/Deliver → POD → Bill → Complete.

Baseline facts:
- customer, shipper, consignee
- master reference; house reference where applicable
- origin/destination
- airline/flight/ETA
- cargo summary
- terminal/CFS and release status
- customs/broker facts when applicable
- recovery/final delivery plan

## Ocean Export

Lifecycle: Qualify → Rate → Book → Plan Equipment → Drayage → Load/Receive → Documents → Submit SI → Tender → Depart → Track → Notify → Bill → Complete.

Baseline facts:
- customer, shipper, consignee
- origin/destination
- FCL/LCL/service type
- cargo weight/volume
- carrier/NVO booking/cutoffs
- equipment/container/seal when applicable
- shipping instructions and commercial docs
- VGM/export filing only when applicable

## Ocean Import

Lifecycle: Pre-alert → Track Arrival → Arrival → Document Review → Release/Customs → Availability → Recover/Dray → Receive/Deliver → Empty Return if applicable → POD → Bill → Complete.

Baseline facts:
- customer, shipper, consignee
- master/house references
- carrier/NVO, vessel/ETA
- port/CFS
- container/equipment where applicable
- availability, free time, release status
- customs/broker facts when applicable
- drayage/final delivery

## Air/Ocean Consolidation

Lifecycle: Plan → Add Houses → Check Readiness → Book Master → Build Load Plan → Tender/Load → Depart → Track → Complete.

Each house has independent readiness. Master movement cannot be considered ready just because a checklist was manually clicked; house cargo/document/security/booking evidence drives readiness.

## FTZ Admission

Lifecycle: Pre-admission Review → Verify Custody → Verify Documents/Data → Admission → Receive → Identify Controlled Inventory → Put Away → Reconcile → Complete.

Baseline data model anticipates zone, owner/importer, admission reference, merchandise identity, quantity/UOM, requested status, arrival/transfer references, custody, controlled inventory identity and zone location.

FTZ-specific regulatory rules must be versioned/configurable and tied to current operator procedures and authoritative requirements; they should not be buried as generic WR flags.

## Voice/AI behavior

For every blueprint:
1. Parse user/email/document facts into the canonical schema.
2. Resolve saved entities, addresses, contacts, services and prior patterns.
3. Resolve applicable blueprint and Service Agreement.
4. Apply operational context and exception rules.
5. Compile requirements/tasks.
6. Auto-satisfy only tasks whose completion evidence can be proven.
7. Ask the smallest next question for unresolved blocking facts.
8. Show provenance for defaults and requirements.
