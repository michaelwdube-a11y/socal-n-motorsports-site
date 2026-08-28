
const params = new URLSearchParams(location.search);
const orderId = params.get("order") || "";
const intakeId = params.get("intake") || "";
const API = window.SOCALN_UPLOAD_API || "https://YOUR-WORKER.workers.dev";
document.getElementById("orderLabel").textContent = orderId || "pending";
document.getElementById("intakeLabel").textContent = intakeId || "pending";

const fileInput = document.getElementById("files");
const queue = document.getElementById("queue");
const statusEl = document.getElementById("overallStatus");

function row(file, i){
  return `<div class="workflow-step" id="f${i}">
    <div><strong>${file.name}</strong><small>${(file.size/1024/1024).toFixed(1)} MB • <span class="s">Waiting</span></small>
    <progress value="0" max="100" style="width:100%;margin-top:8px"></progress></div>
  </div>`;
}
fileInput.addEventListener("change", ()=>{
  queue.innerHTML = [...fileInput.files].map(row).join("");
});

async function api(path, body){
  const r = await fetch(API + path, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  if(!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function putPart(url, blob){
  const r = await fetch(url, {method:"PUT", body:blob});
  if(!r.ok) throw new Error(`Upload part failed: ${r.status}`);
  const etag = r.headers.get("ETag");
  if(!etag) throw new Error("R2 upload succeeded but ETag was not exposed by CORS.");
  return etag;
}

async function uploadFile(file, idx){
  const box = document.getElementById(`f${idx}`);
  const s = box.querySelector(".s"), prog = box.querySelector("progress");
  s.textContent = "Preparing";
  const init = await api("/upload/init", {
    order_id: orderId,
    intake_id: intakeId,
    filename: file.name,
    content_type: file.type || "application/octet-stream",
    size: file.size
  });

  if(init.mode === "single"){
    s.textContent = "Uploading";
    const r = await fetch(init.url, {
      method:"PUT",
      headers:{"Content-Type":init.content_type},
      body:file
    });
    if(!r.ok) throw new Error(`Upload failed: ${r.status}`);
    prog.value = 100;
    await api("/upload/register", {
      order_id: orderId, intake_id: intakeId, key:init.key,
      filename:file.name, size:file.size, content_type:init.content_type
    });
    s.textContent = "Complete";
    return;
  }

  const parts = [];
  const partSize = init.part_size;
  for(let p=1; p<=init.part_count; p++){
    s.textContent = `Uploading part ${p}/${init.part_count}`;
    const start=(p-1)*partSize, end=Math.min(file.size,start+partSize);
    const signed = await api("/upload/part-url", {
      key:init.key, upload_id:init.upload_id, part_number:p
    });
    const etag = await putPart(signed.url, file.slice(start,end));
    parts.push({PartNumber:p,ETag:etag});
    prog.value = Math.round((p/init.part_count)*100);
  }
  s.textContent = "Finalizing";
  await api("/upload/complete", {
    order_id:orderId,intake_id:intakeId,key:init.key,upload_id:init.upload_id,
    filename:file.name,size:file.size,content_type:file.type||"application/octet-stream",
    parts
  });
  prog.value = 100; s.textContent = "Complete";
}

document.getElementById("uploadBtn").addEventListener("click", async ()=>{
  if(!orderId || !intakeId){
    statusEl.textContent = "Missing order/intake ID. Open this upload page from the completed intake workflow.";
    return;
  }
  const files=[...fileInput.files];
  if(!files.length){statusEl.textContent="Select at least one file."; return;}
  statusEl.textContent="Uploading… Keep this tab open.";
  try{
    for(let i=0;i<files.length;i++) await uploadFile(files[i],i);
    const ready = await api("/upload/ready", {order_id:orderId,intake_id:intakeId});
    statusEl.textContent = `Upload complete. Processing job ${ready.job_id} has been queued.`;
  }catch(e){
    console.error(e);
    statusEl.textContent = `Upload stopped: ${e.message}`;
  }
});
