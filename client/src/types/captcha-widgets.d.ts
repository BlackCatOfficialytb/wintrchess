interface CaptchaRenderCallbacks {
    callback: (token: string) => void;
    "error-callback": () => void;
    "expired-callback": () => void;
}

declare global {
    interface TurnstileWidget {
        render(
            container: HTMLElement | string,
            options: CaptchaRenderCallbacks & {
                sitekey: string;
                action?: string;
                appearance?: "always" | "execute" | "interaction-only";
                execution?: "render" | "execute";
                theme?: "light" | "dark" | "auto";
                size?: "compact" | "normal" | "flexible";
            }
        ): string;
        remove(widgetId?: string): void;
        reset(widgetId?: string): void;
        execute(widgetId?: string): void;
    }

    interface HcaptchaWidget {
        render(
            container: HTMLElement | string,
            options: CaptchaRenderCallbacks & {
                sitekey: string;
                action?: string;
                size?: "invisible" | "compact" | "normal";
                theme?: "light" | "dark";
            }
        ): string;
        remove(widgetId: string): void;
        reset(widgetId: string): void;
        execute(widgetId: string): void | Promise<void>;
    }

    interface Window {
        turnstile?: TurnstileWidget;
        hcaptcha?: HcaptchaWidget;
    }
}

export {};
