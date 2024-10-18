import {
  Aws,
  aws_elasticloadbalancingv2 as elb,
  aws_cloudfront as cf,
  aws_route53 as route53,
  Duration,
} from "aws-cdk-lib";
import {Construct} from "constructs";
import {Routing} from "../routing";
import {LoadBalancerV2Origin} from "aws-cdk-lib/aws-cloudfront-origins";
import {CacheManager} from "./cache-manager/manager";
import {CloudFrontTarget} from "aws-cdk-lib/aws-route53-targets";
import {Peer, Port, PrefixList} from "aws-cdk-lib/aws-ec2";

interface SupabaseCdnProps {
  routing: Routing;
  origin: elb.IApplicationLoadBalancer;
}

export class SupabaseCdn extends Construct {
  distribution: cf.Distribution;

  constructor(scope: Construct, id: string, props: SupabaseCdnProps) {
    super(scope, id);

    /** CloudFront Prefix List */
    const cfPrefixList = new PrefixList(this, "CloudFrontPrefixList", {
      prefixListName: "global.cloudfront.origin-facing",
    });

    // Allow only CloudFront to connect the load balancer.
    props.origin.connections.allowFrom(
      Peer.prefixList(cfPrefixList.prefixListId),
      Port.tcp(80),
      "CloudFront"
    );

    const origin = new LoadBalancerV2Origin(props.origin, {
      protocolPolicy: cf.OriginProtocolPolicy.HTTP_ONLY,
    });

    const cachePolicy = new cf.CachePolicy(this, "CachePolicy", {
      cachePolicyName: `${Aws.STACK_NAME}-CachePolicy-${Aws.REGION}`,
      comment: "Policy for Supabase API",
      minTtl: Duration.seconds(0),
      maxTtl: Duration.seconds(600),
      defaultTtl: Duration.seconds(1),
      headerBehavior: cf.CacheHeaderBehavior.allowList(
        "apikey",
        "authorization",
        "host"
      ),
      queryStringBehavior: cf.CacheQueryStringBehavior.all(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const responseHeadersPolicy = new cf.ResponseHeadersPolicy(
      this,
      "ResponseHeadersPolicy",
      {
        responseHeadersPolicyName: `${Aws.STACK_NAME}-ResponseHeadersPolicy-${Aws.REGION}`,
        comment: "Policy for Supabase API",
        customHeadersBehavior: {
          customHeaders: [
            {header: "server", value: "cloudfront", override: true},
          ],
        },
      }
    );

    const defaultBehavior: cf.BehaviorOptions = {
      origin,
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cf.AllowedMethods.ALLOW_ALL,
      cachePolicy,
      originRequestPolicy:
        cf.OriginRequestPolicy.ALL_VIEWER_AND_CLOUDFRONT_2022,
      responseHeadersPolicy,
    };

    const publicCachePolicy = new cf.CachePolicy(this, "PublicCachePolicy", {
      cachePolicyName: `${Aws.STACK_NAME}-PublicCachePolicy-${Aws.REGION}`,
      comment: "Policy for Supabase Public Content",
      queryStringBehavior: cf.CacheQueryStringBehavior.all(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const publicContentBehavior: cf.BehaviorOptions = {
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cf.AllowedMethods.ALLOW_GET_HEAD,
      cachePolicy: publicCachePolicy,
      originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER,
      responseHeadersPolicy,
      origin,
    };

    this.distribution = new cf.Distribution(this, "Distribution", {
      comment: `Supabase - CDN (${this.node.path}/Distribution)`,
      defaultBehavior,
      domainNames: Object.values(props.routing.domainMap),
      certificate: props.routing.certificate,
      additionalBehaviors: {
        "storage/v1/object/public/*": publicContentBehavior,
        "storage/v1/upload/resumable/*": {
          ...defaultBehavior,
          viewerProtocolPolicy: cf.ViewerProtocolPolicy.ALLOW_ALL,
        },
      },
    });

    new route53.ARecord(this, "SupabaseRecord", {
      target: route53.RecordTarget.fromAlias(
        new CloudFrontTarget(this.distribution)
      ),
      zone: props.routing.hostedZone,
      deleteExisting: true,
      recordName: props.routing.domainMap.supabase.split(".")[0],
    });
  }

  addCacheManager() {
    return new CacheManager(this, "CacheManager", {
      distribution: this.distribution,
    });
  }
}
