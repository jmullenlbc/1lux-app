// The pass a visitor gets after the share gate (0137). One cookie per link,
// signed, holding only which link and which visitor. Never the email itself.
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { jwtSecretKey } from '../jwtSecret';

const AUD = 'sales-docs';
export const PASS_DAYS = 30;

export const passCookieName = (linkId) => `sd_${linkId}`;

export async function signPass({ linkId, visitorId }) {
  return new SignJWT({ linkId, visitorId })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime(`${PASS_DAYS}d`)
    .sign(jwtSecretKey());
}

export async function verifyPass(token, linkId) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecretKey(), { audience: AUD });
    if (payload.linkId !== linkId || !payload.visitorId) return null;
    return { linkId: payload.linkId, visitorId: payload.visitorId };
  } catch {
    return null;
  }
}

/** The pass for this link from the request cookies, or null. */
export async function readPass(linkId) {
  return verifyPass(cookies().get(passCookieName(linkId))?.value, linkId);
}

export function setPass(response, linkId, token) {
  response.cookies.set(passCookieName(linkId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: PASS_DAYS * 24 * 60 * 60,
  });
  return response;
}
