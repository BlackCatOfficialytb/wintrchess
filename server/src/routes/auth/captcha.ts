import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { createChallenge } from "altcha-lib";

import CaptchaProvider, {
    CAPTCHA_ACTION
} from "shared/constants/CaptchaProvider";
import {
    getCaptchaProvider,
    getHcaptchaSiteKey,
    getTurnstileAppearance,
    getTurnstileSiteKey
} from "@/lib/captcha";

const router = Router();

router.get("/captcha", async (req, res) => {
    const provider = getCaptchaProvider();

    if (provider == CaptchaProvider.TURNSTILE) {
        return res.json({
            provider,
            siteKey: getTurnstileSiteKey(),
            action: CAPTCHA_ACTION,
            appearance: getTurnstileAppearance()
        });
    }

    if (provider == CaptchaProvider.HCAPTCHA) {
        return res.json({
            provider,
            siteKey: getHcaptchaSiteKey(),
            action: CAPTCHA_ACTION
        });
    }

    if (!process.env.AUTH_SECRET) {
        return res.sendStatus(StatusCodes.INTERNAL_SERVER_ERROR);
    }

    const challenge = await createChallenge({
        hmacKey: process.env.AUTH_SECRET,
        maxNumber: 100_000
    });

    res.json({ provider, ...challenge });
});

export default router;
