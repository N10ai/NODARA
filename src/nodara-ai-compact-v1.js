const style=document.createElement('style');
style.textContent=`
.nodara-context-ai{min-height:46px!important;padding:7px 10px!important;border-radius:14px!important;display:flex!important;align-items:center!important;gap:10px!important;background:linear-gradient(135deg,#12345c,#10243d)!important}
.nodara-context-ai>b,.nodara-context-ai>b span,.nodara-context-ai>small{display:none!important}
.nodara-ai-mark{display:inline-flex;align-items:baseline;justify-content:center;gap:3px;min-width:44px;height:30px;padding:0 8px;border:1px solid #3979ba;border-radius:10px;background:#112b48;color:#fff;font-weight:800;font-size:15px;line-height:28px;letter-spacing:-.02em}
.nodara-ai-mark em{font-style:normal;font-size:8px;color:#82b8ee;letter-spacing:.08em}
.nodara-ai-label{display:flex;flex:1;min-width:0;flex-direction:column;line-height:1.05}.nodara-ai-label b{font-size:11px;color:#f2f7fc}.nodara-ai-label small{font-size:8px;color:#8da9c5;margin-top:4px}
.nodara-ai-chevron{font-size:17px;color:#6e91b6;margin-left:auto}
.nodara-chat-pop{width:min(340px,calc(100vw - 22px))!important;height:min(390px,calc(100vh - 245px))!important;right:10px!important;bottom:calc(145px + env(safe-area-inset-bottom))!important;border-radius:20px!important;box-shadow:0 22px 60px #000d!important}
.nodara-chat-head{padding:9px 10px!important;min-height:48px}.nodara-chat-head div small{font-size:7px!important}.nodara-chat-head div b{font-size:12px!important}.nodara-chat-close{width:30px!important;height:30px!important;border-radius:9px!important}
.nodara-chat-log{padding:9px!important;gap:7px!important}.nodara-chat-msg{font-size:11px!important;padding:8px 10px!important;border-radius:13px!important;max-width:88%!important}
.nodara-chat-compose{grid-template-columns:minmax(0,1fr) 38px 38px!important;gap:6px!important;padding:8px!important}.nodara-chat-compose textarea{min-height:40px!important;max-height:78px!important;padding:9px 10px!important;border-radius:12px!important;font-size:16px!important}.nodara-chat-compose button{width:38px!important;height:38px!important;min-height:38px!important;border-radius:12px!important;padding:0!important;display:flex!important;align-items:center!important;justify-content:center!important}
.nodara-chat-mic{border:1px solid #2d455f!important;background:#0f1c2a!important;color:#d9e8f6!important}.nodara-chat-mic svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
@media(min-width:900px){.nodara-chat-pop{right:24px!important;bottom:88px!important;width:350px!important;height:410px!important}}
@media(max-width:430px){.nodara-chat-pop{left:auto!important;right:8px!important;width:calc(100vw - 16px)!important;height:min(370px,calc(100vh - 230px))!important}}
`;
document.head.appendChild(style);
function compactAiButton(btn){if(!btn||btn.dataset.nodaraCompactAi==='1')return;btn.dataset.nodaraCompactAi='1';btn.innerHTML=`<span class="nodara-ai-mark">N° <em>AI</em></span><span class="nodara-ai-label"><b>Open NODARA AI</b><small>Chat with this context</small></span><span class="nodara-ai-chevron">›</span>`}
function enhance(){document.querySelectorAll('.nodara-context-ai').forEach(compactAiButton)}
new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});setTimeout(enhance,250);
