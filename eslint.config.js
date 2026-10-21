const tsEslint = require("typescript-eslint");
const stylistic = require("@stylistic/eslint-plugin");

module.exports = tsEslint.config(
    { ignores: ["**/dist/**"] },
    {
        files: [
            "**/*.ts",
            "**/*.tsx"
        ],
        languageOptions: {
            parser: tsEslint.parser
        },
        plugins: {
            "@ts": tsEslint.plugin,
            "@stylistic": stylistic
        },
        rules: {
            "@stylistic/quotes": ["error", "double"],
            "@stylistic/quote-props": ["error", "as-needed"],
            "@stylistic/brace-style": "error",
            "@stylistic/comma-dangle": ["error", "never"],
            "@stylistic/comma-spacing": "error",
            "@stylistic/function-call-spacing": "error",
            "@stylistic/indent": ["error", 4],
            "@stylistic/key-spacing": "error",
            "@stylistic/keyword-spacing": "error",
            "@stylistic/member-delimiter-style": "error",
            "@stylistic/semi": "error",
            "@stylistic/no-extra-semi": "error",
            "@stylistic/type-annotation-spacing": "error",
            "@ts/no-empty-function": "warn",
            "@ts/no-unused-vars": "warn"
        }
    }
);
