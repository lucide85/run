import crypto from "node:crypto";
import axios, { AxiosInstance } from "axios";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import qs from "qs";
import OAuth from "oauth-1.0a";

/**
 * Frittstående Garmin SSO-innlogging MED to-faktor (MFA).
 *
 * Pakken `garmin-connect` (v1.6.2, nyeste) har MFA som en tom stubb og bruker ikke
 * cookie-jar, så den kan ikke logge inn på MFA-kontoer. Vi replikerer derfor SSO-flyten
 * (samme som python-biblioteket `garth`): logg inn → ev. MFA-kode → hent OAuth1-ticket →
 * bytt til OAuth1/OAuth2-tokens. Tokenene mates tilbake i garmin-connect via `loadToken`,
 * så all øvrig synk-kode er uendret.
 */

const SSO_ORIGIN = "https://sso.garmin.com";
const SSO = `${SSO_ORIGIN}/sso`;
const EMBED = `${SSO}/embed`;
const SIGNIN = `${SSO}/signin`;
const MFA_VERIFY = `${SSO}/verifyMFA/loginEnterMfaCode`;
const GC_MODERN = "https://connect.garmin.com/modern";
const OAUTH_URL = "https://connectapi.garmin.com/oauth-service/oauth";
const OAUTH_CONSUMER_URL = "https://thegarth.s3.amazonaws.com/oauth_consumer.json";

const UA_BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36";
const UA_MOBILE = "com.garmin.android.apps.connectmobile";

const SIGNIN_PARAMS = {
  id: "gauth-widget",
  embedWidget: true,
  clientId: "GarminConnect",
  locale: "en",
  gauthHost: EMBED,
  service: EMBED,
  source: EMBED,
  redirectAfterAccountLoginUrl: EMBED,
  redirectAfterAccountCreationUrl: EMBED,
};

const CSRF_RE = /name="_csrf"\s+value="(.+?)"/;
const TICKET_RE = /ticket=([^"]+)"/;
const TITLE_RE = /<title>([^<]*)<\/title>/;
const ACCOUNT_LOCKED_RE = /var\s+status\s*=\s*"([^"]*)"/;

export interface GarminTokens {
  oauth1: Record<string, string>;
  oauth2: Record<string, unknown>;
}

interface Consumer {
  key: string;
  secret: string;
}

/** Mellomtilstand som holdes i minnet mellom passord-steget og MFA-koden. */
export interface PendingMfa {
  client: AxiosInstance;
  consumer: Consumer;
  csrf: string;
  createdAt: number;
}

function newClient(): AxiosInstance {
  const jar = new CookieJar();
  return wrapper(
    axios.create({
      jar,
      withCredentials: true,
      maxRedirects: 10,
      timeout: 30_000,
      headers: { "User-Agent": UA_BROWSER },
    })
  );
}

async function fetchConsumer(): Promise<Consumer> {
  const r = await axios.get(OAUTH_CONSUMER_URL, { timeout: 30_000 });
  return { key: r.data.consumer_key, secret: r.data.consumer_secret };
}

function ticketOf(html: string): string | null {
  const m = TICKET_RE.exec(html);
  return m ? m[1] : null;
}

function csrfOf(html: string): string | null {
  const m = CSRF_RE.exec(html);
  return m ? m[1] : null;
}

function assertNotBlocked(html: string): void {
  const locked = ACCOUNT_LOCKED_RE.exec(html);
  if (locked && /locked/i.test(locked[1])) {
    throw new Error("Garmin-kontoen er låst. Lås den opp på connect.garmin.com og prøv igjen.");
  }
  const title = TITLE_RE.exec(html)?.[1] ?? "";
  if (/Update Phone Number/i.test(title)) {
    throw new Error("Garmin krever oppdatert telefonnummer. Logg inn på connect.garmin.com én gang først.");
  }
}

/** Hent CSRF-token fra innloggingssiden (etter å ha satt nødvendige cookies). */
async function primeCsrf(client: AxiosInstance): Promise<string> {
  await client.get(
    `${EMBED}?${qs.stringify({ clientId: "GarminConnect", locale: "en", service: GC_MODERN })}`
  );
  const r = await client.get(
    `${SIGNIN}?${qs.stringify({ id: "gauth-widget", embedWidget: true, locale: "en", gauthHost: EMBED })}`
  );
  const csrf = csrfOf(r.data);
  if (!csrf) throw new Error("Fant ikke CSRF-token – Garmin kan ha endret innloggingssiden.");
  return csrf;
}

function oauthClient(consumer: Consumer): OAuth {
  return new OAuth({
    consumer,
    signature_method: "HMAC-SHA1",
    hash_function(base: string, key: string) {
      return crypto.createHmac("sha1", key).update(base).digest("base64");
    },
  });
}

/** Bytt SSO-ticket mot OAuth1- og OAuth2-tokens (siste steg, likt for MFA og ikke-MFA). */
async function finishWithTicket(consumer: Consumer, ticket: string): Promise<GarminTokens> {
  const oauth = oauthClient(consumer);

  // Steg: OAuth1 preauthorized
  const preUrl = `${OAUTH_URL}/preauthorized?${qs.stringify({
    ticket,
    "login-url": EMBED,
    "accepts-mfa-tokens": true,
  })}`;
  const preHeaders = oauth.toHeader(oauth.authorize({ url: preUrl, method: "GET" }));
  const preResp = await axios.get(preUrl, {
    headers: { ...preHeaders, "User-Agent": UA_MOBILE },
    timeout: 30_000,
  });
  const oauth1 = qs.parse(preResp.data as string) as Record<string, string>;
  if (!oauth1.oauth_token || !oauth1.oauth_token_secret) {
    throw new Error("Klarte ikke hente OAuth1-token fra Garmin.");
  }

  // Steg: bytt til OAuth2
  const exchUrl = `${OAUTH_URL}/exchange/user/2.0`;
  const token = { key: oauth1.oauth_token, secret: oauth1.oauth_token_secret };
  const authData = oauth.authorize({ url: exchUrl, method: "POST", data: null as any }, token);
  const exchResp = await axios.post(`${exchUrl}?${qs.stringify(authData)}`, null, {
    headers: { "User-Agent": UA_MOBILE, "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 30_000,
  });
  const oauth2 = exchResp.data as Record<string, number>;
  const now = Math.floor(Date.now() / 1000);
  oauth2.expires_at = now + Number(oauth2.expires_in ?? 0);
  oauth2.refresh_token_expires_at = now + Number(oauth2.refresh_token_expires_in ?? 0);

  return { oauth1, oauth2: oauth2 as Record<string, unknown> };
}

export type StartLoginResult =
  | { status: "ok"; tokens: GarminTokens }
  | { status: "mfa"; pending: PendingMfa };

/**
 * Start innlogging med e-post + passord. Returnerer ferdige tokens, eller en
 * `pending`-tilstand hvis kontoen krever en MFA-kode (kall da `submitGarminMfa`).
 */
export async function startGarminLogin(email: string, password: string): Promise<StartLoginResult> {
  const consumer = await fetchConsumer();
  const client = newClient();
  const csrf = await primeCsrf(client);

  const url = `${SIGNIN}?${qs.stringify(SIGNIN_PARAMS)}`;
  const form = qs.stringify({ username: email, password, embed: "true", _csrf: csrf });
  const resp = await client.post(url, form, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: SSO_ORIGIN,
      Referer: SIGNIN,
      "User-Agent": UA_BROWSER,
    },
    validateStatus: () => true,
  });
  const html: string = resp.data ?? "";
  assertNotBlocked(html);

  const ticket = ticketOf(html);
  if (ticket) {
    return { status: "ok", tokens: await finishWithTicket(consumer, ticket) };
  }

  const finalUrl: string = (resp.request?.res?.responseUrl as string) ?? "";
  if (/verifyMFA|mfa-code|loginEnterMfaCode/i.test(html) || /verifyMFA/i.test(finalUrl)) {
    return {
      status: "mfa",
      pending: { client, consumer, csrf: csrfOf(html) ?? csrf, createdAt: Date.now() },
    };
  }

  throw new Error("Innlogging mot Garmin feilet – sjekk e-post og passord.");
}

/** Fullfør innlogging ved å sende inn MFA-koden brukeren mottok. */
export async function submitGarminMfa(pending: PendingMfa, code: string): Promise<GarminTokens> {
  const url = `${MFA_VERIFY}?${qs.stringify(SIGNIN_PARAMS)}`;
  const form = qs.stringify({
    "mfa-code": code.trim(),
    embed: "true",
    _csrf: pending.csrf,
    fromPage: "setupEnterMfaCode",
  });
  const resp = await pending.client.post(url, form, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: SSO_ORIGIN,
      Referer: MFA_VERIFY,
      "User-Agent": UA_BROWSER,
    },
    validateStatus: () => true,
  });
  const html: string = resp.data ?? "";
  assertNotBlocked(html);

  const ticket = ticketOf(html);
  if (!ticket) {
    throw new Error("Feil eller utløpt sikkerhetskode. Be om en ny kode og prøv på nytt.");
  }
  return finishWithTicket(pending.consumer, ticket);
}
