enum CaptchaProvider {
    ALTCHA = "altcha",
    TURNSTILE = "turnstile",
    HCAPTCHA = "hcaptcha"
}

// Stable action assigned to the analysis-session surface. Turnstile renders
// the widget with it and the server rejects tokens for any other action.
export const CAPTCHA_ACTION = "analysis_session";

export type TurnstileAppearance = "always" | "execute" | "interaction-only";

export default CaptchaProvider;
