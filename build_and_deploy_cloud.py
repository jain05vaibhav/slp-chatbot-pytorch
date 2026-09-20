import json
import os
import sys
import time
import zipfile
import boto3
from botocore.exceptions import ClientError

REGION = "ap-south-1"
REPO_NAME = "voxai-chatbot"
FUNCTION_NAME = "voxai-chatbot"
BUILD_PROJECT_NAME = "voxai-container-build"
CODEBUILD_ROLE_NAME = "voxai-codebuild-service-role"
LAMBDA_ROLE_NAME = "voxai-lambda-exec-role"

def get_account_id(sts_client):
    return sts_client.get_caller_identity()["Account"]

def load_groq_key():
    if os.path.exists(".env"):
        with open(".env", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("GROQ_API_KEY="):
                    val = line.split("=", 1)[1].strip().strip('"').strip("'")
                    return val
    return ""

def create_s3_bucket_if_needed(s3_client, bucket_name):
    try:
        s3_client.head_bucket(Bucket=bucket_name)
        print(f"[+] S3 bucket '{bucket_name}' already exists.")
    except ClientError:
        print(f"[*] Creating S3 bucket '{bucket_name}' in {REGION}...")
        s3_client.create_bucket(
            Bucket=bucket_name,
            CreateBucketConfiguration={"LocationConstraint": REGION}
        )
        print(f"[+] S3 bucket '{bucket_name}' created.")

def create_source_zip(zip_filename="source.zip"):
    print("[*] Creating source.zip package...")
    exclude_dirs = {".git", "__pycache__", "scratch", ".pytest_cache", ".idea", ".vscode"}
    exclude_files = {".env", "source.zip", "test_verification.py"}

    with zipfile.ZipFile(zip_filename, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk("."):
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            for f in files:
                if f not in exclude_files and not f.endswith(".pyc") and not f.endswith(".log"):
                    filepath = os.path.join(root, f)
                    arcname = os.path.relpath(filepath, ".")
                    zf.write(filepath, arcname)
    print(f"[+] Created {zip_filename} ({round(os.path.getsize(zip_filename) / (1024 * 1024), 2)} MB).")
    return zip_filename

def ensure_codebuild_role(iam_client, account_id):
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"Service": "codebuild.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }
        ]
    }
    try:
        role = iam_client.get_role(RoleName=CODEBUILD_ROLE_NAME)
        print(f"[+] CodeBuild role '{CODEBUILD_ROLE_NAME}' already exists.")
        return role["Role"]["Arn"]
    except ClientError:
        print(f"[*] Creating CodeBuild IAM role '{CODEBUILD_ROLE_NAME}'...")
        role = iam_client.create_role(
            RoleName=CODEBUILD_ROLE_NAME,
            AssumeRolePolicyDocument=json.dumps(trust_policy)
        )
        policy_doc = {
            "Version": "2012-10-17",
            "Statement": [
                {"Effect": "Allow", "Action": ["logs:*", "s3:*", "ecr:*"], "Resource": "*"}
            ]
        }
        iam_client.put_role_policy(
            RoleName=CODEBUILD_ROLE_NAME,
            PolicyName="voxai-codebuild-policy",
            PolicyDocument=json.dumps(policy_doc)
        )
        print("[*] Waiting 10s for IAM propagation...")
        time.sleep(10)
        return role["Role"]["Arn"]

def ensure_lambda_role(iam_client, account_id):
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"Service": "lambda.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }
        ]
    }
    try:
        role = iam_client.get_role(RoleName=LAMBDA_ROLE_NAME)
        print(f"[+] Lambda role '{LAMBDA_ROLE_NAME}' already exists.")
        return role["Role"]["Arn"]
    except ClientError:
        print(f"[*] Creating Lambda IAM role '{LAMBDA_ROLE_NAME}'...")
        role = iam_client.create_role(
            RoleName=LAMBDA_ROLE_NAME,
            AssumeRolePolicyDocument=json.dumps(trust_policy)
        )
        iam_client.attach_role_policy(
            RoleName=LAMBDA_ROLE_NAME,
            PolicyArn="arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        )
        print("[*] Waiting 10s for IAM propagation...")
        time.sleep(10)
        return role["Role"]["Arn"]

def main():
    session = boto3.Session(region_name=REGION)
    sts = session.client("sts")
    account_id = get_account_id(sts)
    s3 = session.client("s3")
    iam = session.client("iam")
    cb = session.client("codebuild")
    lam = session.client("lambda")

    print("=" * 65)
    print("   VoxAI Cloud Build & AWS Lambda Container Deployment")
    print("=" * 65)
    print(f"[+] AWS Account: {account_id}")
    print(f"[+] AWS Region:  {REGION}")

    groq_key = load_groq_key()
    if groq_key:
        print("[+] Found GROQ_API_KEY in .env, will inject into Lambda environment.")

    # 1. Prepare S3 & Upload source.zip
    bucket_name = f"voxai-build-{account_id}-{REGION}"
    create_s3_bucket_if_needed(s3, bucket_name)
    zip_file = create_source_zip()
    s3_key = "source.zip"
    print(f"[*] Uploading {zip_file} to s3://{bucket_name}/{s3_key}...")
    s3.upload_file(zip_file, bucket_name, s3_key)
    print("[+] Upload complete.")

    # 2. Setup Roles
    codebuild_role_arn = ensure_codebuild_role(iam, account_id)
    lambda_role_arn = ensure_lambda_role(iam, account_id)

    # 3. Create or Update CodeBuild Project
    project_source = {
        "type": "S3",
        "location": f"{bucket_name}/{s3_key}"
    }
    project_env = {
        "type": "LINUX_CONTAINER",
        "image": "aws/codebuild/standard:7.0",
        "computeType": "BUILD_GENERAL1_SMALL",
        "privilegedMode": True,
        "environmentVariables": [
            {"name": "AWS_REGION", "value": REGION, "type": "PLAINTEXT"},
            {"name": "ACCOUNT_ID", "value": account_id, "type": "PLAINTEXT"},
            {"name": "REPO_NAME", "value": REPO_NAME, "type": "PLAINTEXT"}
        ]
    }
    project_artifacts = {"type": "NO_ARTIFACTS"}

    existing_projects = cb.batch_get_projects(names=[BUILD_PROJECT_NAME])["projects"]
    if existing_projects:
        print(f"[+] CodeBuild project '{BUILD_PROJECT_NAME}' already exists. Updating...")
        cb.update_project(
            name=BUILD_PROJECT_NAME,
            source=project_source,
            artifacts=project_artifacts,
            environment=project_env,
            serviceRole=codebuild_role_arn
        )
    else:
        print(f"[*] Creating CodeBuild project '{BUILD_PROJECT_NAME}'...")
        cb.create_project(
            name=BUILD_PROJECT_NAME,
            source=project_source,
            artifacts=project_artifacts,
            environment=project_env,
            serviceRole=codebuild_role_arn
        )

    # 4. Start Build
    print(f"[*] Starting AWS CodeBuild execution to build & push Docker container...")
    build_resp = cb.start_build(projectName=BUILD_PROJECT_NAME)
    build_id = build_resp["build"]["id"]
    print(f"[+] Build initiated! Build ID: {build_id}")

    # 5. Monitor Build Status
    while True:
        time.sleep(10)
        build_info = cb.batch_get_builds(ids=[build_id])["builds"][0]
        status = build_info["buildStatus"]
        current_phase = build_info.get("currentPhase", "STARTING")
        print(f"    - Build Phase: {current_phase} | Status: {status}")
        if status == "SUCCEEDED":
            print("[+] CodeBuild successfully built and pushed image to ECR!")
            break
        elif status in ("FAILED", "FAULT", "TIMED_OUT", "STOPPED"):
            print(f"[!] CodeBuild failed with status: {status}")
            sys.exit(1)

    # 6. Deploy / Update Lambda Function
    ecr_image_uri = f"{account_id}.dkr.ecr.{REGION}.amazonaws.com/{REPO_NAME}:latest"
    print(f"[*] Deploying to AWS Lambda: {FUNCTION_NAME} ({ecr_image_uri})...")

    env_config = {"Variables": {"GROQ_API_KEY": groq_key}} if groq_key else {"Variables": {}}

    try:
        lam.get_function(FunctionName=FUNCTION_NAME)
        print(f"[+] Lambda function '{FUNCTION_NAME}' exists. Updating image...")
        lam.update_function_code(
            FunctionName=FUNCTION_NAME,
            ImageUri=ecr_image_uri
        )
        print("[*] Waiting for function code update...")
        waiter = lam.get_waiter("function_updated")
        waiter.wait(FunctionName=FUNCTION_NAME)

        lam.update_function_configuration(
            FunctionName=FUNCTION_NAME,
            Timeout=30,
            MemorySize=1536,
            Environment=env_config
        )
    except ClientError:
        print(f"[*] Creating new Lambda function '{FUNCTION_NAME}'...")
        lam.create_function(
            FunctionName=FUNCTION_NAME,
            PackageType="Image",
            Code={"ImageUri": ecr_image_uri},
            Role=lambda_role_arn,
            Timeout=30,
            MemorySize=1536,
            Environment=env_config
        )
        print("[*] Waiting for function active state...")
        waiter = lam.get_waiter("function_active")
        waiter.wait(FunctionName=FUNCTION_NAME)

    # 7. Configure Lambda Function URL (Free Public HTTPS)
    print("[*] Ensuring Lambda Function URL is active...")
    try:
        url_cfg = lam.get_function_url_config(FunctionName=FUNCTION_NAME)
        function_url = url_cfg["FunctionUrl"]
    except ClientError:
        print("[*] Creating public Function URL...")
        url_cfg = lam.create_function_url_config(
            FunctionName=FUNCTION_NAME,
            AuthType="NONE",
            Cors={
                "AllowOrigins": ["*"],
                "AllowMethods": ["*"],
                "AllowHeaders": ["*"]
            }
        )
        function_url = url_cfg["FunctionUrl"]
        try:
            lam.add_permission(
                FunctionName=FUNCTION_NAME,
                StatementId="FunctionURLAllowPublicAccess",
                Action="lambda:InvokeFunctionUrl",
                Principal="*",
                FunctionUrlAuthType="NONE"
            )
        except ClientError:
            pass

    print("\n" + "=" * 65)
    print("   [+] DEPLOYMENT COMPLETE!")
    print("=" * 65)
    print(f"  Live Public HTTPS URL: {function_url}")
    print("  (Free HTTPS active! Microphone & Voice STT/TTS fully supported)")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    main()
