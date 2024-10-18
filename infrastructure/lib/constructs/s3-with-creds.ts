import {Construct} from "constructs";
import {CfnOutput, RemovalPolicy, aws_s3 as s3} from "aws-cdk-lib";
import {UserWithCreds} from "./user-with-creds";

export class S3WithCreds extends Construct {
  ACCESS_KEY_SECRET: string;
  ACCESS_KEY_ID: string;
  bucket: s3.Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, "BUCKET", {
      removalPolicy: RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const {user, accessKey} = new UserWithCreds(this, "UserWithCreds");
    this.bucket.grantReadWrite(user);

    this.ACCESS_KEY_ID = accessKey.accessKeyId;
    this.ACCESS_KEY_SECRET = accessKey.secretAccessKey.unsafeUnwrap();

    new CfnOutput(this, `${id}-DOMAIN-NAME`, {
      value: this.bucket.bucketDomainName,
    });
  }
}
