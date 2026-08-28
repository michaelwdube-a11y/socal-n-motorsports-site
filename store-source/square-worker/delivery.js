
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function s3(env){
  return new S3Client({
    region:"auto",
    endpoint:`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials:{accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY}
  });
}
export async function handleDelivery(request,env,url){
  if(request.method!=="GET") return Response.json({error:"method_not_allowed"},{status:405});
  const token=url.searchParams.get("token")||"";
  if(!token||!env.INTAKES) return Response.json({error:"invalid_token"},{status:400});
  const recordRaw=await env.INTAKES.get(`delivery-token:${token}`);
  if(!recordRaw) return Response.json({error:"expired_or_invalid"},{status:404});
  const record=JSON.parse(recordRaw);
  const links=[];
  for(const asset of record.assets||[]){
    const signed=await getSignedUrl(s3(env),new GetObjectCommand({Bucket:env.R2_BUCKET,Key:asset.key}),{expiresIn:3600});
    links.push({...asset,url:signed});
  }
  return Response.json({order_id:record.order_id,expires_in:3600,assets:links});
}
