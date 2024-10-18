import {CfnOutput, aws_iam as iam} from "aws-cdk-lib";
import {Construct} from "constructs";

export class UserWithCreds extends Construct {
  user: iam.User;
  accessKey: iam.AccessKey;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.user = new iam.User(this, "User");
    this.accessKey = new iam.AccessKey(this, "AccessKey", {
      user: this.user,
    });

    new CfnOutput(this, `${id}-ACCESS-KEY`, {
      value: this.accessKey.accessKeyId,
    });
    new CfnOutput(this, `${id}-SECRET-ACCESS-KEY`, {
      value: this.accessKey.secretAccessKey.unsafeUnwrap(),
    });
  }
}
