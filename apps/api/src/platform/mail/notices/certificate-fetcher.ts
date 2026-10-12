import { Injectable } from "@nestjs/common";

/** SNS certificate fetch and subscription confirmation timeout (contracts/configuration.md, constants). */
export const SNS_FETCH_TIMEOUT_MS = 5_000;

/** The largest certificate we read. */
const MAX_CERTIFICATE_BYTES = 16 * 1024;

/** Only SNS's own hosts, over https (research N6): `https://sns.{region}.amazonaws.com/…`. */
const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com$/;

/** Whether `url` is an https URL on an SNS host; checked before anything is fetched. */
export function isSnsUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port && SNS_HOST.test(parsed.hostname);
}

/**
 * The network side of SNS (research N6, N14): the signing certificate, cached by URL, and the
 * confirmation of a subscription. Both refuse anything but an SNS host over https, whoever calls
 * them. Tests replace it to serve a self-signed certificate under the real host.
 */
@Injectable()
export class CertificateFetcher {
  private readonly cache = new Map<string, Promise<string>>();

  /** The PEM at `url`; a failed fetch is not cached. */
  fetchCertificate(url: string): Promise<string> {
    if (!isSnsUrl(url)) return Promise.reject(new Error("not an SNS certificate URL"));
    const cached = this.cache.get(url);
    if (cached) return cached;
    const pending = this.get(url).then(async (response) => {
      const text = await response.text();
      if (text.length > MAX_CERTIFICATE_BYTES) throw new Error("certificate too large");
      return text;
    });
    pending.catch(() => this.cache.delete(url));
    this.cache.set(url, pending);
    return pending;
  }

  /** Confirms a subscription by fetching its `SubscribeURL`. */
  async confirmSubscription(url: string): Promise<void> {
    if (!isSnsUrl(url)) throw new Error("not an SNS subscription URL");
    await this.get(url);
  }

  private async get(url: string): Promise<Response> {
    const response = await fetch(url, { signal: AbortSignal.timeout(SNS_FETCH_TIMEOUT_MS), redirect: "error" });
    if (!response.ok) throw new Error(`SNS answered ${response.status}`);
    return response;
  }
}
