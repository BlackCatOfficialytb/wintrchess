import CaptchaProvider, {
    TurnstileAppearance
} from "../constants/CaptchaProvider";

// Shape of GET /auth/captcha. The server decides which provider is active;
// the client only branches on `provider`, it never picks one itself.
export type CaptchaConfig =
    | {
        provider: CaptchaProvider.ALTCHA;
        algorithm: "SHA-1" | "SHA-256" | "SHA-512";
        challenge: string;
        maxnumber: number;
        salt: string;
        signature: string;
    }
    | {
        provider: CaptchaProvider.TURNSTILE;
        siteKey: string;
        action: string;
        // "interaction-only" keeps the managed widget invisible until a
        // challenge is actually required, so it can still be interactive.
        appearance: TurnstileAppearance;
    }
    | {
        provider: CaptchaProvider.HCAPTCHA;
        siteKey: string;
        action: string;
    };

// Turnstile/hCaptcha tokens arrive from their widgets; ALTCHA posts its
// solution as the flat payload shape kept for backwards compatibility.
export type CaptchaSolution =
    | { provider: CaptchaProvider.TURNSTILE; token: string }
    | { provider: CaptchaProvider.HCAPTCHA; token: string }
    | {
        provider?: CaptchaProvider.ALTCHA;
        algorithm: "SHA-1" | "SHA-256" | "SHA-512";
        challenge: string;
        number: number;
        salt: string;
        signature: string;
    };
