const main=document.getElementById('main');
function apply(){
 const signin=document.getElementById('signin'),signup=document.getElementById('signup');
 const signedOut=!!signin&&!!signup&&window.__nodaraAuthenticated!==true;
 document.body.classList.toggle('nodara-auth-screen',signedOut);
 if(!signedOut)return;
 if(main.querySelector('.nodara-login-shell'))return;
 const card=signin.closest('.card');if(!card)return;
 const shell=document.createElement('div');shell.className='nodara-login-shell';
 const brand=document.createElement('div');brand.className='nodara-login-brand';brand.setAttribute('aria-label','NODARA');brand.innerHTML='NODARA<span>°</span>';
 const copy=document.createElement('div');copy.className='nodara-login-copy';copy.innerHTML='<h1>Sign in</h1><p>Access your NODARA workspace.</p>';
 card.parentNode.insertBefore(shell,card);shell.append(brand,copy,card);
}
let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply()})};
new MutationObserver(schedule).observe(main,{childList:true,subtree:true});
window.addEventListener('pageshow',schedule);setTimeout(schedule,100);
