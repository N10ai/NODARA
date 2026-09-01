import { buildCargoHierarchy, summarizeHierarchy } from './cargo-hierarchy.js';

export function renderCargoCapture(container, state, onChange) {
  container.innerHTML = `
    <div class="eyebrow">Warehouse · Receive</div>
    <h1 class="flow-title">Describe the cargo.</h1>
    <p class="muted">Capture the physical hierarchy once. NODARA expands the inventory structure automatically.</p>
    <div class="cargo-capture-grid">
      <label><span>Pallets</span><input type="number" min="0" value="${state.pallets || 0}" data-field="pallets"></label>
      <label><span>Boxes / pallet</span><input type="number" min="0" value="${state.packagesPerPallet || 0}" data-field="packagesPerPallet"></label>
      <label><span>Units / box</span><input type="number" min="0" value="${state.unitsPerPackage || 0}" data-field="unitsPerPackage"></label>
      <label><span>Part number</span><input value="${state.partNumber || ''}" data-field="partNumber" placeholder="Optional"></label>
      <label><span>SKU</span><input value="${state.sku || ''}" data-field="sku" placeholder="Optional"></label>
      <label><span>Lot</span><input value="${state.lotNumber || ''}" data-field="lotNumber" placeholder="Optional"></label>
    </div>
    <div class="cargo-preview" id="cargoPreview"></div>`;

  const refresh = () => {
    const nodes = buildCargoHierarchy(state);
    const summary = summarizeHierarchy(nodes);
    container.querySelector('#cargoPreview').innerHTML = `
      <strong>Preview</strong>
      <span>${summary.pallet || 0} pallet(s)</span>
      <span>${summary.box || 0} box(es)</span>
      <span>${summary.units || 0} unit(s)</span>`;
    onChange({ ...state }, nodes);
  };

  container.querySelectorAll('[data-field]').forEach(input => {
    input.addEventListener('input', event => {
      const field = event.target.dataset.field;
      state[field] = event.target.type === 'number' ? Number(event.target.value || 0) : event.target.value.trim();
      refresh();
    });
  });

  refresh();
}
