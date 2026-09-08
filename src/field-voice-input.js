const main=document.getElementById('main');
const SR=()=>window.SpeechRecognition||window.webkitSpeechRecognition;
let active=null;

function labelFor(el){const field=el.closest('.field,label,.txw-summary-line,.tx-smart-field');return field?.querySelector('label,span')?.textContent?.trim()||el.getAttribute('placeholder')||'Field'}
function button(){const b=document.createElement('button');b.type='button';b.className='field-mic';b.title='Fill with voice';b.setAttribute('aria-label','Fill with voice');b.textContent='🎙';return b}
function applyTranscript(el,text){
 if(el.tagName==='SELECT'){
  const q=text.toLowerCase().trim(),opts=[...el.options],hit=opts.find(o=>o.value&&o.textContent.toLowerCase()===q)||opts.find(o=>o.value&&o.textContent.toLowerCase().includes(q))||opts.find(o=>o.value&&q.includes(o.textContent.toLowerCase()));
  if(!hit){alert(`I heard “${text}”, but it does not match an option in ${labelFor(el)}.`);return}
  el.value=hit.value;
 }else el.value=text;
 el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.focus();
}
function listen(el,b){
 const SpeechRecognition=SR();if(!SpeechRecognition)return alert('Voice field entry is not supported by this browser.');
 active?.abort?.();const r=new SpeechRecognition();active=r;r.lang='en-US';r.interimResults=false;r.continuous=false;
 b.classList.add('listening');b.textContent='●';
 r.onresult=e=>{const text=e.results?.[0]?.[0]?.transcript?.trim();if(text)applyTranscript(el,text)};
 r.onerror=e=>{if(e.error!=='aborted'&&e.error!=='no-speech')console.warn('[NODARA] voice field',e.error)};
 r.onend=()=>{b.classList.remove('listening');b.textContent='🎙';if(active===r)active=null};r.start();
}
function enhance(root=main){
 if(!root)return;
 root.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]),textarea,select').forEach(el=>{
  if(el.dataset.voiceField==='1'||el.closest('.voice-command-overlay,.tx-smart-menu'))return;
  const parent=el.parentElement;if(!parent)return;el.dataset.voiceField='1';parent.classList.add('voice-field-wrap');const b=button();b.onclick=e=>{e.preventDefault();e.stopPropagation();listen(el,b)};parent.appendChild(b);
 });
}
let timer;if(main)new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>enhance(),70)}).observe(main,{childList:true,subtree:true});setTimeout(()=>enhance(),250);
window.nodaraVoiceField={enhance};
