import './warehouse-locations.js?v=20260902-1542';
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-subroute="warehouse_locations"],[data-subroute="settings_locations"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();window.nodaraSetActive?.(b.dataset.subroute);window.nodaraLocations?.()},{capture:true});
