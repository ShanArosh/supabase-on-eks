import {
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceResponse,
  CloudFormationCustomResourceUpdateEvent,
} from "aws-lambda";
import {sign} from "jsonwebtoken";
import {randomBytes} from "node:crypto";

/** Define a year in milliseconds */
const YEAR = 365 * 24 * 60 * 60 * 1000;

/** Generates a Random Secret */
const generateSecret = () => randomBytes(20).toString("hex");

/** Generates a JsonWebToken */
const generateToken = async (
  role: "anon" | "service_role",
  jwtSecret: string
) => {
  const payload = {
    role,
    iss: "supabase",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() + (5 * YEAR) / 1000),
  };
  const token = sign(payload, jwtSecret);
  return token;
};

export const handler = async (
  event: CloudFormationCustomResourceEvent
): Promise<Partial<CloudFormationCustomResourceResponse>> => {
  switch (event.RequestType) {
    case "Create":
      const jwtSecret = generateSecret();
      const anonKey = await generateToken("anon", jwtSecret);
      const serviceKey = await generateToken("anon", jwtSecret);
      return {
        Data: {
          JWT_SECRET: jwtSecret,
          ANON_KEY: anonKey,
          SERVICE_KEY: serviceKey,
        },
      };
    case "Update":
      return {};
    case "Delete":
      return {};
  }
};
