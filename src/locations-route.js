import { openLocations } from './locations-core.js?v=20260906-core1';
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-subroute="warehouse_locations"],[data-subroute="settings_locations"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();window.nodaraSetActive?.(b.dataset.subroute);openLocations()},{capture:true});
window.nodaraLocations=openLocations;
