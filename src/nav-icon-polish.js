const truck='<svg viewBox="0 0 24 24"><path d="M3 6h11v10H3zM14 9h3.5l3.5 3.5V16h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M5 9h5"/></svg>';
function apply(){document.querySelectorAll('[data-domain="operations"] .shell-icon,[data-mobile="operations"] .shell-icon,.rail-flyout[data-module="operations"] .rail-flyout-head .shell-icon').forEach(el=>{if(el.dataset.truckApplied)return;el.innerHTML=truck;el.dataset.truckApplied='1'})}
new MutationObserver(()=>requestAnimationFrame(apply)).observe(document.body,{childList:true,subtree:true});setTimeout(apply,200);
