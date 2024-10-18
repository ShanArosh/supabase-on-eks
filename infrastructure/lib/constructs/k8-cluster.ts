import {aws_iam as iam, aws_ec2 as ec2, aws_eks as eks} from "aws-cdk-lib";
import {SubnetType} from "aws-cdk-lib/aws-ec2";
import {KubectlV30Layer} from "@aws-cdk/lambda-layer-kubectl-v30";
import {Construct} from "constructs";
import {KubectlLayer} from "aws-cdk-lib/lambda-layer-kubectl";

interface K8ClusterProps {
  enableNatGateway?: boolean;
}

export class K8Cluster extends Construct {
  cluster: eks.Cluster;

  constructor(scope: Construct, id: string, props?: K8ClusterProps) {
    super(scope, id);
    const enableNatGateway = props?.enableNatGateway ?? false;

    const vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: `${id}-vpc`,
      maxAzs: 2,
      natGateways: enableNatGateway ? undefined : 0,
      natGatewayProvider: ec2.NatProvider.instanceV2({
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T2,
          ec2.InstanceSize.MICRO
        ),
      }),
    });

    const mastersRole = new iam.Role(this, "MastersRole", {
      roleName: `${id}-admin-role`,
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("eks.amazonaws.com"),
        new iam.AnyPrincipal() // importent, else a SSO user can't assume
      ),
    });

    const adminAccessPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName(
      "AdministratorAccess"
    );

    mastersRole.addManagedPolicy(adminAccessPolicy);

    this.cluster = new eks.Cluster(this, "K8-Cluster", {
      vpc,
      clusterName: id,
      mastersRole,
      role: mastersRole,
      version: eks.KubernetesVersion.V1_30,
      kubectlLayer: new KubectlV30Layer(this, "KubectlLayer"),
      defaultCapacity: 2,
      defaultCapacityInstance: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MEDIUM
      ),
      albController: {
        version: eks.AlbControllerVersion.V2_8_2,
      },
    });

    this.cluster.awsAuth.addUserMapping(
      iam.User.fromUserArn(
        this,
        "RootUser",
        new iam.AccountRootPrincipal().arn
      ),
      {groups: ["system:masters"]}
    );

    mastersRole.grantAssumeRole(this.cluster.adminRole);
  }

  addTestIngress() {
    this.cluster.addManifest("TestIngress", {
      apiVersion: "networking.k8s.io/v1",
      kind: "Ingress",
      metadata: {
        name: "test-ingress",
        annotations: {
          "alb.ingress.kubernetes.io/group.name": "one-alb",
          "alb.ingress.kubernetes.io/scheme": "internet-facing", // internet-facing / internal
        },
      },
      spec: {
        ingressClassName: "alb",
        rules: [
          {
            host: "example.com",
            http: {
              paths: [
                {
                  path: "/",
                  pathType: "Prefix",
                  backend: {
                    service: {name: "test-service", port: {number: 80}},
                  },
                },
              ],
            },
          },
        ],
      },
    });
  }
}
