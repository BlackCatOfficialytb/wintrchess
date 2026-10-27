export interface PVMove {
    move: string;
    dtz: number;
    isBest: boolean;
}

export interface TablebaseData {
    pvMoves: PVMove[];
    resultText: string;
}

export interface TablebaseResult {
    score: number;
    dtm?: number;
    class: 'win' | 'loss' | 'draw';
}

export interface TablebaseOptions {
    baseUrl?: string;
    multiPv?: number;
    timeout?: number;
}

/**
 * Whether a position is suitable for tablebase lookup (≤7 pieces)
 */
export function isTablebasePosition(fen: string): boolean {
    const piecePattern = /[KBRQ]/g;
    const pawnPattern = /p/g;

    const pieceCount = (fen.match(piecePattern) || []).length;
    const pawnCount = (fen.match(pawnPattern) || []).length;

    return (pieceCount + pawnCount) <= 7;
}

/**
 * Format a tablebase score to a readable string
 */
export function formatTablebaseScore(score: number): string {
    const absScore = Math.abs(score);
    if (absScore >= 50000) {
        return score > 0 ? "#+M" : "#-M";
    }
    const evalScore = score / 100;
    return score > 0 ? `+${evalScore.toFixed(2)}` : evalScore.toFixed(2);
}

/**
 * Parse the mainline moves from a PV line
 */
function parsePVMoves(any): TablebaseData | null {
    if (!data?.pv) {
        return null;
    }

    const pvMoves: PVMove[] = [];

    try {
        if (data.pv && typeof data.pv === 'string') {
            const moves = data.pv.split(' ');
            moves.forEach((move: string, idx: number) => {
                pvMoves.push({
                    move: move,
                    dtz: 0,
                    isBest: idx === 0
                });
            });
        }
    } catch {
        return null;
    }

    return {
        pvMoves,
        resultText: data.result || "NO RESULT"
    };
}

/**
 * Convert a tablebase score to result text
 */
function getResultText(any): string {
    if (!data || !data.class) {
        return "NO RESULT";
    }

    const resultMap: Record<string, string> = {
        'win': 'WHITE WINS',
        'loss': 'BLACK WINS',
        'draw': 'TABLEBASE DRAWS'
    };

    return resultMap[data.class] || "NO RESULT";
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
        });

        clearTimeout(timeoutId);

        if (!response.ok || response.status === 404) {
            return undefined;
        }

        const data = await response.json();

        if (!data) return undefined;

        return {
            score: data.score ?? 0,
            dtm: data.dtm ?? undefined,
            class: data.class || 'draw'
        };
    } catch (error: unknown) {
        clearTimeout(timeoutId);
        console.warn('[tablebaseLookup] Lookup failed:', error);
        return undefined;
    }
}