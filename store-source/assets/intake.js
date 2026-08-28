
const qs = new URLSearchParams(location.search);
const orderId = qs.get("order") || "";
const product = qs.get("product") || "";
const productName = qs.get("name") || "";
function setText(id, text){ const el=document.getElementById(id); if(el) el.textContent=text; }
setText("orderId", orderId || "pending");
setText("productName", productName || product.replaceAll("-", " ") || "Digital product");
const orderInput=document.querySelector('input[name="order_id"]');
const productInput=document.querySelector('input[name="product_id"]');
if(orderInput) orderInput.value=orderId;
if(productInput) productInput.value=product;
const form=document.getElementById("intakeForm");
if(form){
  form.addEventListener("submit", async e=>{
    e.preventDefault();
    const button=form.querySelector('button[type="submit"]');
    const original=button.textContent;
    button.disabled=true; button.textContent="Submitting…";
    const fd=new FormData(form);
    const payload={};
    for(const [k,v] of fd.entries()){
      if(payload[k]===undefined) payload[k]=v;
      else if(Array.isArray(payload[k])) payload[k].push(v);
      else payload[k]=[payload[k],v];
    }
    payload.submitted_at=new Date().toISOString();
    const endpoint=window.SOCALN_INTAKE_ENDPOINT||"";
    if(!endpoint){
      localStorage.setItem("socaln-intake-preview", JSON.stringify(payload));
      document.getElementById("formStatus").textContent="Demo mode: intake saved locally. Connect SOCALN_INTAKE_ENDPOINT for production.";
      button.textContent="Saved"; return;
    }
    try{
      const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      if(!res.ok) throw new Error("Intake submission failed");
      const data=await res.json();
      document.getElementById("formStatus").textContent=data.message||"Intake received. Check your email for upload instructions.";
      button.textContent="Submitted";
    }catch(err){
      document.getElementById("formStatus").textContent="We could not submit the intake. Please try again.";
      button.disabled=false; button.textContent=original;
    }
  });
}
