import * as AuthTypes from "better-auth/types";

import Collection from "@/constants/Collection";
import { model } from "@/database/model";
import { AuthInfer } from "@/lib/auth";

export const User = model<AuthInfer["user"]>(Collection.USERS);

export const Account = model<AuthTypes.Account>(Collection.ACCOUNTS);

export const Session = model<AuthInfer["session"]>(Collection.SESSIONS);

export const Verification = model<AuthTypes.Verification>(
    Collection.ACCOUNT_VERIFICATIONS
);

export default { User, Account, Session, Verification };
