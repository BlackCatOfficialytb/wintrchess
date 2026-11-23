import express, { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z, ZodType } from "zod";
import { verifySolution } from "altcha-lib";
import { Payload } from "altcha-lib/types";
import { randomBytes } from "crypto";

import CaptchaProvider from "shared/constants/CaptchaProvider";
import Cookie from "shared/constants/Cookie";
import AnalysisSession from "@/database/models/AnalysisSession";
import { secureCookieOptions } from "@/lib/security/account";
import {
    getCaptchaProvider,
    verifyHcaptcha,
    verifyTurnstile
} from "@/lib/captcha";

const path = "/analysis-session";

const router = Router();

const defaultSessionActions = 80;

// Both providers are accepted at the route so the CAPTCHA_PROVIDER switch can
// be flipped without a client redeploy, but only the configured one is
// honoured. ALTCHA's flat payload (no `provider`) stays valid for old clients.
const payloadSchema = z.union([
    z.object({
        provider: z.literal(CaptchaProvider.TURNSTILE),
        token: z.string().min(1).max(2048)
    }),
    z.object({
        provider: z.literal(CaptchaProvider.HCAPTCHA),
        token: z.string().min(1).max(2048)
    }),
    z.object({
        provider: z.literal(CaptchaProvider.ALTCHA).optional(),
        algorithm: z.enum(["SHA-1", "SHA-256", "SHA-512"]),
        challenge: z.string(),
        number: z.number(),
        salt: z.string(),
        signature: z.string()
    })
]) satisfies ZodType<{
    provider?: CaptchaProvider.ALTCHA;
    algorithm: "SHA-1" | "SHA-256" | "SHA-512";
    challenge: string;
    number: number;
    salt: string;
    signature: string;
} | {
    provider: CaptchaProvider.TURNSTILE | CaptchaProvider.HCAPTCHA;
    token: string;
}>;

router.use(path, express.json());

router.post(path, async (req, res) => {
    const result = payloadSchema.safeParse(req.body);

    if (!result.success) {
        return res.sendStatus(StatusCodes.BAD_REQUEST);
    }

    const solution = result.data;
    const configuredProvider = getCaptchaProvider();

    let captchaSolutionValid: boolean;

    if ("token" in solution) {
        // Only the provider the server is configured for may redeem a token.
        if (solution.provider != configuredProvider) {
            return res.sendStatus(StatusCodes.UNAUTHORIZED);
        }

        captchaSolutionValid = solution.provider == CaptchaProvider.TURNSTILE
            ? await verifyTurnstile(solution.token, req.ip)
            : await verifyHcaptcha(solution.token, req.ip);
    } else {
        if (configuredProvider != CaptchaProvider.ALTCHA) {
            return res.sendStatus(StatusCodes.UNAUTHORIZED);
        }
        if (!process.env.AUTH_SECRET) {
            return res.sendStatus(StatusCodes.INTERNAL_SERVER_ERROR);
        }

        captchaSolutionValid = await verifySolution(
            solution as Payload, process.env.AUTH_SECRET
        );
    }

    if (!captchaSolutionValid) {
        return res.sendStatus(StatusCodes.UNAUTHORIZED);
    }

    // Do not replace existing valid session
    const existingSessionToken = req.cookies[Cookie.ANALYSIS_SESSION_TOKEN];

    if (existingSessionToken) {
        const existingSession = await AnalysisSession.findOne({
            token: existingSessionToken
        });

        if (existingSession) {
            return res.sendStatus(StatusCodes.OK);
        }
    }

    // Generate session
    const sessionToken = randomBytes(32).toString("base64");

    await AnalysisSession.create({
        token: sessionToken,
        actions: process.env.ANALYSIS_SESSION_ACTIONS || defaultSessionActions,
        createdAt: new Date()
    });

    res.cookie(
        Cookie.ANALYSIS_SESSION_TOKEN,
        sessionToken,
        secureCookieOptions
    );

    res.send(sessionToken);
});

export default router;
