import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { solveChallenge } from "altcha-lib";
import { Challenge } from "altcha-lib/types";

import CaptchaProvider from "shared/constants/CaptchaProvider";
import { CaptchaConfig } from "shared/types/captcha";

import useAnalysisSessionStore from "@analysis/stores/AnalysisSessionStore";

const TURNSTILE_API = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const HCAPTCHA_API = "https://js.hcaptcha.com/1/api.js";
const WIDGET_TIMEOUT = 60_000;

type TurnstileConfig = Extract<CaptchaConfig, {
    provider: CaptchaProvider.TURNSTILE;
}>;
type HcaptchaConfig = Extract<CaptchaConfig, {
    provider: CaptchaProvider.HCAPTCHA;
}>;

class WidgetError extends Error {
    readonly kind: "load" | "verify";

    constructor(kind: "load" | "verify") {
        super(kind);
        this.kind = kind;
    }
}

let turnstileLoader: Promise<TurnstileWidget> | undefined;
let hcaptchaLoader: Promise<HcaptchaWidget> | undefined;

let turnstileWidgetId: string | undefined;
let hcaptchaWidgetId: string | undefined;

function loadSdk<T extends TurnstileWidget | HcaptchaWidget>(
    src: string,
    globalName: "turnstile" | "hcaptcha"
): Promise<T> {
    const existing = window[globalName] as T | undefined;
    if (existing) return Promise.resolve(existing);

    return new Promise<T>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => {
            const api = window[globalName] as T | undefined;
            if (api) resolve(api);
            else reject(new WidgetError("load"));
        };
        script.onerror = () => reject(new WidgetError("load"));
        document.head.appendChild(script);
    });
}

function getTurnstile(): Promise<TurnstileWidget> {
    if (!turnstileLoader) {
        turnstileLoader = loadSdk<TurnstileWidget>(
            `${TURNSTILE_API}?render=explicit`, "turnstile"
        ).catch(error => {
            turnstileLoader = undefined;
            throw error;
        });
    }

    return turnstileLoader;
}

function getHcaptcha(): Promise<HcaptchaWidget> {
    if (!hcaptchaLoader) {
        hcaptchaLoader = loadSdk<HcaptchaWidget>(
            `${HCAPTCHA_API}?render=explicit`, "hcaptcha"
        ).catch(error => {
            hcaptchaLoader = undefined;
            throw error;
        });
    }

    return hcaptchaLoader;
}

// Managed widgets can decide to show an interactive challenge at any time.
// Keep the container on-screen (not display:none) so that challenge is usable.
function getWidgetContainer(): HTMLElement {
    let container = document.getElementById("captcha-widget-container");

    if (!container) {
        container = document.createElement("div");
        container.id = "captcha-widget-container";
        Object.assign(container.style, {
            position: "fixed",
            right: "12px",
            bottom: "12px",
            zIndex: "2147483647"
        });
        document.body.appendChild(container);
    }

    return container;
}

function solveWithWidget<T extends TurnstileWidget | HcaptchaWidget>(
    load: () => Promise<T>,
    render: (api: T, container: HTMLElement, finish: (token?: string, error?: WidgetError) => void) => void
): Promise<string> {
    return load().then(api => new Promise<string>((resolve, reject) => {
        let settled = false;

        const finish = (token?: string, error?: WidgetError) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) reject(error);
            else resolve(token!);
        };

        const timer = setTimeout(
            () => finish(undefined, new WidgetError("verify")),
            WIDGET_TIMEOUT
        );

        try {
            render(api, getWidgetContainer(), finish);
        } catch {
            finish(undefined, new WidgetError("verify"));
        }
    }));
}

function solveTurnstile(config: TurnstileConfig): Promise<string> {
    return solveWithWidget(getTurnstile, (api, container, finish) => {
        if (turnstileWidgetId !== undefined) {
            api.remove(turnstileWidgetId);
            turnstileWidgetId = undefined;
        }

        const executeOnDemand = config.appearance == "execute";

        turnstileWidgetId = api.render(container, {
            sitekey: config.siteKey,
            action: config.action,
            appearance: config.appearance,
            execution: executeOnDemand ? "execute" : "render",
            callback: token => finish(token),
            "error-callback": () => finish(undefined, new WidgetError("verify")),
            "expired-callback": () => finish(undefined, new WidgetError("verify"))
        });

        if (executeOnDemand) {
            try {
                api.execute(turnstileWidgetId);
            } catch {
                finish(undefined, new WidgetError("verify"));
            }
        }
    });
}

function solveHcaptcha(config: HcaptchaConfig): Promise<string> {
    return solveWithWidget(getHcaptcha, (api, container, finish) => {
        if (hcaptchaWidgetId !== undefined) {
            api.remove(hcaptchaWidgetId);
            hcaptchaWidgetId = undefined;
        }

        // Invisible mode still surfaces a visual challenge when the risk
        // engine asks for one, so interaction remains possible.
        hcaptchaWidgetId = api.render(container, {
            sitekey: config.siteKey,
            action: config.action,
            size: "invisible",
            callback: token => finish(token),
            "error-callback": () => finish(undefined, new WidgetError("verify")),
            "expired-callback": () => finish(undefined, new WidgetError("verify"))
        });

        try {
            const execution = api.execute(hcaptchaWidgetId);
            if (execution) {
                execution.catch(() => finish(undefined, new WidgetError("verify")));
            }
        } catch {
            finish(undefined, new WidgetError("verify"));
        }
    });
}

function resetWidgets() {
    if (turnstileWidgetId !== undefined && window.turnstile) {
        window.turnstile.remove(turnstileWidgetId);
        turnstileWidgetId = undefined;
    }
    if (hcaptchaWidgetId !== undefined && window.hcaptcha) {
        window.hcaptcha.remove(hcaptchaWidgetId);
        hcaptchaWidgetId = undefined;
    }
}

export function useCaptcha() {
    const { t } = useTranslation("analysis");

    const {
        setAnalysisSessionToken,
        setAnalysisCaptchaError
    } = useAnalysisSessionStore();

    const fail = useCallback((key: string) => {
        setAnalysisCaptchaError(t(`progressReporter.${key}`));
    }, [t, setAnalysisCaptchaError]);

    return useCallback(async () => {
        try {
            const configResponse = await fetch("/auth/captcha");

            if (!configResponse.ok) {
                return fail("captchaUnknownError");
            }

            const config: CaptchaConfig = await configResponse.json();

            let solution: Record<string, unknown>;

            if (config.provider == CaptchaProvider.TURNSTILE) {
                solution = {
                    provider: config.provider,
                    token: await solveTurnstile(config)
                };
            } else if (config.provider == CaptchaProvider.HCAPTCHA) {
                solution = {
                    provider: config.provider,
                    token: await solveHcaptcha(config)
                };
            } else {
                const challengeData: Challenge = config as Challenge;

                const solved = await solveChallenge(
                    challengeData.challenge,
                    challengeData.salt,
                    challengeData.algorithm,
                    challengeData.maxnumber
                ).promise;

                if (!solved) return fail("captchaVerifyFailed");

                solution = {
                    provider: config.provider,
                    algorithm: challengeData.algorithm,
                    challenge: challengeData.challenge,
                    number: solved.number,
                    salt: challengeData.salt,
                    signature: challengeData.signature,
                    took: solved.took
                };
            }

            const sessionResponse = await fetch("/auth/analysis-session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(solution)
            });

            if (!sessionResponse.ok) {
                return fail("captchaVerifyFailed");
            }

            setAnalysisSessionToken(await sessionResponse.text());
            setAnalysisCaptchaError();
        } catch (error) {
            fail(error instanceof WidgetError && error.kind == "load"
                ? "captchaLoadFailed"
                : "captchaVerifyFailed"
            );
        } finally {
            // Tokens are single-use: drop the widget so a retry gets a new one.
            resetWidgets();
        }
    }, [fail, setAnalysisSessionToken, setAnalysisCaptchaError]);
}
