import express from "express";
import cluster from "cluster";
import os from "os";
import { Readable } from "stream";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { toNodeHandler } from "better-auth/node";

import connectDatabase from "@/database/connect";
import getAuth from "@/lib/auth";
import mainRouter from "./routes";

dotenv.config();

const port = process.env.PORT || 8080;
const nodeEnv = process.env.NODE_ENV || "production";

const coreCount = os.cpus().length;

async function main() {
    if (cluster.isPrimary) {
        console.log("starting server...");
        for (let i = 0; i < coreCount; i++) cluster.fork();

        return;
    }

    await connectDatabase();

    const app = express();

    app.use(cookieParser());

    // Stockfish wasm builds allocate shared memory, which browsers only
    // expose when the page is cross-origin isolated (COOP + COEP).
    app.use((req, res, next) => {
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
        next();
    });

    // Static assets
    app.use("/",
        express.static("client/dist"),
        express.static("client/public")
    );

    // Engines missing from client/public/engines fall back to the
    // nmrugg/stockfish.js v19 release assets (see "sf wasm link.txt").
    // The browser cannot fetch these directly - release assets send no
    // Access-Control-Allow-Origin header - so the server proxies them.
    // Keys are our variant-specific local names, values the upstream asset
    // names they were renamed from.
    // ponytail: no disk cache; add one if repeated 90MB pulls show up in logs.
    const engineReleaseBase =
        "https://github.com/nmrugg/stockfish.js/releases/download/v19.0.1/";
    const engineFallbacks = new Map([
        ["stockfish-19-full-multi.js", "stockfish-19.js"],
        ["stockfish-19-full-multi.wasm", "stockfish-19.wasm"],
        ["stockfish-19-full-single.js", "stockfish-19-single.js"],
        ["stockfish-19-full-single.wasm", "stockfish-19-single.wasm"],
        ["stockfish-19-lite-multi.js", "stockfish-19-lite.js"],
        ["stockfish-19-lite-multi.wasm", "stockfish-19-lite.wasm"],
        ["stockfish-19-lite-single.js", "stockfish-19-lite-single.js"],
        ["stockfish-19-lite-single.wasm", "stockfish-19-lite-single.wasm"],
        ["stockfish-19-asm.js", "stockfish-19-asm.js"]
    ]);

    app.get("/engines/:file", async (req, res) => {
        const upstreamName = engineFallbacks.get(req.params.file);
        if (!upstreamName) return res.sendStatus(404);

        try {
            const upstream = await fetch(engineReleaseBase + upstreamName);
            if (!upstream.ok || !upstream.body) return res.sendStatus(404);

            res.status(200);
            res.setHeader(
                "Content-Type",
                // github release assets are served as octet-stream, which
                // breaks WebAssembly.instantiateStreaming
                req.params.file.endsWith(".wasm")
                    ? "application/wasm"
                    : upstream.headers.get("content-type")
                        || "application/octet-stream"
            );
            const length = upstream.headers.get("content-length");
            if (length) res.setHeader("Content-Length", length);
            // short-lived: engine filenames are mutable (rebuilds change the
            // bytes behind the same URL), so a long immutable cache serves
            // stale wasm against a new js glue (RuntimeError: null function)
            res.setHeader("Cache-Control", "public, max-age=600");

            Readable.fromWeb(
                upstream.body as unknown as import("stream/web").ReadableStream
            ).pipe(res);
        } catch {
            res.sendStatus(502);
        }
    });

    // Normal endpoints
    app.all("/auth/account/*", toNodeHandler(getAuth()));
    app.use("/", mainRouter);

    // Start listening for requests
    app.listen(port, () => {
        if (cluster.worker?.id != 1) return;

        console.log(
            `server running on port ${port} `
            + `(${nodeEnv} mode, ${coreCount} thread`
            + (coreCount > 1 ? "s)" : ")")
        );
    });
}

main();