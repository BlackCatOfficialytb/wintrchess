/**
 * Post-tsc import fixer: rewrites tsconfig `paths` aliases (e.g. `@/foo`) to
 * relative specifiers and appends `.js` extensions so the emitted ESM output
 * runs on Node. Replaces `tsc-alias -f`, which pulls in an unfixable
 * `braces` vulnerability chain (no patched braces release exists).
 *
 * Usage: run from a workspace directory after `tsc`: node ../scripts/fix-imports.mjs
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = process.cwd();
const tsconfigPath = path.resolve(projectDir, process.argv[2] ?? "tsconfig.json");

/** Remove // and /* *\/ comments without touching comment markers inside strings. */
function stripComments(source) {
    let out = "";
    let i = 0;
    let quote = null;
    while (i < source.length) {
        const char = source[i];
        const next = source[i + 1];
        if (quote) {
            out += char;
            if (char === "\\") {
                out += next;
                i += 2;
                continue;
            }
            if (char === quote) quote = null;
            i++;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            out += char;
            i++;
            continue;
        }
        if (char === "/" && next === "/") {
            while (i < source.length && source[i] !== "\n") i++;
            continue;
        }
        if (char === "/" && next === "*") {
            i += 2;
            while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
            i += 2;
            continue;
        }
        out += char;
        i++;
    }
    return out;
}

function loadTsconfig(file) {
    const json = stripComments(readFileSync(file, "utf8")).replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(json);
}

const tsconfig = loadTsconfig(tsconfigPath);
const compilerOptions = tsconfig.compilerOptions ?? {};
const configDir = path.dirname(tsconfigPath);
const outDir = path.resolve(configDir, compilerOptions.outDir ?? ".");
const rootDir = path.resolve(configDir, compilerOptions.rootDir ?? ".");

/** Alias patterns from tsconfig, longest prefix first so exact matches win. */
const aliases = Object.entries(compilerOptions.paths ?? {})
    .map(([pattern, targets]) => {
        const star = pattern.indexOf("*");
        if (!targets?.length) return null;
        return {
            prefix: star === -1 ? pattern : pattern.slice(0, star),
            suffix: star === -1 ? "" : pattern.slice(star + 1),
            hasStar: star !== -1,
            target: targets[0],
        };
    })
    .filter(Boolean)
    .sort((a, b) => b.prefix.length - a.prefix.length);

const RUNTIME_EXTS = /\.(js|mjs|cjs|json|node)$/i;

/** Resolve an extensionless specifier by probing the emitted output tree. */
function probeTarget(base) {
    if (RUNTIME_EXTS.test(base) || base.endsWith(".d.ts")) {
        return existsSync(base) ? base : null;
    }
    for (const candidate of [`${base}.js`, `${base}.json`, path.join(base, "index.js"), `${base}.d.ts`, path.join(base, "index.d.ts")]) {
        if (existsSync(candidate)) return candidate;
    }
    return null;
}

/**
 * Map a specifier to the rewritten relative path, or null to leave it alone.
 * `fileDir` is the directory of the importing emitted file (absolute, inside outDir).
 */
function rewriteSpecifier(spec, fileDir) {
    let target = null;
    if (spec.startsWith(".")) {
        target = probeTarget(path.resolve(fileDir, spec));
    } else {
        const alias = aliases.find((a) => spec.startsWith(a.prefix) && spec.endsWith(a.suffix));
        if (!alias) return null;
        const inserted = alias.hasStar ? spec.slice(alias.prefix.length, spec.length - alias.suffix.length) : "";
        const targetPattern = alias.hasStar ? alias.target.replace("*", inserted) : alias.target;
        // The alias maps into the source tree; the emitted file mirrors rootDir -> outDir.
        const sourceTarget = path.resolve(configDir, targetPattern);
        const emitted = path.join(outDir, path.relative(rootDir, sourceTarget));
        target = probeTarget(emitted);
        if (!target) {
            warnings.push(`cannot resolve alias "${spec}" (looked for ${emitted})`);
            return null;
        }
    }
    if (!target) {
        warnings.push(`cannot resolve "${spec}"`);
        return null;
    }
    if (!target.startsWith(outDir + path.sep)) {
        warnings.push(`"${spec}" resolves outside outDir (${target})`);
        return null;
    }
    let relative = path.relative(fileDir, target).split(path.sep).join("/");
    if (!relative.startsWith(".")) relative = `./${relative}`;
    return relative;
}

const SPECIFIER_RE = /(from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)(["'])([^"'\\\n]+)\2/g;

const warnings = [];
let rewritten = 0;
let changedFiles = 0;

const files = readdirSync(outDir, { recursive: true }).filter((file) => /\.(js|mjs|cjs|d\.ts)$/.test(file));
for (const file of files) {
    const absolute = path.resolve(outDir, file);
    const original = readFileSync(absolute, "utf8");
    const updated = original.replace(SPECIFIER_RE, (match, prefix, quote, spec) => {
        const replacement = rewriteSpecifier(spec, path.dirname(absolute));
        if (replacement === null || replacement === spec) return match;
        rewritten++;
        return `${prefix}${quote}${replacement}${quote}`;
    });
    if (updated !== original) {
        writeFileSync(absolute, updated);
        changedFiles++;
    }
}

for (const warning of warnings) console.warn(`fix-imports: ${warning}`);
console.log(`fix-imports: rewrote ${rewritten} import${rewritten === 1 ? "" : "s"} in ${changedFiles} file${changedFiles === 1 ? "" : "s"} (${path.relative(projectDir, tsconfigPath)})`);
