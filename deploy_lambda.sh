#!/usr/bin/env bash
set -e

echo "================================================================"
echo "   VoxAI - AWS Lambda Container Automated Deployment (Linux/Mac)"
echo "================================================================"
echo ""

# 1. Configuration Defaults
AWS_REGION="${AWS_REGION:-ap-south-1}"
REPO_NAME="voxai-chatbot"
FUNCTION_NAME="voxai-chatbot"

# 2. Check Prerequisites
command -v aws >/dev/null 2>&1 || { echo "[!] ERROR: AWS CLI is not installed. Visit https://aws.amazon.com/cli/"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "[!] ERROR: Docker is not installed or running. Visit https://www.docker.com/"; exit 1; }

echo "[*] Checking AWS credentials..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

if [ -z "$ACCOUNT_ID" ]; then
    echo "[!] ERROR: Unable to retrieve AWS Account ID. Please run 'aws configure' first."
    exit 1
fi

ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO_NAME}"
echo "[+] AWS Account ID: ${ACCOUNT_ID}"
echo "[+] AWS Region:     ${AWS_REGION}"
echo "[+] ECR Repository: ${ECR_URI}"
echo "[+] Lambda Function:${FUNCTION_NAME}"
echo ""

# 3. Authenticate Docker to Amazon ECR
echo "[*] Logging in to Amazon ECR..."
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# 4. Create ECR Repository if it does not exist
echo "[*] Ensuring ECR repository exists..."
aws ecr describe-repositories --repository-names "${REPO_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1 || \
    aws ecr create-repository --repository-name "${REPO_NAME}" --region "${AWS_REGION}" >/dev/null

# 5. Build Docker Image
echo "[*] Building Lambda Docker image..."
docker build -t "${REPO_NAME}:latest" -f Dockerfile.lambda .

# 6. Tag and Push Image to ECR
echo "[*] Tagging and pushing image to ECR..."
docker tag "${REPO_NAME}:latest" "${ECR_URI}:latest"
docker push "${ECR_URI}:latest"

# 7. Parse .env for GROQ_API_KEY
LAMBDA_ENV=""
if [ -f .env ]; then
    GROQ_KEY=$(grep -E '^GROQ_API_KEY=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")
    if [ -n "$GROQ_KEY" ]; then
        echo "[+] Found GROQ_API_KEY in .env, will configure Lambda environment variable."
        LAMBDA_ENV="Variables={GROQ_API_KEY=${GROQ_KEY}}"
    fi
fi

# 8. Check if Lambda function exists
echo "[*] Checking if Lambda function exists..."
if aws lambda get-function --function-name "${FUNCTION_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
    echo "[+] Updating existing Lambda function code..."
    aws lambda update-function-code --function-name "${FUNCTION_NAME}" --image-uri "${ECR_URI}:latest" --region "${AWS_REGION}" >/dev/null
    if [ -n "$LAMBDA_ENV" ]; then
        echo "[+] Updating Lambda environment variables..."
        aws lambda update-function-configuration --function-name "${FUNCTION_NAME}" --environment "${LAMBDA_ENV}" --region "${AWS_REGION}" >/dev/null
    fi
else
    echo "[+] Creating IAM execution role for Lambda..."
    ROLE_NAME="voxai-lambda-exec-role"
    if ! aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
        aws iam create-role --role-name "${ROLE_NAME}" --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
        aws iam attach-role-policy --role-name "${ROLE_NAME}" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null
        echo "[*] Waiting 10s for IAM role propagation..."
        sleep 10
    fi
    ROLE_ARN=$(aws iam get-role --role-name "${ROLE_NAME}" --query Role.Arn --output text)

    echo "[+] Creating new Lambda function ${FUNCTION_NAME}..."
    if [ -n "$LAMBDA_ENV" ]; then
        aws lambda create-function \
            --function-name "${FUNCTION_NAME}" \
            --package-type Image \
            --code ImageUri="${ECR_URI}:latest" \
            --role "${ROLE_ARN}" \
            --timeout 30 \
            --memory-size 1536 \
            --environment "${LAMBDA_ENV}" \
            --region "${AWS_REGION}" >/dev/null
    else
        aws lambda create-function \
            --function-name "${FUNCTION_NAME}" \
            --package-type Image \
            --code ImageUri="${ECR_URI}:latest" \
            --role "${ROLE_ARN}" \
            --timeout 30 \
            --memory-size 1536 \
            --region "${AWS_REGION}" >/dev/null
    fi
fi

# 8. Configure Free Function URL (Public HTTPS endpoint)
echo "[*] Configuring Lambda Function URL (Free HTTPS)...
if ! aws lambda get-function-url-config --function-name "${FUNCTION_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
    aws lambda create-function-url-config \
        --function-name "${FUNCTION_NAME}" \
        --auth-type NONE \
        --cors '{"AllowOrigins":["*"],"AllowMethods":["*"],"AllowHeaders":["*"]}' \
        --region "${AWS_REGION}" >/dev/null
    
    aws lambda add-permission \
        --function-name "${FUNCTION_NAME}" \
        --statement-id FunctionURLAllowPublicAccess \
        --action lambda:InvokeFunctionUrl \
        --principal "*" \
        --function-url-auth-type NONE \
        --region "${AWS_REGION}" >/dev/null
fi

# 9. Output Live URL
FUNCTION_URL=$(aws lambda get-function-url-config --function-name "${FUNCTION_NAME}" --query FunctionUrl --output text --region "${AWS_REGION}")

echo ""
echo "================================================================"
echo "   [+] DEPLOYMENT SUCCESSFUL!"
echo "================================================================"
echo ""
echo " Your VoxAI Voice Chatbot is now live on AWS Lambda:"
echo " URL: ${FUNCTION_URL}"
echo ""
echo " (Free HTTPS is automatically active, microphone access enabled!)"
echo "================================================================"
