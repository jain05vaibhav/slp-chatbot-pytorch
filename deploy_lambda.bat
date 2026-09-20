@echo off
setlocal enabledelayedexpansion

echo ================================================================
echo    VoxAI - AWS Lambda Container Automated Deployment (Windows)
echo ================================================================
echo.

:: 1. Configuration Defaults
if "%AWS_REGION%"=="" set AWS_REGION=ap-south-1
set REPO_NAME=voxai-chatbot
set FUNCTION_NAME=voxai-chatbot

:: 2. Check Prerequisites
where aws >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [!] ERROR: AWS CLI is not installed or not in PATH.
    echo Please install the AWS CLI: https://aws.amazon.com/cli/
    exit /b 1
)

where docker >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [!] ERROR: Docker is not installed or not in PATH.
    echo Please start Docker Desktop: https://www.docker.com/
    exit /b 1
)

echo [*] Checking AWS credentials...
for /f "tokens=*" %%i in ('aws sts get-caller-identity --query Account --output text 2^>nul') do set ACCOUNT_ID=%%i

if "%ACCOUNT_ID%"=="" (
    echo [!] ERROR: Unable to retrieve AWS Account ID.
    echo Please run 'aws configure' first to set your AWS credentials.
    exit /b 1
)

set ECR_URI=%ACCOUNT_ID%.dkr.ecr.%AWS_REGION%.amazonaws.com/%REPO_NAME%
echo [+] AWS Account ID: %ACCOUNT_ID%
echo [+] AWS Region:     %AWS_REGION%
echo [+] ECR Repository: %ECR_URI%
echo [+] Lambda Function: %FUNCTION_NAME%
echo.

:: 3. Authenticate Docker to Amazon ECR
echo [*] Logging in to Amazon ECR...
aws ecr get-login-password --region %AWS_REGION% | docker login --username AWS --password-stdin %ACCOUNT_ID%.dkr.ecr.%AWS_REGION%.amazonaws.com
if %ERRORLEVEL% neq 0 (
    echo [!] ECR Login failed.
    exit /b 1
)

:: 4. Create ECR Repository if it does not exist
echo [*] Ensuring ECR repository exists...
aws ecr describe-repositories --repository-names %REPO_NAME% --region %AWS_REGION% >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [+] Creating ECR repository %REPO_NAME%...
    aws ecr create-repository --repository-name %REPO_NAME% --region %AWS_REGION% >nul
)

:: 5. Build Docker Image
echo [*] Building Lambda Docker image...
docker build -t %REPO_NAME%:latest -f Dockerfile.lambda .
if %ERRORLEVEL% neq 0 (
    echo [!] Docker build failed.
    exit /b 1
)

:: 6. Tag and Push Image to ECR
echo [*] Tagging and pushing image to ECR...
docker tag %REPO_NAME%:latest %ECR_URI%:latest
docker push %ECR_URI%:latest
if %ERRORLEVEL% neq 0 (
    echo [!] Docker push to ECR failed.
    exit /b 1
)

:: 7. Parse .env for GROQ_API_KEY
set GROQ_KEY=
if exist .env (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        set "k=%%a"
        set "v=%%b"
        set "v=!v:"=!"
        if "!k!"=="GROQ_API_KEY" set "GROQ_KEY=!v!"
    )
)

if not "!GROQ_KEY!"=="" (
    echo [+] Found GROQ_API_KEY in .env, will configure Lambda environment variable.
    set "LAMBDA_ENV=Variables={GROQ_API_KEY=!GROQ_KEY!}"
) else (
    set "LAMBDA_ENV="
)

:: 8. Check if Lambda function exists
echo [*] Checking if Lambda function exists...
aws lambda get-function --function-name %FUNCTION_NAME% --region %AWS_REGION% >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [+] Updating existing Lambda function code...
    aws lambda update-function-code --function-name %FUNCTION_NAME% --image-uri %ECR_URI%:latest --region %AWS_REGION% >nul
    if not "!LAMBDA_ENV!"=="" (
        echo [+] Updating Lambda environment variables...
        aws lambda update-function-configuration --function-name %FUNCTION_NAME% --environment "!LAMBDA_ENV!" --region %AWS_REGION% >nul
    )
) else (
    echo [+] Creating IAM execution role for Lambda...
    set ROLE_NAME=voxai-lambda-exec-role
    aws iam get-role --role-name !ROLE_NAME! >nul 2>nul
    if !ERRORLEVEL! neq 0 (
        aws iam create-role --role-name !ROLE_NAME! --assume-role-policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}" >nul
        aws iam attach-role-policy --role-name !ROLE_NAME! --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >nul
        echo [*] Waiting 10s for IAM role propagation...
        timeout /t 10 /nobreak >nul
    )
    for /f "tokens=*" %%r in ('aws iam get-role --role-name !ROLE_NAME! --query Role.Arn --output text') do set ROLE_ARN=%%r

    echo [+] Creating new Lambda function %FUNCTION_NAME%...
    if not "!LAMBDA_ENV!"=="" (
        aws lambda create-function ^
            --function-name %FUNCTION_NAME% ^
            --package-type Image ^
            --code ImageUri=%ECR_URI%:latest ^
            --role !ROLE_ARN! ^
            --timeout 30 ^
            --memory-size 1536 ^
            --environment "!LAMBDA_ENV!" ^
            --region %AWS_REGION% >nul
    ) else (
        aws lambda create-function ^
            --function-name %FUNCTION_NAME% ^
            --package-type Image ^
            --code ImageUri=%ECR_URI%:latest ^
            --role !ROLE_ARN! ^
            --timeout 30 ^
            --memory-size 1536 ^
            --region %AWS_REGION% >nul
    )
)

:: 8. Configure Free Function URL (Public HTTPS endpoint)
echo [*] Configuring Lambda Function URL (Free HTTPS)...
aws lambda get-function-url-config --function-name %FUNCTION_NAME% --region %AWS_REGION% >nul 2>nul
if %ERRORLEVEL% neq 0 (
    aws lambda create-function-url-config ^
        --function-name %FUNCTION_NAME% ^
        --auth-type NONE ^
        --cors "AllowOrigins=[\"*\"],AllowMethods=[\"*\"],AllowHeaders=[\"*\"]" ^
        --region %AWS_REGION% >nul
    
    aws lambda add-permission ^
        --function-name %FUNCTION_NAME% ^
        --statement-id FunctionURLAllowPublicAccess ^
        --action lambda:InvokeFunctionUrl ^
        --principal "*" ^
        --function-url-auth-type NONE ^
        --region %AWS_REGION% >nul
)

:: 9. Output Live URL
for /f "tokens=*" %%u in ('aws lambda get-function-url-config --function-name %FUNCTION_NAME% --query FunctionUrl --output text --region %AWS_REGION%') do set FUNCTION_URL=%%u

echo.
echo ================================================================
echo    [+] DEPLOYMENT SUCCESSFUL!
echo ================================================================
echo.
echo  Your VoxAI Voice Chatbot is now live on AWS Lambda:
echo  URL: %FUNCTION_URL%
echo.
echo  (Free HTTPS is automatically active, microphone access enabled!)
echo ================================================================
