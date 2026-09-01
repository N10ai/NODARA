import { TRACKING_OPTIONS } from './receiving-workflow.js';

export function renderTrackingDepth(container, selected, onSelect) {
  container.innerHTML = `
    <div class="eyebrow">Warehouse · Receive</div>
    <h1 class="flow-title">How should we track this cargo?</h1>
    <p class="muted">Choose the deepest level NODARA needs to control. The physical hierarchy remains connected.</p>
    <div class="tracking-options">
      ${TRACKING_OPTIONS.map(option => `
        <button class="tracking-option ${selected === option.id ? 'selected' : ''}" data-depth="${option.id}">
          <span class="tracking-radio"></span>
          <span><strong>${option.title}</strong><small>${option.description}</small></span>
        </button>`).join('')}
    </div>`;

  container.querySelectorAll('[data-depth]').forEach(button => {
    button.addEventListener('click', () => onSelect(button.dataset.depth));
  });
}

export function renderPackagingSummary(container, units) {
  const totalPackages = units.reduce((sum, unit) => sum + Number(unit.quantity || 0), 0);
  const totalEach = units.reduce((sum, unit) => {
    const qty = Number(unit.quantity || 0);
    const each = Number(unit.unitsPerPackage || 0);
    return sum + (each ? qty * each : 0);
  }, 0);

  container.innerHTML = `
    <div class="cargo-summary">
      <div><span>Tracked packages</span><strong>${totalPackages}</strong></div>
      <div><span>Contained units</span><strong>${totalEach || '—'}</strong></div>
    </div>`;
}
