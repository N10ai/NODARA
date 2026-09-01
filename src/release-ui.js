import { allocateRelease } from './release-allocation.js';

export function renderReleaseRequest(container, inventory, onAllocate) {
  container.innerHTML = `
    <div class="eyebrow">Warehouse · Cargo Release</div>
    <h1 class="flow-title">What should leave?</h1>
    <p class="muted">Search a part, scan a UIN, or enter the requested quantity. NODARA will choose the physical pick.</p>
    <div class="card" style="max-width:720px;margin-top:24px">
      <div class="field"><label>Part / SKU / UIN / serial</label><input id="release-key" placeholder="ABC-123"></div>
      <div class="field"><label>Quantity</label><input id="release-qty" type="number" value="18"></div>
      <button id="allocate" class="primary" style="width:100%;margin-top:18px">Find best pick</button>
      <div id="allocation-result" style="margin-top:18px"></div>
    </div>`;

  container.querySelector('#allocate')?.addEventListener('click', () => {
    const key = container.querySelector('#release-key').value.trim();
    const quantity = Number(container.querySelector('#release-qty').value || 0);
    const request = key.startsWith('PLT-') || key.startsWith('CTN-') ? { cargoUnitId:key, quantity } : { partNumber:key, quantity, uom:'EA' };
    const result = allocateRelease(request, inventory, 'full_package_fifo');
    const target = container.querySelector('#allocation-result');
    target.innerHTML = result.remaining > 0
      ? `<div class="warning">Not enough available inventory. Missing ${result.remaining}.</div>`
      : `<div class="record"><strong>Recommended pick</strong>${result.allocations.map(a => `<div>${a.quantity} ${a.uom} from ${a.cargoUnitId}</div>`).join('')}</div>`;
    onAllocate?.(request, result);
  });
}

export function renderGuidedPick(container, picks, onPick) {
  let index = 0;
  const draw = () => {
    const pick = picks[index];
    if (!pick) {
      container.innerHTML = `<div class="eyebrow">Warehouse · Cargo Release</div><h1 class="flow-title">Picking complete.</h1><p class="muted">Cargo is ready for staging and custody release.</p>`;
      return;
    }
    container.innerHTML = `
      <div class="eyebrow">Warehouse · Guided Pick</div>
      <h1 class="flow-title">Go to ${pick.location || 'assigned location'}.</h1>
      <div class="card" style="max-width:620px;margin-top:24px">
        <div class="record"><strong>${pick.label || pick.cargoUnitId}</strong><br>Pick ${pick.quantity} ${pick.uom}</div>
        <button id="confirm-pick" class="primary" style="width:100%;margin-top:18px">Scan and confirm</button>
      </div>`;
    container.querySelector('#confirm-pick')?.addEventListener('click', async () => {
      await onPick?.(pick);
      index += 1;
      draw();
    });
  };
  draw();
}
