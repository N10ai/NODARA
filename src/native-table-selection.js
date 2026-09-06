/* Retired during the core WMS stability refactor.
   WR, CR, Shipments, Locations, Entities and Part Master now use the shared DataView
   selection model directly. No MutationObserver may inject selection UI into record lists. */
export const NATIVE_TABLE_SELECTION_RETIRED=true;
