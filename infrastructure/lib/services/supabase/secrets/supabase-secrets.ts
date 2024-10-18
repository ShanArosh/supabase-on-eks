import {CfnOutput, CustomResource, Duration} from "aws-cdk-lib";
import {Runtime} from "aws-cdk-lib/aws-lambda";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {RetentionDays} from "aws-cdk-lib/aws-logs";
import {Provider} from "aws-cdk-lib/custom-resources";
import {Construct} from "constructs";
import path = require("node:path");

export class SupabaseSecrets extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new CfnOutput(this, "SUPABASE_JWT_SECRET", {
      value: this.jwtSecret,
    });

    new CfnOutput(this, "SUPABASE_ANON_KEY", {
      value: this.anonKey,
    });

    new CfnOutput(this, "SUPABASE_SERVICE_KEY", {
      value: this.serviceKey,
    });
  }

  readonly onEventHandlerFunction = new NodejsFunction(
    this,
    "CustomResourceOnEventHandlerFunction",
    {
      timeout: Duration.seconds(30),
      runtime: Runtime.NODEJS_20_X,
      entry: path.resolve(__dirname, "./cr-supabase-secrets.ts"),
    }
  );

  readonly customResourceProvider = new Provider(
    this,
    "CustomResourceProvider",
    {
      onEventHandler: this.onEventHandlerFunction,
      logRetention: RetentionDays.ONE_DAY,
    }
  );

  readonly resource = new CustomResource(this, "SupabaseSecretsCR", {
    serviceToken: this.customResourceProvider.serviceToken,
    resourceType: "Custom::SupabaseSecrets",
  });

  readonly jwtSecret = this.resource.getAttString("JWT_SECRET");
  readonly anonKey = this.resource.getAttString("ANON_KEY");
  readonly serviceKey = this.resource.getAttString("SERVICE_KEY");
}
