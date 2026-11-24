import CaptchaProvider, {
    CAPTCHA_ACTION,
    TurnstileAppearance
} from "shared/constants/CaptchaProvider";

const TURNSTILE_VERIFY_URL =
    "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const HCAPTCHA_VERIFY_URL = "https://api.hcaptcha.com/siteverify";

const APPEARANCES: TurnstileAppearance[] = [
    "always", "execute", "interaction-only"
];

export function getCaptchaProvider(): CaptchaProvider {
    const configured = (process.env.CAPTCHA_PROVIDER || "").trim().toLowerCase();

    if (configured === CaptchaProvider.ALTCHA) return CaptchaProvider.ALTCHA;
    if (configured === CaptchaProvider.HCAPTCHA) return CaptchaProvider.HCAPTCHA;

    return CaptchaProvider.TURNSTILE;
}

export function getTurnstileSiteKey(): string {
    return (process.env.TURNSTILE_SITE_KEY || "").trim();
}

export function getTurnstileAppearance(): TurnstileAppearance {
    const configured = (
        process.env.TURNSTILE_APPEARANCE || "interaction-only"
    ).trim().toLowerCase() as TurnstileAppearance;

    return APPEARANCES.includes(configured)
        ? configured
        : "interaction-only";
}

export function getHcaptchaSiteKey(): string {
    return (process.env.HCAPTCHA_SITE_KEY || "").trim();
}

function getExpectedHostnames(provider: CaptchaProvider): Set<string> {
    // One hostname list can cover both hosted providers; a provider-specific
    // list overrides it when their widgets are registered on different domains.
    const configured = provider == CaptchaProvider.HCAPTCHA
        ? (process.env.HCAPTCHA_HOSTNAMES || process.env.TURNSTILE_HOSTNAMES || "")
        : (process.env.TURNSTILE_HOSTNAMES || "");

    return new Set(
        configured
            .split(",")
            .map(hostname => hostname.trim().toLowerCase())
            .filter(Boolean)
    );
}

interface VerifyResult {
    success?: boolean;
    action?: string;
    hostname?: string;
}

async function siteverify(
    url: string,
    params: Record<string, string>
): Promise<VerifyResult | undefined> {
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            signal: AbortSignal.timeout(10_000),
            body: new URLSearchParams(params)
        });

        if (!response.ok) return undefined;

        return await response.json();
    } catch {
        return undefined;
    }
}

function hostnameAllowed(result: VerifyResult, allowed: Set<string>): boolean {
    // hCaptcha can legitimately answer "not-provided" under heavy challenge
    // traffic; its docs say hostname is informational, not an auth signal.
    if (typeof result.hostname != "string") return false;
    if (result.hostname == "not-provided") return true;

    return allowed.has(result.hostname.toLowerCase());
}

/**
 * Canonical Turnstile siteverify. Fails closed: no secret, no configured
 * hostnames, a malformed token, a network error or any mismatch all reject.
 * Never called from the browser - the client only ever sees the widget token.
 */
export async function verifyTurnstile(
    token: string,
    remoteIp?: string
): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET;
    const hostnames = getExpectedHostnames(CaptchaProvider.TURNSTILE);

    if (
        !secret
        || typeof token != "string"
        || token.length == 0
        || token.length > 2048
        || hostnames.size == 0
    ) return false;

    const result = await siteverify(TURNSTILE_VERIFY_URL, {
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {})
    });

    if (!result) return false;

    return result.success === true
        && result.action === CAPTCHA_ACTION
        && hostnameAllowed(result, hostnames);
}

/** hCaptcha siteverify, mirroring the Turnstile flow with its own keys. */
export async function verifyHcaptcha(
    token: string,
    remoteIp?: string
): Promise<boolean> {
    const secret = process.env.HCAPTCHA_SECRET;
    const siteKey = getHcaptchaSiteKey();
    const hostnames = getExpectedHostnames(CaptchaProvider.HCAPTCHA);

    if (
        !secret
        || !siteKey
        || typeof token != "string"
        || token.length == 0
        || token.length > 2048
        || hostnames.size == 0
    ) return false;

    const result = await siteverify(HCAPTCHA_VERIFY_URL, {
        secret,
        response: token,
        sitekey: siteKey,
        ...(remoteIp ? { remoteip: remoteIp } : {})
    });

    return !!result
        && result.success === true
        && hostnameAllowed(result, hostnames);
}
