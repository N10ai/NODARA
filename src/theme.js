const KEY='nodara:appearance';
if(!document.querySelector('link[data-nodara-theme]')){const l=document.createElement('link');l.rel='stylesheet';l.href='./theme.css?v=20260904-0310';l.dataset.nodaraTheme='1';document.head.appendChild(l)}
const media=window.matchMedia?.('(prefers-color-scheme: light)');
const valid=new Set(['system','light','dark']);
let preference=valid.has(localStorage.getItem(KEY))?localStorage.getItem(KEY):'system';
function resolved(){return preference==='system'?(media?.matches?'light':'dark'):preference}
function apply(){const r=resolved();document.documentElement.dataset.theme=r;document.documentElement.dataset.themePreference=preference;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',r==='light'?'#f5f7fa':'#07090d');document.querySelectorAll('[data-theme-choice]').forEach(b=>b.classList.toggle('active',b.dataset.themeChoice===preference));window.dispatchEvent(new CustomEvent('nodara:theme',{detail:{preference,resolved:r}}))}
function setTheme(v){if(!valid.has(v))return;preference=v;localStorage.setItem(KEY,v);apply()}
function chooser(){return `<div class="nodara-theme-control" role="group" aria-label="Appearance"><button data-theme-choice="system" title="Follow device">Auto</button><button data-theme-choice="light" title="Light appearance">☀</button><button data-theme-choice="dark" title="Dark appearance">☾</button></div>`}
function install(){apply();const account=document.querySelector('.account-menu');if(account&&!account.querySelector('.nodara-theme-row')){const row=document.createElement('div');row.className='nodara-theme-row';row.innerHTML=`<span>Appearance</span>${chooser()}`;account.insertBefore(row,account.querySelector('.account-logout')||null)}document.querySelectorAll('[data-theme-choice]').forEach(b=>{if(b.dataset.themeBound)return;b.dataset.themeBound='1';b.onclick=()=>setTheme(b.dataset.themeChoice)});apply()}
media?.addEventListener?.('change',()=>{if(preference==='system')apply()});new MutationObserver(()=>requestAnimationFrame(install)).observe(document.body,{childList:true,subtree:true});document.addEventListener('DOMContentLoaded',install);setTimeout(install,300);window.nodaraTheme={get:()=>preference,set:setTheme,resolved};
apply();
