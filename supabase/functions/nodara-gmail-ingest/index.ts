import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method!=='POST')return reply({message:'Method not allowed'},405);
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(!/^[a-f0-9]{64}$/.test(token))return reply({message:'Invalid Gmail connection.'},401);
 if(Number(req.headers.get('content-length')||0)>4000000)return reply({message:'Batch is too large.'},413);
 try{
  const text=await req.text();if(text.length>4000000)return reply({message:'Batch is too large.'},413);
  const body=JSON.parse(text);if(typeof body.email!=='string'||!Array.isArray(body.messages)||body.messages.length>25)return reply({message:'Invalid Gmail batch.'},400);
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data,error}=await client.rpc('nodara_ingest_gmail',{p_token:token,p_email:body.email,p_messages:body.messages});
  if(error)return reply({message:error.code==='28000'?'Gmail connection is invalid or revoked.':'Import was not saved. Retry this batch.',code:error.code},error.code==='28000'?401:400);
  return reply(data);
 }catch{return reply({message:'Invalid Gmail batch.'},400)}
});
