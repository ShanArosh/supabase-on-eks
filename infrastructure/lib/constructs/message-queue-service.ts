import {
  aws_lambda as lambda,
  aws_apigateway as apigw,
  aws_iam as iam,
  aws_sqs as sqs,
} from "aws-cdk-lib";
import {Construct} from "constructs";
import {EndpointType} from "aws-cdk-lib/aws-apigateway";
import {SqsEventSource} from "aws-cdk-lib/aws-lambda-event-sources";

interface MessageQueueServiceProps {
  handler: lambda.Function;
  requestTemplates: {
    [contentType: string]: string;
  };
}

export class MessageQueueService extends Construct {
  endpoint: string;

  constructor(scope: Construct, id: string, props: MessageQueueServiceProps) {
    super(scope, id);

    const {handler} = props;

    const api = new apigw.RestApi(this, "ApiGateway", {
      endpointTypes: [EndpointType.REGIONAL],
    });

    const integrationRole = new iam.Role(this, "IntegrationRole", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    });

    const dlq = new sqs.Queue(this, "DeadLetterQueue", {
      queueName: `${id}_DLQ`,
    });

    const queue = new sqs.Queue(this, "MainSqsQueue", {
      queueName: id,
      deadLetterQueue: {queue: dlq, maxReceiveCount: 2},
    });

    queue.grantSendMessages(integrationRole);

    const sendMessageIntegration = new apigw.AwsIntegration({
      service: "sqs",
      path: `${process.env.CDK_DEFAULT_ACCOUNT}/${queue.queueName}`,
      integrationHttpMethod: "POST",
      options: {
        credentialsRole: integrationRole,
        requestParameters: {
          "integration.request.header.Content-Type": `'application/x-www-form-urlencoded'`,
        },
        requestTemplates: props.requestTemplates,
        integrationResponses: [
          {
            statusCode: "200",
          },
          {
            statusCode: "400",
          },
          {
            statusCode: "500",
          },
        ],
      },
    });

    api.root.addMethod("POST", sendMessageIntegration, {
      methodResponses: [
        {
          statusCode: "200",
        },
        {
          statusCode: "400",
        },
        {
          statusCode: "500",
        },
      ],
    });

    const eventSource = new SqsEventSource(queue);
    handler.addEventSource(eventSource);

    this.endpoint = api.url;
  }
}
