#!/usr/bin/env python3
"""Upload processed customer assets to private R2 delivery storage and mint a delivery token."""
import os,json,pathlib,secrets,sys
import boto3
from botocore.config import Config

if len(sys.argv)<2:
    raise SystemExit("usage: publish_delivery.py /path/to/jobdir")
jobdir=pathlib.Path(sys.argv[1]).resolve()
job=json.loads((jobdir/"job.json").read_text())
out=jobdir/"output"
if not out.exists():
    raise SystemExit(f"missing output directory: {out}")

account=os.environ["R2_ACCOUNT_ID"]; access=os.environ["R2_ACCESS_KEY_ID"]; secret=os.environ["R2_SECRET_ACCESS_KEY"]
bucket=os.getenv("R2_BUCKET","socaln-media")
s3=boto3.client("s3",endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
                aws_access_key_id=access,aws_secret_access_key=secret,region_name="auto",
                config=Config(retries={"max_attempts":10,"mode":"standard"}))
assets=[]
for p in sorted(out.rglob("*")):
    if not p.is_file(): continue
    rel=p.relative_to(out).as_posix()
    key=f"delivery/{job['order_id']}/{job['job_id']}/{rel}"
    s3.upload_file(str(p),bucket,key)
    assets.append({"key":key,"name":p.name,"size":p.stat().st_size})

manifest={"job_id":job["job_id"],"order_id":job["order_id"],"intake_id":job["intake_id"],"assets":assets}
manifest_key=f"delivery/{job['order_id']}/{job['job_id']}/manifest.json"
s3.put_object(Bucket=bucket,Key=manifest_key,Body=json.dumps(manifest).encode(),ContentType="application/json")
print(json.dumps({"ok":True,"manifest_key":manifest_key,"assets":assets},indent=2))
