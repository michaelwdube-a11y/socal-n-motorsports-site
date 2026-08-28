
import {
  S3Client, PutObjectCommand, CreateMultipartUploadCommand,
  UploadPartCommand, CompleteMultipartUploadCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PART_SIZE = 100 * 1024 * 1024; // 100 MiB; good balance for race video
const SINGLE_LIMIT = 100 * 1024 * 1024; // use multipart above 100 MiB

function json(data,status=200,origin="*"){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      "Content-Type":"application/json",
      "Access-Control-Allow-Origin":origin,
      "Access-Control-Allow-Headers":"Content-Type",
      "Access-Control-Allow-Methods":"GET,POST,OPTIONS"
    }
  });
}
function safeName(name){
  return String(name||"file").replace(/[^a-zA-Z0-9._-]+/g,"_").slice(0,180);
}
function client(env){
  return new S3Client({
    region:"auto",
    endpoint:`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials:{accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY}
  });
}
function allowedOrigin(request,env){
  const origin=request.headers.get("Origin")||"";
  const allowed=env.ALLOWED_ORIGIN||"https://socalnmotorsports.store";
  return origin===allowed ? origin : allowed;
}
export async function handleUpload(request,env,url){
  const origin=allowedOrigin(request,env);
  if(request.method==="OPTIONS") return json({},204,origin);
  if(request.method!=="POST") return json({error:"method_not_allowed"},405,origin);
  const body=await request.json();
  const order=String(body.order_id||"").replace(/[^a-zA-Z0-9_-]/g,"");
  const intake=String(body.intake_id||"").replace(/[^a-zA-Z0-9_-]/g,"");
  if((url.pathname!=="/upload/part-url") && (!order||!intake)) return json({error:"missing_order_or_intake"},400,origin);

  const s3=client(env), Bucket=env.R2_BUCKET;

  if(url.pathname==="/upload/init"){
    const filename=safeName(body.filename), size=Number(body.size||0);
    const contentType=String(body.content_type||"application/octet-stream");
    if(!filename || size<=0) return json({error:"invalid_file"},400,origin);
    const key=`incoming/${order}/${intake}/${crypto.randomUUID()}-${filename}`;

    if(size<=SINGLE_LIMIT){
      const command=new PutObjectCommand({Bucket,Key:key,ContentType:contentType});
      const signed=await getSignedUrl(s3,command,{expiresIn:3600});
      return json({mode:"single",key,url:signed,content_type:contentType},200,origin);
    }
    const create=await s3.send(new CreateMultipartUploadCommand({Bucket,Key:key,ContentType:contentType}));
    return json({
      mode:"multipart", key, upload_id:create.UploadId,
      part_size:PART_SIZE, part_count:Math.ceil(size/PART_SIZE)
    },200,origin);
  }

  if(url.pathname==="/upload/part-url"){
    const key=String(body.key||""), uploadId=String(body.upload_id||"");
    const partNumber=Number(body.part_number||0);
    if(!key.startsWith("incoming/")||!uploadId||partNumber<1) return json({error:"invalid_part"},400,origin);
    const command=new UploadPartCommand({Bucket,Key:key,UploadId:uploadId,PartNumber:partNumber});
    const signed=await getSignedUrl(s3,command,{expiresIn:3600});
    return json({url:signed},200,origin);
  }

  if(url.pathname==="/upload/complete"){
    const key=String(body.key||""), uploadId=String(body.upload_id||"");
    const parts=Array.isArray(body.parts)?body.parts:[];
    if(!key.startsWith(`incoming/${order}/${intake}/`)||!uploadId||!parts.length)
      return json({error:"invalid_completion"},400,origin);
    await s3.send(new CompleteMultipartUploadCommand({
      Bucket,Key:key,UploadId:uploadId,MultipartUpload:{Parts:parts}
    }));
    await registerAsset(env,{order,intake,key,filename:body.filename,size:body.size,content_type:body.content_type});
    return json({ok:true,key},200,origin);
  }

  if(url.pathname==="/upload/register"){
    const key=String(body.key||"");
    if(!key.startsWith(`incoming/${order}/${intake}/`)) return json({error:"invalid_key"},400,origin);
    await registerAsset(env,{order,intake,key,filename:body.filename,size:body.size,content_type:body.content_type});
    return json({ok:true,key},200,origin);
  }

  if(url.pathname==="/upload/ready"){
    const jobId=crypto.randomUUID();
    const assetKey=`upload-assets:${order}:${intake}`;
    const assets=env.INTAKES ? JSON.parse(await env.INTAKES.get(assetKey)||"[]") : [];
    if(!assets.length) return json({error:"no_uploaded_assets"},400,origin);
    const job={
      job_id:jobId, order_id:order, intake_id:intake,
      status:"ready", created_at:new Date().toISOString(),
      assets, source:"socalnmotorsports.store"
    };
    if(env.INTAKES){
      await env.INTAKES.put(`job:${jobId}`,JSON.stringify(job));
      await env.INTAKES.put(`job-ready:${jobId}`,JSON.stringify(job));
    }
    // Also write a manifest into R2. The Strix can discover jobs without any inbound connection.
    if(env.MEDIA_BUCKET){
      await env.MEDIA_BUCKET.put(`jobs/ready/${jobId}.json`,JSON.stringify(job),{
        httpMetadata:{contentType:"application/json"}
      });
    }
    return json({ok:true,job_id:jobId},200,origin);
  }

  return json({error:"not_found"},404,origin);
}
async function registerAsset(env,{order,intake,key,filename,size,content_type}){
  if(!env.INTAKES) return;
  const k=`upload-assets:${order}:${intake}`;
  const arr=JSON.parse(await env.INTAKES.get(k)||"[]");
  if(!arr.some(x=>x.key===key)){
    arr.push({key,filename,size:Number(size||0),content_type,uploaded_at:new Date().toISOString()});
    await env.INTAKES.put(k,JSON.stringify(arr));
  }
}
