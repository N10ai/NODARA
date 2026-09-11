const main=document.getElementById('main');
const style=document.createElement('style');
style.textContent=`
/* WR v14 — premium guided execution surface */
body:has(.wr13-shell){--wr14-surface:rgba(11,18,28,.84);--wr14-line:rgba(127,162,201,.20);--wr14-line2:rgba(127,162,201,.12);--wr14-text:#f4f7fb;--wr14-muted:#8fa0b5;--wr14-blue:#3b82f6;--wr14-green:#48c79a}
body:has(.wr13-shell) .wr11-fab,body:has(.wr13-shell) .wr11-fab-menu,body:has(.wr13-shell) .wr-quick-capture,body:has(.wr13-shell) .floating-create,body:has(.wr13-shell) [data-floating-create]{display:none!important}
body:has(.wr13-shell) .wr11{max-width:1060px!important;padding-top:8px!important}
body:has(.wr13-shell) .wr11-hero{padding:16px 18px!important;border-radius:24px!important;background:linear-gradient(180deg,rgba(17,27,41,.96),rgba(9,15,24,.96))!important;border:1px solid var(--wr14-line)!important;box-shadow:0 18px 50px rgba(0,0,0,.22)!important;margin-bottom:10px!important}
body:has(.wr13-shell) .wr11-top h1{font-size:25px!important;letter-spacing:-.035em!important;font-weight:720!important}
body:has(.wr13-shell) .wr11-sub{font-size:11px!important}
body:has(.wr13-shell) .wr11-state{background:rgba(12,21,33,.78)!important;border-color:rgba(85,142,203,.28)!important;padding:6px 10px!important}
body:has(.wr13-shell) .wr11-mode{margin-top:11px!important;background:rgba(5,10,17,.62);width:max-content;padding:3px;border-radius:12px;border:1px solid var(--wr14-line2)}
body:has(.wr13-shell) .wr11-mode button{border:0!important;border-radius:9px!important;padding:7px 13px!important;background:transparent!important}
body:has(.wr13-shell) .wr11-mode button.active{background:rgba(50,115,203,.26)!important;color:#fff!important;box-shadow:inset 0 0 0 1px rgba(78,148,235,.38)}
body:has(.wr13-shell) .wr11-tracks,body:has(.wr13-shell) .wr11-metrics{transition:.2s ease}
body:has(.wr13-shell) .wr11-mode button[data-mode="guided"].active~*{}
body:has(.wr13-shell) .wr11-hero:has([data-mode="guided"].active) .wr11-tracks{grid-template-columns:1fr 1fr!important;gap:7px!important;margin-top:10px!important}
body:has(.wr13-shell) .wr11-hero:has([data-mode="guided"].active) .wr11-track{padding:8px 10px!important;border-radius:12px!important;background:rgba(4,10,16,.46)!important;border-color:var(--wr14-line2)!important}
body:has(.wr13-shell) .wr11-hero:has([data-mode="guided"].active) .wr11-progress{height:4px!important;margin-top:6px!important}
body:has(.wr13-shell) .wr11-hero:has([data-mode="guided"].active) .wr11-metrics{display:none!important}
body:has(.wr13-shell) .wr13-flow{margin:10px 0 22px!important;padding:26px!important;border-radius:30px!important;border:1px solid rgba(98,150,211,.24)!important;background:radial-gradient(circle at 90% 0%,rgba(45,112,189,.16),transparent 32%),linear-gradient(155deg,rgba(13,23,35,.98),rgba(7,12,19,.98))!important;box-shadow:0 26px 70px rgba(0,0,0,.28)!important;overflow:hidden;position:relative}
body:has(.wr13-shell) .wr13-flow:before{content:"";position:absolute;inset:0 0 auto;height:1px;background:linear-gradient(90deg,transparent,rgba(117,177,240,.55),transparent)}
body:has(.wr13-shell) .wr13-eyebrow{font-size:9px!important;color:#74a8df!important;letter-spacing:.17em!important;font-weight:700}
body:has(.wr13-shell) .wr13-title{font-size:31px!important;line-height:1.05!important;margin:7px 0 8px!important;font-weight:730!important;letter-spacing:-.045em!important;color:var(--wr14-text)!important}
body:has(.wr13-shell) .wr13-copy{font-size:13px!important;line-height:1.5!important;color:var(--wr14-muted)!important;max-width:620px!important}
body:has(.wr13-shell) .wr13-badge{background:rgba(19,42,67,.55)!important;border-color:rgba(93,153,217,.25)!important;color:#afc9e5!important}
body:has(.wr13-shell) .wr13-progress{gap:7px!important;margin:23px 0 20px!important}
body:has(.wr13-shell) .wr13-progress i{height:4px!important;background:#162334!important}
body:has(.wr13-shell) .wr13-progress i.now{background:linear-gradient(90deg,#438cff,#3fd0c5)!important;box-shadow:0 0 12px rgba(67,140,255,.28)}
body:has(.wr13-shell) .wr13-progress i.done{background:#4dc69c!important}
body:has(.wr13-shell) .wr13-card{border-radius:22px!important;padding:20px!important;background:rgba(7,14,22,.72)!important;border:1px solid rgba(115,152,191,.18)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.02)}
body:has(.wr13-shell) .wr13-card h3{font-size:19px!important;letter-spacing:-.025em!important;color:#f5f8fc!important}
body:has(.wr13-shell) .wr13-card p{font-size:11px!important;line-height:1.45!important;color:#8194aa!important;max-width:640px}
body:has(.wr13-shell) .wr13-fields{gap:11px!important;margin-top:18px!important}
body:has(.wr13-shell) .wr13-field span{font-size:8px!important;color:#8498af!important;font-weight:650!important}
body:has(.wr13-shell) .wr13-field input,body:has(.wr13-shell) .wr13-field select{min-height:50px!important;border-radius:15px!important;background:rgba(4,10,16,.82)!important;border:1px solid rgba(116,158,202,.24)!important;padding:0 14px!important;transition:border-color .16s,box-shadow .16s,background .16s}
body:has(.wr13-shell) .wr13-field input:focus,body:has(.wr13-shell) .wr13-field select:focus{outline:none!important;border-color:rgba(77,149,238,.82)!important;box-shadow:0 0 0 4px rgba(59,130,246,.11)!important;background:#07111c!important}
body:has(.wr13-shell) .wr13-actions{margin-top:18px!important}
body:has(.wr13-shell) .wr13-actions button{min-height:46px!important;border-radius:14px!important;padding:0 17px!important;font-weight:650!important;transition:transform .12s ease,filter .12s ease}
body:has(.wr13-shell) .wr13-actions button:active{transform:scale(.98)}
body:has(.wr13-shell) .wr13-primary{background:linear-gradient(180deg,#438af2,#2d72dc)!important;border:1px solid rgba(111,173,246,.62)!important;box-shadow:0 8px 22px rgba(39,112,221,.18)!important}
body:has(.wr13-shell) .wr13-quiet{background:rgba(13,24,36,.74)!important;border-color:rgba(110,150,192,.18)!important;color:#bfd0e0!important}
body:has(.wr13-shell) .wr13-check{background:rgba(7,16,25,.66)!important;border-color:rgba(112,151,193,.18)!important;padding:14px!important;border-radius:16px!important}
body:has(.wr13-shell) .wr13-success{background:rgba(11,37,30,.62)!important;border-color:rgba(64,180,137,.28)!important}
body:has(.wr13-shell) .wr13-stage-nav{margin-top:18px!important;gap:14px!important;scrollbar-width:none}
body:has(.wr13-shell) .wr13-stage-nav::-webkit-scrollbar{display:none}
body:has(.wr13-shell) .wr13-stage-nav button{font-size:9px!important;opacity:.8}
body:has(.wr13-shell) .wr13-stat,body:has(.wr13-shell) .wr13-meta>div{background:rgba(6,13,20,.60)!important;border-color:rgba(106,147,190,.16)!important}
body:has(.wr13-shell) .wr13-toast{backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 12px 30px rgba(0,0,0,.25)}
/* Landing: make scan the fastest path */
body:has(.wr13-shell) .wr13-landing-scan{display:grid!important;grid-template-columns:1.4fr 1fr!important;gap:8px!important}
body:has(.wr13-shell) .wr13-landing-scan button:first-child{background:linear-gradient(180deg,#438af2,#2e72dc)!important;color:#fff!important;border-color:#5c9df0!important}
/* Record mode should feel like a document inspector, not a long form */
body:has(.wr13-shell) .wr11-record-tabs{position:sticky;top:68px;z-index:40;padding:7px;background:rgba(7,12,19,.78);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(119,153,191,.12);border-radius:14px;margin-bottom:12px!important}
body:has(.wr13-shell) .wr11-record-tabs button{border:0!important;background:transparent!important;padding:8px 12px!important}
body:has(.wr13-shell) .wr11-record-tabs button.active{background:rgba(42,91,151,.28)!important;box-shadow:inset 0 0 0 1px rgba(80,143,216,.30)}
@media(max-width:700px){
 body:has(.wr13-shell) .wr11{padding:0 10px 120px!important}
 body:has(.wr13-shell) .wr11-hero{border-radius:20px!important;padding:14px!important}
 body:has(.wr13-shell) .wr11-top h1{font-size:23px!important}
 body:has(.wr13-shell) .wr11-hero:has([data-mode="guided"].active) .wr11-tracks{grid-template-columns:1fr!important}
 body:has(.wr13-shell) .wr13-flow{padding:18px!important;border-radius:24px!important;margin:8px 0 18px!important}
 body:has(.wr13-shell) .wr13-title{font-size:26px!important}
 body:has(.wr13-shell) .wr13-copy{font-size:12px!important}
 body:has(.wr13-shell) .wr13-card{padding:16px!important;border-radius:18px!important}
 body:has(.wr13-shell) .wr13-landing-scan{grid-template-columns:1fr!important}
 body:has(.wr13-shell) .wr13-actions{display:grid!important;grid-template-columns:1fr!important}
 body:has(.wr13-shell) .wr13-actions button{width:100%!important}
 body:has(.wr13-shell) .wr13-top{gap:10px!important}
 body:has(.wr13-shell) .wr13-badge{padding:5px 8px!important}
}
`;
document.head.appendChild(style);

function polish(){
 if(!main.querySelector('.wr13-shell'))return;
 document.body.classList.add('wr14-active');
 const hero=main.querySelector('.wr11-hero');
 if(hero&&!hero.querySelector('.wr14-live')){
  const d=document.createElement('div');d.className='wr14-live';d.style.cssText='margin-top:8px;color:#6e879f;font-size:9px';d.textContent='Live warehouse record · autosaved';hero.querySelector('.wr11-top>div')?.appendChild(d);
 }
}
new MutationObserver(()=>setTimeout(polish,30)).observe(main,{childList:true,subtree:true});setTimeout(polish,250);
