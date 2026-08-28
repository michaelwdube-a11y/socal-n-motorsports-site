#!/usr/bin/env python3
"""
SoCal N Store -> Strix bridge.

Security model:
- no inbound Internet port on the Strix
- Strix uses outbound HTTPS/S3 calls to private R2
- jobs are discovered under jobs/ready/
- source media downloads to a local staging directory
- a task is written into /home/mike/socal-ai/tasks/inbox
- results can be published back with publish_delivery.py
"""
import os, json, time, pathlib, hashlib, shutil
import boto3
from botocore.config import Config

ACCOUNT_ID=os.environ["R2_ACCOUNT_ID"]
ACCESS=os.environ["R2_ACCESS_KEY_ID"]
SECRET=os.environ["R2_SECRET_ACCESS_KEY"]
BUCKET=os.getenv("R2_BUCKET","socaln-media")
PROJECT=pathlib.Path(os.getenv("SOCAL_AI_ROOT","/home/mike/socal-ai"))
STAGING=pathlib.Path(os.getenv("SOCAL_STORE_STAGING",str(PROJECT/"data/store_orders")))
POLL=int(os.getenv("SOCAL_STORE_POLL_SECONDS","60"))

s3=boto3.client("s3",endpoint_url=f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com",
                aws_access_key_id=ACCESS,aws_secret_access_key=SECRET,region_name="auto",
                config=Config(retries={"max_attempts":10,"mode":"standard"}))

def list_ready():
    resp=s3.list_objects_v2(Bucket=BUCKET,Prefix="jobs/ready/")
    return [o["Key"] for o in resp.get("Contents",[]) if o["Key"].endswith(".json")]

def get_json(key):
    return json.loads(s3.get_object(Bucket=BUCKET,Key=key)["Body"].read())

def safe(name):
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in name)[:180]

def claim(job_key,job):
    claimed=f"jobs/claimed/{job['job_id']}.json"
    s3.put_object(Bucket=BUCKET,Key=claimed,Body=json.dumps(job).encode(),ContentType="application/json")
    s3.delete_object(Bucket=BUCKET,Key=job_key)

def stage(job):
    jobdir=STAGING/job["job_id"]
    src=jobdir/"source"
    src.mkdir(parents=True,exist_ok=True)
    local_assets=[]
    for asset in job["assets"]:
        dest=src/safe(asset.get("filename") or pathlib.Path(asset["key"]).name)
        print("Downloading",asset["key"],"->",dest,flush=True)
        s3.download_file(BUCKET,asset["key"],str(dest))
        local_assets.append(str(dest))
    manifest={**job,"local_assets":local_assets,"local_job_dir":str(jobdir)}
    (jobdir/"job.json").write_text(json.dumps(manifest,indent=2))
    return jobdir,manifest

def enqueue(jobdir,job):
    inbox=PROJECT/"tasks/inbox"
    inbox.mkdir(parents=True,exist_ok=True)
    task=inbox/f"store-order-{job['job_id']}.task"
    task.write_text(f"""Process a paid SoCal N Motorsports store digital-product job.

JOB_ID: {job['job_id']}
ORDER_ID: {job['order_id']}
INTAKE_ID: {job['intake_id']}
LOCAL_JOB_DIR: {jobdir}
MANIFEST: {jobdir/'job.json'}

Requirements:
1. Inspect the manifest and all staged telemetry/video/media.
2. Use the existing SoCal AI telemetry, video/media, coaching and report-generation capabilities where applicable.
3. Produce customer-facing deliverables under:
   {jobdir/'output'}
4. Do not delete original staged source files.
5. Verify every generated deliverable.
6. When complete, run the provided publish_delivery.py workflow or emit a completion manifest suitable for it.
""")
    return task

def main():
    STAGING.mkdir(parents=True,exist_ok=True)
    print("SoCal N store bridge active; outbound-only R2 polling",flush=True)
    while True:
        try:
            for key in list_ready():
                job=get_json(key)
                if (STAGING/job["job_id"]/"job.json").exists():
                    # already staged locally; remove stale ready marker
                    s3.delete_object(Bucket=BUCKET,Key=key)
                    continue
                claim(key,job)
                jobdir,manifest=stage(job)
                task=enqueue(jobdir,manifest)
                print("Queued",task,flush=True)
        except Exception as e:
            print("bridge error:",repr(e),flush=True)
        time.sleep(POLL)

if __name__=="__main__":
    main()
