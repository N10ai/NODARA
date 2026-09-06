# WR cargo table-first interaction

Warehouse Receipt cargo defaults to a compact list/table view. Each top-level cargo line remains backed by the existing nested WR cargo hierarchy and calculation engine.

## Default list

Columns: item/cargo, package, quantity, nested contents summary, weight per piece, dimensions, location, condition, actions.

## Editing

Click a row or Edit to open only that cargo branch in the existing detailed hierarchy editor. Nested packages/contents, identifiers, dimensions, condition, flags and location remain editable there. Done returns to the compact list.

## Creating

Add item creates a new top-level cargo line and immediately opens its editor. CSV import and duplicate tools continue to use the existing hierarchy engine.
