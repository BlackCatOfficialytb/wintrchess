import React from "react";
import { useTranslation } from "react-i18next";

import LocalStorageKey from "@/constants/LocalStorageKey";
import languages from "@/i18n/languages";

import * as categoryStyles from "../Category.module.css";
import * as styles from "./Language.module.css";

function Language() {
    const { t, i18n } = useTranslation("common");

    function setLanguage(id: string) {
        i18n.changeLanguage(id);
        localStorage.setItem(LocalStorageKey.PREFERRED_LANGUAGE, id);
    }

    return <div className={categoryStyles.wrapper}>
        <b className={categoryStyles.header}>
            {t("footer.language")}
        </b>

        <div className={styles.languages}>
            {languages.map(lang => <button
                key={lang.id}
                type="button"
                className={`${styles.language} ${
                    i18n.resolvedLanguage == lang.id ? styles.active : ""
                }`}
                onClick={() => setLanguage(lang.id)}
            >
                <img
                    className={styles.flag}
                    src={lang.flag}
                    alt=""
                />

                <span>{lang.label}</span>
            </button>)}
        </div>

        <a
            className={styles.helpLink}
            href="https://crowdin.com/project/wintrchess"
        >
            {t("footer.languagesDialog.help")}
        </a>
    </div>;
}

export default Language;
