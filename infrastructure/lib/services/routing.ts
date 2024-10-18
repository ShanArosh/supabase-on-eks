import {Construct} from "constructs";
import {
  aws_certificatemanager as acm,
  aws_route53 as route53,
} from "aws-cdk-lib";
import {CertificateValidation} from "aws-cdk-lib/aws-certificatemanager";

interface RoutingProps {
  domain: string;
}

export class Routing extends Construct {
  constructor(scope: Construct, id: string, private props: RoutingProps) {
    super(scope, id);
  }

  readonly hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
    domainName: this.props.domain,
  });

  readonly domainMap = {
    supabase: `sb.${this.hostedZone.zoneName}`,
  };

  readonly certificate = new acm.Certificate(this, "DomainCert", {
    domainName: `*.${this.hostedZone.zoneName}`,
    validation: CertificateValidation.fromDns(this.hostedZone),
  });
}
