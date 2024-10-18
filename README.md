# Supabase-On-EKS CDK Template

Self-hosted Supabase on AWS Elastic Kubernates

Inspired By Supabase Community Repository [supabase-on-aws](https://github.com/supabase-community/supabase-on-aws)

## Architecture

![architecture-diagram](docs/images/architecture-diagram-eks.png)

![smart-cdn-caching](docs/images/smart-cdn-caching.png)

## Prerequisits

- setup env variables
```bash
# the domain must have been registered with route53
DOMAIN = example.com

# get the ARN from console after the first deployment and run deploy again after setting the variable to ingress controller alb
INGRESS_ALB_ARN = example-arn 
```  

## Deploy via CDK

```bash
git clone https://github.com/mats16/supabase-on-aws.git

cd infrastructure

npm install

cdk deploy SupabaseStack
```
