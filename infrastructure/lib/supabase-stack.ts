import * as cdk from "aws-cdk-lib";
import {aws_eks as eks, aws_elasticloadbalancingv2 as elbv2} from "aws-cdk-lib";
import {Construct} from "constructs";
import {SupabaseSecrets} from "./services/supabase/secrets/supabase-secrets";
import {Routing} from "./services/routing";
import {K8Cluster} from "./constructs/k8-cluster";
import {S3WithCreds} from "./constructs/s3-with-creds";
import path = require("path");
import {SupabaseCdn} from "./services/cdn/supabase-cdn";
import {EbsCsiAddon} from "./constructs/ebs-csi-addon";

export class SupabaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /** Initail Variables For The Stack */
    const domain = process.env.DOMAIN;
    const studioUser = process.env.DASHBOARD_USER ?? "admin";
    const studioPass = process.env.DASHBOARD_PASS ?? "admin";
    const ingressAlbArn = process.env.INGRESS_ALB_ARN;

    if (domain === undefined) throw Error("Provide Valid DOMAIN env variable");

    const routing = new Routing(this, "Routing", {domain});

    const {anonKey, serviceKey, jwtSecret} = new SupabaseSecrets(
      this,
      "SupabaseSecrets"
    );

    const walgStorage = new S3WithCreds(this, "WalgStorage");

    const supabaseStorage = new S3WithCreds(this, "SupabaseStorage");

    const k8 = new K8Cluster(this, "IntellectaK8", {enableNatGateway: true});

    k8.cluster.addHelmChart("cnpg", {
      chart: "cloudnative-pg",
      repository: "https://cloudnative-pg.github.io/charts",
      namespace: "cnpg-system",
      createNamespace: true,
    });

    k8.cluster.addHelmChart("metrics-server", {
      chart: "metrics-server",
      repository: "https://kubernetes-sigs.github.io/metrics-server",
      namespace: "kube-system",
      createNamespace: true,
    });

    new EbsCsiAddon(this, "EbsCsiAddonWithPerimission", {
      cluster: k8.cluster,
    });

    if (ingressAlbArn) {
      const origin = elbv2.ApplicationLoadBalancer.fromLookup(
        this,
        "IngressAlb",
        {
          loadBalancerArn: ingressAlbArn,
        }
      );

      const loadBalancerDnsName = new eks.KubernetesObjectValue(
        this,
        "AlbDnsName",
        {
          cluster: k8.cluster,
          objectName: "kong-ingress",
          objectType: "Ingress",
          jsonPath: ".status.loadBalancer.ingress[0].hostname",
        }
      );

      /** Supabase CDN  */
      const cdn = new SupabaseCdn(this, "SupabaseCdn", {
        routing,
        origin,
      });

      // /** Setup Smart Cache */
      const cacheManager = cdn.addCacheManager();

      /** Install Supabase Helm Charts */
      k8.cluster.addHelmChart("Supabase", {
        release: "supabase",
        values: {
          secrets: {
            jwt: {
              anonKey,
              serviceKey,
              secret: jwtSecret,
            },
            dashboard: {
              username: studioUser,
              password: studioPass,
            },
            analytics: {
              apiKey: "your-super-secret-and-long-logflare-key",
            },
            walg: {
              accessKeyId: walgStorage.ACCESS_KEY_ID,
              secretAccessKey: walgStorage.ACCESS_KEY_SECRET,
            },
          },
          /** Storage */
          storage: {
            env: {
              GLOBAL_S3_BUCKET: supabaseStorage.bucket.bucketName,
              AWS_ACCESS_KEY_ID: supabaseStorage.ACCESS_KEY_ID,
              AWS_SECRET_ACCESS_KEY: supabaseStorage.ACCESS_KEY_SECRET,
              /** SMART CDN */
              WEBHOOK_URL: cacheManager.url,
              WEBHOOK_API_KEY: cacheManager.apiKey,
            },
          },
        },
        chartAsset: new cdk.aws_s3_assets.Asset(this, "SupabaseChartAssets", {
          path: path.resolve(__dirname, "../../k8"),
        }),
      });
    }
  }
}
