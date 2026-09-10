const style=document.createElement('style');
style.textContent=`
.nodara-context-sheet .nodara-context-ai{display:none!important}
.nodara-context-sheet .nodara-context-primary{grid-template-columns:repeat(4,minmax(0,1fr))!important}
.nodara-context-sheet .nodara-context-primary button{min-width:0;min-height:66px!important;padding:8px!important;align-items:center!important;text-align:center!important}
.nodara-context-sheet .nodara-context-primary button i{width:25px!important;height:25px!important}
.nodara-context-sheet .nodara-context-primary button b{font-size:9px!important;line-height:1.15!important;text-align:center!important}
.nodara-context-sheet .nodara-context-primary .nodara-ai-tab{border-color:#347cd0!important;background:linear-gradient(145deg,#15385f,#10253f)!important}
.nodara-context-sheet .nodara-context-primary .nodara-ai-tab i{width:auto!important;height:auto!important;font-style:normal!important;font-weight:800!important;font-size:16px!important;letter-spacing:-.03em!important;color:#fff!important}
.nodara-context-sheet .nodara-context-primary .nodara-ai-tab i small{font-size:7px!important;margin-left:2px!important;color:#8fbaf0!important;vertical-align:top!important}
.nodara-chat-pop{width:min(350px,calc(100vw - 24px))!important;height:min(390px,calc(100vh - 235px))!important;border-radius:20px!important}
.nodara-chat-head{padding:9px 11px!important}
.nodara-chat-log{padding:10px!important;gap:7px!important}
.nodara-chat-compose{grid-template-columns:1fr 40px 40px!important;gap:6px!important;padding:8px!important}
.nodara-chat-compose textarea{min-height:40px!important;max-height:78px!important;padding:9px 10px!important;font-size:16px!important}
.nodara-chat-compose button{min-width:40px!important;width:40px!important;height:40px!important;padding:0!important;border-radius:12px!important;display:grid!important;place-items:center!important}
.nodara-chat-mic{background:#101b28!important;border-color:#2a4059!important;color:#e8f1fb!important}
.nodara-chat-mic.listening{background:#1d5fb3!important;border-color:#58a0ef!important;box-shadow:0 0 0 3px #2878ee22!important}
@media(max-width:390px){.nodara-context-sheet .nodara-context-primary{gap:5px!important}.nodara-context-sheet .nodara-context-primary button{padding:6px!important}.nodara-context-sheet .nodara-context-primary button b{font-size:8px!important}}
`;
document.head.appendChild(style);
function enhanceSheet(sheet){if(!sheet||sheet.dataset.aiTabPolished==='1')return;const primary=sheet.querySelector('.nodara-context-primary'),original=sheet.querySelector('.nodara-context-ai[data-nctx="chat"]');if(!primary||!original)return;const ai=document.createElement('button');ai.type='button';ai.className='nodara-ai-tab';ai.innerHTML='<i>N°<small>AI</small></i><b>AI</b>';ai.onclick=e=>{e.preventDefault();e.stopPropagation();original.click()};primary.appendChild(ai);sheet.dataset.aiTabPolished='1'}
function scan(){document.querySelectorAll('.nodara-context-sheet').forEach(enhanceSheet)}
new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});scan();
