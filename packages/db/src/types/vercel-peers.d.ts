declare module "@vercel/oidc-aws-credentials-provider" {
  import type { AwsCredentialIdentityProvider } from "@smithy/types";

  export function awsCredentialsProvider(opts: {
    roleArn: string;
    clientConfig?: { region?: string };
  }): AwsCredentialIdentityProvider;
}

declare module "@vercel/functions" {
  import type { Pool } from "pg";

  export function attachDatabasePool(pool: Pool): void;
}
