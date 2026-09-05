/**
 * MedIntel AI – Centralized AWS Cognito User Pool Auth Module
 * Amazon Cognito is the SOLE authentication authority.
 * NO local database password validation or fallback.
 */

import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";

export function getCognitoConfig() {
  const userPoolId = (process.env.COGNITO_USER_POOL_ID || "").trim();
  const clientId = (process.env.COGNITO_CLIENT_ID || "").trim();
  const region = (process.env.COGNITO_REGION || "us-east-1").trim();

  const isConfigured = Boolean(userPoolId && clientId);

  return { userPoolId, clientId, region, isConfigured };
}

function getCognitoClient() {
  const { region } = getCognitoConfig();
  return new CognitoIdentityProviderClient({ region });
}

let jwtVerifierInstance = null;
function getJwtVerifier() {
  const { userPoolId, clientId, isConfigured } = getCognitoConfig();
  if (!isConfigured) return null;

  if (!jwtVerifierInstance) {
    jwtVerifierInstance = CognitoJwtVerifier.create({
      userPoolId,
      clientId,
      tokenUse: "id",
    });
  }
  return jwtVerifierInstance;
}

/**
 * Registers a new user into Amazon Cognito User Pool
 */
export async function signUpUser(email, password, fullName, gender = "Prefer not to say") {
  const { clientId, isConfigured } = getCognitoConfig();
  if (!isConfigured) {
    throw new Error(
      "Cognito Authentication is not configured. Please set COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, and COGNITO_REGION in .env."
    );
  }

  const client = getCognitoClient();
  const cleanEmail = email.toLowerCase().trim();

  const command = new SignUpCommand({
    ClientId: clientId,
    Username: cleanEmail,
    Password: password,
    UserAttributes: [
      { Name: "email", Value: cleanEmail },
      { Name: "name", Value: fullName.trim() },
      { Name: "gender", Value: gender },
    ],
  });

  const response = await client.send(command);
  return {
    userSub: response.UserSub,
    userConfirmed: response.UserConfirmed,
    codeDeliveryDetails: response.CodeDeliveryDetails,
  };
}

/**
 * Confirms user email with the 6-digit confirmation code from Cognito
 */
export async function confirmSignUpUser(email, code) {
  const { clientId, isConfigured } = getCognitoConfig();
  if (!isConfigured) {
    throw new Error("Cognito Authentication is not configured.");
  }

  const client = getCognitoClient();
  const command = new ConfirmSignUpCommand({
    ClientId: clientId,
    Username: email.toLowerCase().trim(),
    ConfirmationCode: code.trim(),
  });

  await client.send(command);
  return { success: true };
}

/**
 * Authenticates user via Cognito USER_PASSWORD_AUTH flow
 */
export async function authenticateUser(email, password) {
  const { clientId, isConfigured } = getCognitoConfig();
  if (!isConfigured) {
    throw new Error(
      "Cognito Authentication is not configured. Please set COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, and COGNITO_REGION in .env."
    );
  }

  const client = getCognitoClient();
  const cleanEmail = email.toLowerCase().trim();

  const command = new InitiateAuthCommand({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: clientId,
    AuthParameters: {
      USERNAME: cleanEmail,
      PASSWORD: password,
    },
  });

  const response = await client.send(command);
  const authResult = response.AuthenticationResult;

  if (!authResult || !authResult.IdToken) {
    throw new Error("Cognito authentication failed to return session tokens.");
  }

  // Retrieve user details from Cognito
  const getUserCommand = new GetUserCommand({ AccessToken: authResult.AccessToken });
  const userData = await client.send(getUserCommand);

  const attributes = {};
  for (const attr of userData.UserAttributes || []) {
    attributes[attr.Name] = attr.Value;
  }

  return {
    idToken: authResult.IdToken,
    accessToken: authResult.AccessToken,
    refreshToken: authResult.RefreshToken,
    userSub: attributes.sub || userData.Username,
    email: attributes.email || cleanEmail,
    fullName: attributes.name || attributes.email || "Patient",
    gender: attributes.gender || "Male",
  };
}

/**
 * Requests a password reset verification code from Cognito
 */
export async function forgotPasswordUser(email) {
  const { clientId, isConfigured } = getCognitoConfig();
  if (!isConfigured) {
    throw new Error("Cognito Authentication is not configured.");
  }

  const client = getCognitoClient();
  const command = new ForgotPasswordCommand({
    ClientId: clientId,
    Username: email.toLowerCase().trim(),
  });

  const response = await client.send(command);
  return { codeDeliveryDetails: response.CodeDeliveryDetails };
}

/**
 * Resets user password using the verification code from Cognito
 */
export async function confirmForgotPasswordUser(email, code, newPassword) {
  const { clientId, isConfigured } = getCognitoConfig();
  if (!isConfigured) {
    throw new Error("Cognito Authentication is not configured.");
  }

  const client = getCognitoClient();
  const command = new ConfirmForgotPasswordCommand({
    ClientId: clientId,
    Username: email.toLowerCase().trim(),
    ConfirmationCode: code.trim(),
    Password: newPassword,
  });

  await client.send(command);
  return { success: true };
}

/**
 * Verifies Cognito ID Token signature and claims via JWKS
 */
export async function verifyCognitoToken(idToken) {
  const verifier = getJwtVerifier();
  if (!verifier) {
    throw new Error("Cognito verifier is not configured.");
  }

  try {
    const payload = await verifier.verify(idToken);
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name || payload.email,
      email_verified: payload.email_verified,
    };
  } catch (err) {
    throw new Error(`Invalid Cognito session token: ${err.message}`);
  }
}
