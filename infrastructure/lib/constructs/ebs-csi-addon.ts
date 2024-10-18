import {aws_iam as iam, aws_eks as eks, CfnJson, Fn} from "aws-cdk-lib";
import {Construct} from "constructs";

export interface EbsCsiAddonProps {
  cluster: eks.Cluster;
}

export class EbsCsiAddon extends Construct {
  constructor(scope: Construct, id: string, props: EbsCsiAddonProps) {
    super(scope, id);
    const {cluster} = props;

    const role = new iam.Role(this, "EbsCsiAddonRole", {
      roleName: `${id}-EbsCsiAddonRole`,
      assumedBy: new iam.FederatedPrincipal(
        cluster.openIdConnectProvider.openIdConnectProviderArn,
        {
          StringEquals: new CfnJson(this, "OcidString", {
            value: {
              [Fn.select(
                1,
                Fn.split("//", cluster.clusterOpenIdConnectIssuerUrl)
              ) + ":sub"]:
                "system:serviceaccount:kube-system:ebs-csi-controller-sa",
              [Fn.select(
                1,
                Fn.split("//", cluster.clusterOpenIdConnectIssuerUrl)
              ) + ":aud"]: "sts.amazonaws.com",
            },
          }),
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonEbsCsiDriverPolicy"
      )
    );

    new eks.CfnAddon(this, "CfnAddonEbsCsi", {
      addonName: "aws-ebs-csi-driver",
      clusterName: cluster.clusterName,
      serviceAccountRoleArn: role.roleArn,
      // resolveConflicts: "OVERWRITE",
      // addonVersion:'v1.20.0-eksbuild.1',
    });

    /** Add Storage Class */
    cluster.addManifest("gp3StorageClass", {
      kind: "StorageClass",
      apiVersion: "storage.k8s.io/v1",
      metadata: {
        name: "gp3",
      },
      allowVolumeExpansion: true,
      provisioner: "ebs.csi.aws.com",
      volumeBindingMode: "WaitForFirstConsumer",
      parameters: {
        type: "gp3",
      },
    });
  }
}
