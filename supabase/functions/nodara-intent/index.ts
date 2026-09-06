import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

const cargoItem={
  type:"object",
  additionalProperties:false,
  properties:{
    quantity:{type:["number","null"]},
    package_type:{type:["string","null"]},
    pieces:{type:["number","null"]},
    weight:{type:["number","null"]},
    weight_unit:{type:["string","null"],enum:["LB","KG",null]},
    length:{type:["number","null"]},width:{type:["number","null"]},height:{type:["number","null"]},
    dimension_unit:{type:["string","null"],enum:["IN","CM",null]},
    description:{type:["string","null"]},part_number:{type:["string","null"]},sku:{type:["string","null"]}
  },
  required:["quantity","package_type","pieces","weight","weight_unit","length","width","height","dimension_unit","description","part_number","sku"]
};
const factProperties={
  customer_name:{type:["string","null"]},shipper_name:{type:["string","null"]},consignee_name:{type:["string","null"]},carrier_name:{type:["string","null"]},driver_name:{type:["string","null"]},
  order_type:{type:["string","null"],enum:["PICKUP","DELIVERY","TRANSFER","DRAYAGE",null]},mode:{type:["string","null"],enum:["AIR","OCEAN","GROUND",null]},direction:{type:["string","null"],enum:["IMPORT","EXPORT","DOMESTIC","CROSS_TRADE",null]},service_type:{type:["string","null"]},
  origin:{type:["string","null"]},destination:{type:["string","null"]},pickup_name:{type:["string","null"]},pickup_address:{type:["string","null"]},delivery_name:{type:["string","null"]},delivery_address:{type:["string","null"]},
  scheduled_start:{type:["string","null"]},scheduled_end:{type:["string","null"]},reference:{type:["string","null"]},commodity:{type:["string","null"]},equipment:{type:["string","null"]},vehicle_reference:{type:["string","null"]},license_plate:{type:["string","null"]},
  entity_name:{type:["string","null"]},entity_roles:{type:"array",items:{type:"string"}},service_name:{type:["string","null"]},
  references:{type:"array",items:{type:"object",additionalProperties:false,properties:{type:{type:"string"},value:{type:"string"}},required:["type","value"]}},
  cargo:{type:"array",items:cargoItem}
};
const factRequired=["customer_name","shipper_name","consignee_name","carrier_name","driver_name","order_type","mode","direction","service_type","origin","destination","pickup_name","pickup_address","delivery_name","delivery_address","scheduled_start","scheduled_end","reference","commodity","equipment","vehicle_reference","license_plate","entity_name","entity_roles","service_name","references","cargo"];
const schema={
  type:"object",additionalProperties:false,
  properties:{
    intent_type:{type:"string",enum:["CREATE_TRANSACTION","UPDATE_TRANSACTION","OPEN","QUERY","RFQ","CREATE_ENTITY","CREATE_SERVICE_AGREEMENT","UNKNOWN"]},
    transaction_type:{type:"string",enum:["WAREHOUSE_RECEIPT","CARGO_RELEASE","TRANSPORT_ORDER","SHIPMENT","ENTITY","SERVICE_AGREEMENT","RFQ","NONE"]},
    action:{type:"string",enum:["CREATE","UPDATE","OPEN","QUERY","QUOTE","NONE"]},confidence:{type:"number",minimum:0,maximum:1},summary:{type:"string"},requires_confirmation:{type:"boolean"},uncertainties:{type:"array",items:{type:"string"}},
    facts:{type:"object",additionalProperties:false,properties:factProperties,required:factRequired}
  },
  required:["intent_type","transaction_type","action","confidence","summary","requires_confirmation","uncertainties","facts"]
};
function outputText(r:any){if(typeof r?.output_text==="string")return r.output_text;for(const item of r?.output||[])for(const c of item?.content||[])if(c?.type==="output_text"&&typeof c.text==="string")return c.text;return null}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const key=Deno.env.get("OPENAI_API_KEY");if(!key)return json({error:"AI_PROVIDER_NOT_CONFIGURED",message:"Set the OPENAI_API_KEY secret for the nodara-intent Edge Function."},503);
  let body:any;try{body=await req.json()}catch{return json({error:"INVALID_JSON"},400)}const text=String(body?.text||"").trim();if(!text)return json({error:"TEXT_REQUIRED"},400);const source=String(body?.source||"TEXT").toUpperCase(),context=body?.context||{};
  const instructions=`You are NODARA's logistics intent interpreter for a freight forwarder, warehouse/3PL, transport operator and FTZ environment. Convert operator language, dictated speech, emails or pasted instructions into structured JSON facts only. Never invent IDs, names, references, quantities, dates, cargo, rates, compliance facts or operational completion. Do not decide what fields are required; NODARA's canonical transaction blueprint will do that after parsing. Preserve explicitly supplied logistics terminology. Understand WR/warehouse receipt/receiving as WAREHOUSE_RECEIPT; CR/cargo release/release order as CARGO_RELEASE; pickup/delivery/transfer/drayage as TRANSPORT_ORDER; air/ocean/ground forwarding as SHIPMENT; quote/RFQ/rate request as RFQ. When the user is creating or changing a customer/vendor/carrier/shipper/consignee record, use ENTITY. When configuring a customer's service/SOP/rate/notification contract, use SERVICE_AGREEMENT. If a name could refer to multiple records, extract the name but set requires_confirmation true; never choose an entity ID. If the input asks to perform an irreversible physical action but does not clearly confirm it happened, describe the intent without claiming completion. Use null for facts not explicitly stated or safely implied by standard logistics language. Dates/times should only be normalized when the input and provided current-time context make them unambiguous. Current context: ${JSON.stringify(context)}. Input source: ${source}.`;
  const model=Deno.env.get("OPENAI_MODEL")||"gpt-5.6-terra";
  const payload={model,input:[{role:"user",content:[{type:"input_text",text}]}],instructions,reasoning:{effort:"low"},store:false,max_output_tokens:2200,text:{verbosity:"low",format:{type:"json_schema",name:"nodara_logistics_intent",strict:true,schema}}};
  let upstream:Response;try{upstream=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(payload)})}catch(e){return json({error:"AI_PROVIDER_UNREACHABLE",message:String(e)},502)}
  const raw=await upstream.json();if(!upstream.ok)return json({error:"AI_PROVIDER_ERROR",status:upstream.status,details:raw?.error?.message||raw?.error||"Unknown provider error"},502);const textOut=outputText(raw);if(!textOut)return json({error:"EMPTY_AI_RESPONSE",response_id:raw?.id},502);try{return json({model:raw.model||model,response_id:raw.id,intent:JSON.parse(textOut),usage:raw.usage||null})}catch{return json({error:"INVALID_STRUCTURED_RESPONSE",raw:textOut,response_id:raw?.id},502)}
});
