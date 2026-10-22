import cluster from "cluster";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";

import schemas, { additionalUserFields } from "shared/constants/account/schemas";
import Collection from "@/constants/Collection";
import { isDatabaseReady } from "@/database/sql";
import { sqlAuthAdapter } from "@/database/sqlAuthAdapter";
import { sendAccountEmail } from "@/lib/email";

import { requestProcessor, userInitialiser } from "./registration";

export type AuthType = ReturnType<typeof createAuth>;
export type AuthInfer = AuthType["$Infer"]["Session"];

let instance: AuthType | null = null;

function createAuth(database: BetterAuthOptions["database"]) {
    if (!process.env.ORIGIN) {
        throw new Error("origin not specified.");
    }

    if (!process.env.AUTH_SECRET) {
        throw new Error("auth secret not specified.");
    }

    return betterAuth({
        baseURL: `${process.env.ORIGIN}/auth/account`,
        secret: process.env.AUTH_SECRET,
        trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "")
            .split(",")
            .map(origin => origin.trim())
            .filter(Boolean),
        database,
        emailAndPassword: {
            enabled: true,
            minPasswordLength: schemas.password.minLength || 8,
            maxPasswordLength: schemas.password.maxLength || 128,
            requireEmailVerification: true,
            sendResetPassword: async ({ user, url }) => sendAccountEmail({
                recipient: user.email,
                subject: "Reset your WintrChess password",
                message: "Please reset your WintrChess account's "
                    + "password by clicking the button below:",
                buttonLabel: "Reset Password",
                buttonUrl: url,
                plaintextFallback: "Please use the link to reset your"
                    + ` WintrChess account's password: ${url}`
            }),
            revokeSessionsOnPasswordReset: true
        },
        emailVerification: {
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, url }) => sendAccountEmail({
                recipient: user.email,
                subject: "Verify your WintrChess account",
                message: "Thank you for creating an account on WintrChess! "
                    + "Please verify your account by clicking the button below:",
                buttonLabel: "Verify Account",
                buttonUrl: url,
                plaintextFallback: `Please verify your WintrChess account: ${url}`
            })
        },
        socialProviders: {
            google: {
                clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
                clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!
            }
        },
        user: {
            modelName: Collection.USERS,
            additionalFields: additionalUserFields,
            changeEmail: {
                enabled: true
            },
            deleteUser: { enabled: true }
        },
        account: { modelName: Collection.ACCOUNTS },
        session: { modelName: Collection.SESSIONS },
        verification: { modelName: Collection.ACCOUNT_VERIFICATIONS },
        hooks: { before: requestProcessor },
        databaseHooks: {
            user: {
                create: { before: userInitialiser }
            }
        },
        logger: { disabled: cluster.worker?.id != 1 },
        advanced: { cookiePrefix: "wintrchess" }
    });
}

export function getAuth() {
    if (!isDatabaseReady()) throw new Error(
        "cannot initialise auth without database connection."
    );

    return instance ??= createAuth(sqlAuthAdapter);
}

export default getAuth;