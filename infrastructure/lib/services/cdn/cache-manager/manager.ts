import {
  aws_iam as iam,
  aws_lambda as lambda,
  aws_sqs as sqs,
  aws_cloudfront as cf,
  Aws,
  Duration,
} from "aws-cdk-lib";
import {SqsEventSource} from "aws-cdk-lib/aws-lambda-event-sources";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import {Construct} from "constructs";
import path = require("path");

interface CacheManagerProps {
  distribution: cf.IDistribution;
}

export class CacheManager extends Construct {
  /** API endpoint for CDN cache manager */
  url: string;
  /** Bearer token for CDN cache manager */
  apiKey: string;

  /**
   * Webhook receiver for Smart CDN Caching
   * https://supabase.com/docs/guides/storage/cdn#smart-cdn-caching
   */
  constructor(scope: Construct, id: string, props: CacheManagerProps) {
    super(scope, id);

    const distribution = props.distribution;

    this.apiKey = "super-screect-header-key";

    const queue = new sqs.Queue(this, "Queue");

    /** Common settings for Lambda functions */
    const commonProps: Partial<NodejsFunctionProps> = {
      projectRoot: path.resolve(__dirname, "../../../../"),
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        externalModules: ["@aws-sdk/*", "@aws-lambda-powertools/*"],
      },
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          "LambdaPowertools",
          `arn:aws:lambda:${Aws.REGION}:094274105915:layer:AWSLambdaPowertoolsTypeScript:25`
        ),
      ],
    };

    /** API handler */
    const apiFunction = new NodejsFunction(this, "ApiFunction", {
      ...commonProps,
      description: `${this.node.path}/ApiFunction`,
      entry: path.resolve(__dirname, "./api.ts"),
      environment: {
        QUEUE_URL: queue.queueUrl,
        API_KEY: this.apiKey,
      },
    });

    // Allow API function to send messages to SQS
    queue.grantSendMessages(apiFunction);

    /** SQS consumer */
    const queueConsumer = new NodejsFunction(this, "QueueConsumer", {
      ...commonProps,
      description: `${this.node.path}/QueueConsumer`,
      entry: path.resolve(__dirname, "./queue-consumer.ts"),
      environment: {
        DISTRIBUTION_ID: distribution.distributionId,
      },
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ["cloudfront:CreateInvalidation"],
          resources: [
            `arn:aws:cloudfront::${Aws.ACCOUNT_ID}:distribution/${distribution.distributionId}`,
          ],
        }),
      ],
      events: [
        new SqsEventSource(queue, {
          batchSize: 100,
          maxBatchingWindow: Duration.seconds(5),
        }),
      ],
    });

    /** Function URL */
    const functionUrl = apiFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    this.url = functionUrl.url;
  }
}
