/**
 * Syzygy tablebase information
 */
export interface TablebaseResult {
    /** Centipawn score (scaled -50000 to +50000) */
    score: number;
    /** Distance to mate (moves) */
    dtm?: number;
    /** Is it a loss? */
    loss: boolean;
    /** Is it a draw? */
    draw: boolean;
    /** Is it a win? */
    win: boolean;
}

/**
 * Tablebase lookup configuration
 */
export interface TablebaseOptions {
    /** Lichess base URL (default: https://tablebase.lichess.org) */
    baseUrl?: string;
    /** Maximum number of PV lines (default: 6) */
    multiPv?: number;
    /** Request timeout in ms (default: 300) */
    timeout?: number;
}

/**
 * Whether a position is suitable for tablebase lookup (≤7 pieces)
 */
export function isTablebasePosition(fen: string): boolean {
    // Count non-pawn pieces + pawns
    const piecePattern = /[KBRQ]/g;
    const pawnPattern = /p/g;

    const pieceCount = (fen.match(piecePattern) || []).length;
    const pawnCount = (fen.match(pawnPattern) || []).length;

    return (pieceCount + pawnCount) <= 7;
}

/**
 * Lookup a position in Lichess Syzygy tablebase
 *
 * @param fen - The position's FEN string
 * @param options - Lookup options
 * @returns TablebaseResult or undefined if not found/ineligible
 */
export async function lookupTablebase(
    fen: string,
    options: TablebaseOptions = {}
): Promise<TablebaseResult | undefined> {
    const {
        baseUrl = "https://tablebase.lichess.org",
        multiPv = 6,
        timeout = 300
    } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const url = `${baseUrl}/api/lookup?fen=${fen}&multiPv=${multiPv}`;

        const response = await fetch(url, {
            signal: controller.signal,
            // No credentials need to be sent (public API)
        });

        clearTimeout(timeoutId);

        if (!response.ok || response.status === 404 || response.status === 400) {
            // Position not found in tablebases (or invalid)
            return undefined;
        }

        const data = await response.json();

        if (!data) return undefined;

        // Parse result (field names per Lichess API)
        return {
            score: data.score ?? 0,
            dtm: data.dtm ?? undefined,
            loss: data.class === "loss",
            draw: data.class === "draw",
            win: data.class === "win"
        };
    } catch (error: unknown) {
        clearTimeout(timeoutId);
        console.warn(`[tablebaseLookup] Lookup failed:`, error);
        return undefined;
    }
}

/**
 * Convert tablebase score to human-readable string
 */
export function formatTablebaseScore(score: number): string {
    const absScore = Math.abs(score);
    if (absScore >= 50000) {
        // Mate detected
        return score > 0 ? "#+M" : "#-M";
    }
    // Convert centipawns to decimal
    const evalScore = score / 100;
    return score > 0 ? `+${evalScore.toFixed(2)}` : evalScore.toFixed(2);
}