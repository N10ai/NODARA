const css=document.createElement('style');
css.textContent=`
/* iOS: never trigger Safari input auto-zoom inside NODARA transient UI */
.nodara-context-sheet input,.nodara-context-sheet textarea,.nodara-chat-pop input,.nodara-chat-pop textarea,.nodara-command-box input,.nodara-command-box textarea{font-size:16px!important;-webkit-text-size-adjust:100%}
/* Guarantee exactly one chat microphone even if legacy enhancers race */
.nodara-chat-compose .nodara-chat-mic~.nodara-chat-mic{display:none!important}
.nodara-voice-hud{position:fixed;z-index:40000;left:50%;bottom:calc(158px + env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;align-items:center;gap:10px;min-width:154px;padding:11px 14px;border:1px solid #32679e;border-radius:999px;background:#091522f5;color:#eef7ff;box-shadow:0 18px 50px #000d,0 0 0 1px #2878ee22 inset;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);font-size:12px;font-weight:650;pointer-events:auto}.nodara-voice-hud .wave{display:flex;align-items:center;gap:2px;height:18px}.nodara-voice-hud .wave i{display:block;width:3px;border-radius:4px;background:#62aaff;animation:nodaraWave .72s ease-in-out infinite}.nodara-voice-hud .wave i:nth-child(1){height:7px}.nodara-voice-hud .wave i:nth-child(2){height:14px;animation-delay:.08s}.nodara-voice-hud .wave i:nth-child(3){height:10px;animation-delay:.16s}.nodara-voice-hud .wave i:nth-child(4){height:16px;animation-delay:.24s}.nodara-voice-hud.processing .wave i{animation:nodaraPulse .85s ease-in-out infinite}.nodara-voice-hud button{border:0;background:transparent;color:#8fc4fb;font:inherit;padding:0 0 0 4px}.nodara-chat-mic.listening{border-color:#4598ed!important;background:#123b68!important;box-shadow:0 0 0 3px #2878ee22!important}@keyframes nodaraWave{50%{transform:scaleY(.45);opacity:.65}}@keyframes nodaraPulse{50%{opacity:.25}}
.nodara-context-primary button[data-nctx="voice"].listening{border-color:#4598ed!important;background:#123b68!important;box-shadow:0 0 0 3px #2878ee22!important}.nodara-context-primary button[data-nctx="voice"].listening i{animation:nodaraMicPulse 1s ease-in-out infinite}@keyframes nodaraMicPulse{50%{transform:scale(1.12);opacity:.65}}
`;
document.head.appendChild(css);

let suppressUntil=0,keepY=0;
function markTransientOpen(){keepY=window.scrollY;suppressUntil=performance.now()+500}
function dezoom(){const meta=document.querySelector('meta[name="viewport"]');if(meta&&!/maximum-scale/.test(meta.content))meta.content='width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover'}

document.addEventListener('focusin',e=>{
  if(performance.now()>suppressUntil)return;
  const el=e.target;
  if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement))return;
  if(!el.closest('.nodara-context-sheet,.nodara-chat-pop'))return;
  requestAnimationFrame(()=>{try{el.blur()}catch{}window.scrollTo({top:keepY,left:0,behavior:'auto'})})
},true);

function cleanMics(){
 document.querySelectorAll('.nodara-chat-compose').forEach(c=>{
   const m=[...c.querySelectorAll('.nodara-chat-mic')];
   m.slice(1).forEach(x=>x.remove());
 });
}
function hud(text='Listening…',processing=false){
 document.querySelector('.nodara-voice-hud')?.remove();
 const h=document.createElement('div');h.className=`nodara-voice-hud${processing?' processing':''}`;h.innerHTML=`<span class="wave"><i></i><i></i><i></i><i></i></span><span>${text}</span>${processing?'':'<button type="button">Stop</button>'}`;document.body.appendChild(h);h.querySelector('button')?.addEventListener('click',()=>document.querySelector('.nodara-voice-toast .nodara-voice-stop')?.click());return h
}
function clearHud(){document.querySelector('.nodara-voice-hud')?.remove();document.querySelectorAll('[data-nctx="voice"].listening,.nodara-chat-mic.listening').forEach(b=>b.classList.remove('listening'))}

function wrapVoice(){
 const fn=window.nodaraVoiceCommand;
 if(!fn||fn.__nodaraVisualWrapped)return;
 const wrapped=async(...args)=>{
   document.querySelector('.nodara-context-sheet [data-nctx="voice"]')?.classList.add('listening');
   hud('Listening…');
   try{return await fn(...args)}catch(e){clearHud();throw e}
 };
 wrapped.__nodaraVisualWrapped=true;wrapped.__original=fn;window.nodaraVoiceCommand=wrapped;
}
function syncState(){
 cleanMics();wrapVoice();
 const t=document.querySelector('.nodara-voice-toast');
 if(t){const txt=t.textContent||'';if(/Transcribing/i.test(txt)){document.querySelector('.nodara-chat-mic')?.classList.remove('listening');hud('Transcribing…',true)}else if(/Listening/i.test(txt)){document.querySelector('.nodara-chat-mic')?.classList.add('listening');hud('Listening…',false)}}else if(document.querySelector('.nodara-voice-hud'))clearHud()
}
const obs=new MutationObserver(muts=>{
 for(const m of muts)for(const n of m.addedNodes){if(n.nodeType===1&&(n.matches?.('.nodara-context-sheet,.nodara-chat-pop')||n.querySelector?.('.nodara-context-sheet,.nodara-chat-pop')))markTransientOpen()}
 syncState();
});obs.observe(document.body,{childList:true,subtree:true});

document.addEventListener('click',e=>{
 const v=e.target.closest?.('[data-nctx="voice"],.nodara-chat-mic');if(v){v.classList.add('listening');hud('Listening…')}
},true);

dezoom();cleanMics();setInterval(syncState,350);
