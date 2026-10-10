import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';
const headers={'Access-Control-Allow-Origin':'https://n10ai.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Content-Type':'application/json'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
async function checked(q:any){const {data,error}=await q;if(error)throw error;return data;}
async function equal(a:string,b:string){const hash=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));const [x,y]=await Promise.all([hash(a),hash(b)]);let diff=0;for(let i=0;i<32;i++)diff|=x[i]^y[i];return diff===0;}
function endpointAllowed(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}}
function validKey(value:unknown,length:number){try{return typeof value==='string'&&/^[A-Za-z0-9_-]+$/.test(value)&&atob(value.replace(/-/g,'+').replace(/_/g,'/')).length===length;}catch{return false;}}
async function send(subscription:any,config:any,data:any){if(!endpointAllowed(subscription.endpoint))throw Object.assign(new Error('Unsupported push provider'),{statusCode:400});const request=webpush.generateRequestDetails({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth_key||subscription.auth}},JSON.stringify(data),{TTL:3600,urgency:'normal',vapidDetails:{subject:'https://n10ai.github.io/NODARA/',publicKey:config.public_key,privateKey:config.private_key}});const requestHeaders={...request.headers};delete requestHeaders['Content-Length'];delete requestHeaders['content-length'];const response=await fetch(request.endpoint,{method:'POST',headers:requestHeaders,body:new Uint8Array(request.body),redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Object.assign(new Error('Push provider rejected delivery'),{statusCode:response.status});}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return reply({message:'Method not allowed'},405);
 try{
  if(Number(req.headers.get('content-length')||0)>8000)return reply({message:'Payload too large'},413);
  const body=await req.json();if(JSON.stringify(body).length>8000)return reply({message:'Payload too large'},413);
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');
  const config=await checked(admin.rpc('nodara_push_config'));if(!config)return reply({message:'Push is not configured'},503);
  if(body.action==='dispatch'){
   if(!token||!await equal(token,config.worker_token))return reply({message:'Unauthorized'},401);
   const jobs=await checked(admin.rpc('nodara_claim_push'));let delivered=0,failed=0;
   await Promise.all(jobs.map(async(job:any)=>{try{await send(job,config,{title:'NODARA reminder',body:'A request needs your attention. Tap to open it.',request_id:job.request_id,organization_id:job.organization_id,tag:'nodara-'+job.request_id});await checked(admin.from('operations_push_deliveries').update({sent_at:new Date().toISOString(),lease_until:null,last_error:null}).eq('id',job.id));delivered++;}catch(error:any){const status=Number(error.statusCode||0);if([400,404,410].includes(status))await checked(admin.from('operations_push_subscriptions').update({enabled:false}).eq('id',job.subscription_id));await checked(admin.from('operations_push_deliveries').update({lease_until:null,next_attempt_at:new Date(Date.now()+Math.min(3600000,60000*2**job.attempts)).toISOString(),last_error:status?'Push HTTP '+status:'Push delivery unavailable'}).eq('id',job.id));failed++;}}));
   return reply({delivered,failed});
  }
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false}});
  const {data:{user},error}=await client.auth.getUser();if(error||!user)return reply({message:'Sign in to enable notifications'},401);
  if(typeof body.organization_id!=='string'||!await checked(client.rpc('nodara_is_org_member',{target_org:body.organization_id})))return reply({message:'Workspace access denied'},403);
  if(body.action==='config')return reply({public_key:config.public_key});
  if(body.action==='subscribe'){
   const s=body.subscription;if(!s||!endpointAllowed(s.endpoint)||!validKey(s.keys?.p256dh,65)||!validKey(s.keys?.auth,16))return reply({message:'Invalid push subscription'},400);
   const saved=await checked(admin.from('operations_push_subscriptions').upsert({organization_id:body.organization_id,user_id:user.id,endpoint:s.endpoint,p256dh:s.keys.p256dh,auth_key:s.keys.auth,enabled:true},{onConflict:'endpoint'}).select('id').single());return reply({id:saved.id});
  }
  if(body.action==='test'){
   const s=await checked(admin.from('operations_push_subscriptions').select('*').eq('id',body.subscription_id).eq('user_id',user.id).eq('organization_id',body.organization_id).eq('enabled',true).single());
   const cutoff=new Date(Date.now()-60000).toISOString();const claim=await checked(admin.from('operations_push_subscriptions').update({last_test_at:new Date().toISOString()}).eq('id',s.id).or('last_test_at.is.null,last_test_at.lt.'+cutoff).select('id'));if(!claim.length)return reply({message:'Wait one minute before sending another test'},429);
   await send(s,config,{title:'NODARA notifications are ready',body:'Your device can receive reminder notifications.',tag:'nodara-test'});return reply({sent:true});
  }
  return reply({message:'Unknown action'},400);
 }catch{ return reply({message:'Notification operation failed. Try again.'},500); }
});
