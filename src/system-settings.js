const main=document.getElementById('main');
const KEY='nodara:system-settings:v1';
const defaults={
  organization_name:'NODARA Organization',
  timezone:'America/New_York',
  currency:'USD',
  date_format:'MM/DD/YYYY',
  weight_unit:'LB',
  dimension_unit:'IN',
  volume_unit:'CBM',
  temperature_unit:'F',
  volumetric_divisor_air:166,
  volumetric_divisor_ground:139,
  volumetric_factor_metric:6000,
  warehouse_default_location:'',
  auto_calculate_volume:true,
  auto_calculate_chargeable_weight:true,
  sequences:{
    warehouse_receipt:{label:'Warehouse Receipt',prefix:'WR-',pattern:'YYMMDD-######',next_number:1,reset:'DAILY'},
    cargo_release:{label:'Cargo Release',prefix:'CR-',pattern:'YYMMDD-######',next_number:1,reset:'DAILY'},
    shipment:{label:'Shipment',prefix:'SHP-',pattern:'YYMMDD-######',next_number:1,reset:'NEVER'},
    quote:{label:'Quote',prefix:'Q-',pattern:'MMDDYY-####',next_number:1,reset:'YEARLY'},
    invoice:{label:'Invoice',prefix:'INV-',pattern:'YY-######',next_number:1,reset:'YEARLY'},
    transport_order:{label:'Transport Order',prefix:'TO-',pattern:'YYMMDD-######',next_number:1,reset:'DAILY'}
  }
};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function clone(v){return JSON.parse(JSON.stringify(v))}
function load(){try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(!saved)return clone(defaults);return {...clone(defaults),...saved,sequences:{...clone(defaults.sequences),...(saved.sequences||{})}}}catch{return clone(defaults)}}
function save(s){localStorage.setItem(KEY,JSON.stringify(s));window.dispatchEvent(new CustomEvent('nodara-system-settings-changed',{detail:s}));}
function input(id,label,value,help='',type='text'){return `<label class="sys-field"><span>${label}</span><input id="${id}" type="${type}" value="${esc(value)}">${help?`<small>${help}</small>`:''}</label>`}
function select(id,label,value,options,help=''){return `<label class="sys-field"><span>${label}</span><select id="${id}">${options.map(o=>`<option value="${esc(o[0])}" ${o[0]===value?'selected':''}>${esc(o[1])}</option>`).join('')}</select>${help?`<small>${help}</small>`:''}</label>`}
function toggle(id,label,value,help=''){return `<label class="sys-toggle"><div><b>${label}</b>${help?`<small>${help}</small>`:''}</div><input id="${id}" type="checkbox" ${value?'checked':''}></label>`}
function previewSequence(s){const now=new Date(),yy=String(now.getFullYear()).slice(-2),yyyy=now.getFullYear(),mm=String(now.getMonth()+1).padStart(2,'0'),dd=String(now.getDate()).padStart(2,'0');let p=s.pattern||'######';p=p.replaceAll('YYYY',String(yyyy)).replaceAll('YY',yy).replaceAll('MM',mm).replaceAll('DD',dd);const digits=(p.match(/#+/)||['######'])[0].length;p=p.replace(/#+/,String(Number(s.next_number||1)).padStart(digits,'0'));return `${s.prefix||''}${p}`}
export function openSystemSettings(initial='general'){
 window.nodaraSetActive?.('settings_system');let active=initial,state=load();
 const sections=[['general','General'],['units','Units & calculations'],['numbering','Document numbering'],['warehouse','Warehouse defaults']];
 function shell(body){main.innerHTML=`<div class="eyebrow">Settings · System</div><div class="module-landing-head"><div><h1 class="title">System Settings</h1><p class="muted">Company-wide operational defaults used by NODARA.</p></div><button class="secondary compact-btn" id="sys-reset">Reset defaults</button></div><div class="system-settings-layout"><aside class="system-settings-nav">${sections.map(([k,l])=>`<button class="${active===k?'active':''}" data-sys-section="${k}">${l}</button>`).join('')}</aside><section class="system-settings-content">${body}</section></div>`;bindShell()}
 function bindShell(){main.querySelectorAll('[data-sys-section]').forEach(b=>b.onclick=()=>{active=b.dataset.sysSection;render()});document.getElementById('sys-reset').onclick=()=>{if(confirm('Reset all system settings to NODARA defaults?')){state=clone(defaults);save(state);render()}}}
 function footer(){return `<div class="system-settings-footer"><span id="sys-save-state">Changes are stored on this device for now.</span><button class="primary" id="sys-save">Save settings</button></div>`}
 function general(){return `<div class="settings-page-head"><h2>General</h2><p>Identity, time, currency and display conventions.</p></div><div class="system-settings-grid">${input('sys-org','Organization name',state.organization_name)}${select('sys-timezone','Timezone',state.timezone,[['America/New_York','Eastern Time'],['America/Chicago','Central Time'],['America/Denver','Mountain Time'],['America/Los_Angeles','Pacific Time'],['UTC','UTC']])}${select('sys-currency','Base currency',state.currency,[['USD','USD — US Dollar'],['EUR','EUR — Euro'],['GBP','GBP — British Pound'],['CAD','CAD — Canadian Dollar']])}${select('sys-date','Date format',state.date_format,[['MM/DD/YYYY','MM/DD/YYYY'],['DD/MM/YYYY','DD/MM/YYYY'],['YYYY-MM-DD','YYYY-MM-DD']])}</div>${footer()}`}
 function units(){return `<div class="settings-page-head"><h2>Units & calculations</h2><p>Default operational units. Individual records can still override these where allowed.</p></div><div class="system-settings-grid">${select('sys-weight','Weight',state.weight_unit,[['LB','LB — Pounds'],['KG','KG — Kilograms']])}${select('sys-dim','Dimensions',state.dimension_unit,[['IN','IN — Inches'],['CM','CM — Centimeters']])}${select('sys-volume','Volume',state.volume_unit,[['CBM','CBM — Cubic meters'],['CFT','CFT — Cubic feet']])}${select('sys-temp','Temperature',state.temperature_unit,[['F','°F — Fahrenheit'],['C','°C — Celsius']])}</div><div class="settings-card"><div class="section-heading"><div><h3>Chargeable weight</h3><span class="muted">Defaults used when NODARA calculates volumetric weight.</span></div></div><div class="system-settings-grid">${input('sys-air-div','Air divisor (in³/lb)',state.volumetric_divisor_air,'Common IATA-style inch divisor.','number')}${input('sys-ground-div','Ground divisor (in³/lb)',state.volumetric_divisor_ground,'Carrier-specific rules can override this.','number')}${input('sys-metric-factor','Metric factor (cm³/kg)',state.volumetric_factor_metric,'Typical air factor is 6000.','number')}</div>${toggle('sys-auto-volume','Auto-calculate volume',state.auto_calculate_volume,'Calculate CBM/CFT from dimensions automatically.')}${toggle('sys-auto-chargeable','Auto-calculate chargeable weight',state.auto_calculate_chargeable_weight,'Use the greater of gross and volumetric weight when applicable.')}</div>${footer()}`}
 function numbering(){return `<div class="settings-page-head"><h2>Document numbering</h2><p>Prefixes, patterns and counters for operational records.</p></div><div class="numbering-list">${Object.entries(state.sequences).map(([key,s])=>`<article class="numbering-card" data-seq="${key}"><div class="numbering-card-head"><div><b>${esc(s.label)}</b><small>Preview · ${esc(previewSequence(s))}</small></div><span class="status-pill">${esc(s.reset||'NEVER')}</span></div><div class="numbering-grid">${input(`seq-prefix-${key}`,'Prefix',s.prefix)}${input(`seq-pattern-${key}`,'Pattern',s.pattern,'Tokens: YYYY, YY, MM, DD and # for sequence digits.')}${input(`seq-next-${key}`,'Next number',s.next_number,'Counter used for the next generated record.','number')}${select(`seq-reset-${key}`,'Reset counter',s.reset,[['NEVER','Never'],['DAILY','Daily'],['MONTHLY','Monthly'],['YEARLY','Yearly']])}</div></article>`).join('')}</div>${footer()}`}
 function warehouse(){return `<div class="settings-page-head"><h2>Warehouse defaults</h2><p>Defaults used during receiving, cargo capture and put-away.</p></div><div class="system-settings-grid">${input('sys-default-location','Default receiving / staging location',state.warehouse_default_location,'Optional location code such as RECEIVING or STAGE-01.')}</div><div class="settings-card"><h3>Receiving behavior</h3>${toggle('sys-auto-volume','Auto-calculate volume',state.auto_calculate_volume,'Use cargo dimensions to calculate volume.')}${toggle('sys-auto-chargeable','Auto-calculate chargeable weight',state.auto_calculate_chargeable_weight,'Keep chargeable weight current as dimensions or gross weight change.')}</div>${footer()}`}
 function collect(){
   const val=id=>document.getElementById(id)?.value,checked=id=>!!document.getElementById(id)?.checked;
   if(active==='general'){state.organization_name=val('sys-org')||state.organization_name;state.timezone=val('sys-timezone')||state.timezone;state.currency=val('sys-currency')||state.currency;state.date_format=val('sys-date')||state.date_format}
   if(active==='units'){state.weight_unit=val('sys-weight')||state.weight_unit;state.dimension_unit=val('sys-dim')||state.dimension_unit;state.volume_unit=val('sys-volume')||state.volume_unit;state.temperature_unit=val('sys-temp')||state.temperature_unit;state.volumetric_divisor_air=Number(val('sys-air-div')||state.volumetric_divisor_air);state.volumetric_divisor_ground=Number(val('sys-ground-div')||state.volumetric_divisor_ground);state.volumetric_factor_metric=Number(val('sys-metric-factor')||state.volumetric_factor_metric);state.auto_calculate_volume=checked('sys-auto-volume');state.auto_calculate_chargeable_weight=checked('sys-auto-chargeable')}
   if(active==='warehouse'){state.warehouse_default_location=val('sys-default-location')||'';state.auto_calculate_volume=checked('sys-auto-volume');state.auto_calculate_chargeable_weight=checked('sys-auto-chargeable')}
   if(active==='numbering')for(const [key,s] of Object.entries(state.sequences)){s.prefix=val(`seq-prefix-${key}`)??s.prefix;s.pattern=val(`seq-pattern-${key}`)??s.pattern;s.next_number=Math.max(1,Number(val(`seq-next-${key}`)||1));s.reset=val(`seq-reset-${key}`)||s.reset}
 }
 function bindSave(){document.getElementById('sys-save')?.addEventListener('click',()=>{collect();save(state);const x=document.getElementById('sys-save-state');if(x)x.textContent='Saved.';if(active==='numbering')setTimeout(render,250)})}
 function render(){if(active==='general')shell(general());else if(active==='units')shell(units());else if(active==='numbering')shell(numbering());else shell(warehouse());bindSave()}
 render();
}
window.nodaraSystemSettings=openSystemSettings;
window.nodaraGetSystemSettings=load;
