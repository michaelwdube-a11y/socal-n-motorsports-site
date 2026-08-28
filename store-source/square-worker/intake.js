
export async function handleIntake(request, env) {
  const origin=request.headers.get("Origin")||"";
  const allowed=env.ALLOWED_ORIGIN||"https://socalnmotorsports.store";
  const cors={"Access-Control-Allow-Origin":origin===allowed?origin:allowed,"Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json"};
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
  if(request.method!=="POST") return new Response(JSON.stringify({error:"method_not_allowed"}),{status:405,headers:cors});
  const body=await request.json();
  const email=String(body.email||"").trim(),orderId=String(body.order_id||"").trim(),productId=String(body.product_id||"").trim();
  if(!email||!orderId||!productId) return new Response(JSON.stringify({error:"missing_required_fields"}),{status:400,headers:cors});
  const intakeId=crypto.randomUUID();
  const record={id:intakeId,order_id:orderId,product_id:productId,email,created_at:new Date().toISOString(),status:"received",payload:body};
  if(env.INTAKES){await env.INTAKES.put(`intake:${intakeId}`,JSON.stringify(record));await env.INTAKES.put(`order:${orderId}:latest_intake`,intakeId);}
  if(env.INTAKE_NOTIFY_URL){try{await fetch(env.INTAKE_NOTIFY_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"customer.intake.received",intake:record})});}catch(err){console.log("INTAKE_NOTIFY_URL handoff failed",String(err));}}
  return new Response(JSON.stringify({ok:true,intake_id:intakeId,message:"Intake received. Upload instructions will follow."}),{status:200,headers:cors});
}
