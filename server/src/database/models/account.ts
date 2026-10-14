import { Schema } from "mongoose";
import * as AuthTypes from "better-auth/types";

import Collection from "@/constants/Collection";
import { model } from "@/database/model";
import { AuthInfer } from "@/lib/auth";

export const User = model<AuthInfer["user"]>(
    "user",
    new Schema<AuthInfer["user"]>({}, { strict: false }),
    Collection.USERS
);

export const Account = model<AuthTypes.Account>(
    "account",
    new Schema<AuthTypes.Account>(),
    Collection.ACCOUNTS
);

export const Session = model<AuthInfer["session"]>(
    "session",
    new Schema<AuthInfer["session"]>(),
    Collection.SESSIONS
);

export const Verification = model<AuthTypes.Verification>(
    "verification",
    new Schema<AuthTypes.Verification>(),
    Collection.ACCOUNT_VERIFICATIONS 
);

export default { User, Account, Session, Verification };