/**
 * Syzygy tablebase client using the lila-tablebase HTTP API.
 *
 * Endpoint: GET {baseUrl}/standard?fen=<fen>
 * Docs: https://github.com/lichess-org/lila-tablebase
 *
 * Verified response schema:
 * {
 *   category: "win" | "draw" | "loss" | "unknown"
 *           | "maybe-win" | "maybe-loss"
 *           | "cursed-win" | "blessed-loss",
 *   dtz, precise_dtz, dtm (<= 5 pieces only) | null,
 *   checkmate, stalemate, insufficient_material,
 *   moves: [ { uci, san, dtz, dtm, category, zeroing, conversion, ...
 *              checkmate, stalemate } ] // ranked best-first
 * }
 *
 * Negative dtz/dtm values mean the side-to-move is losing.
 */

import Evaluation from "@/types/game/position/Evaluation";

export type TablebaseCategory =
    | "win"
    | "draw"
    | "loss"
    | "unknown"
    | "maybe-win"
    | "maybe-loss"
    | "cursed-win"
    | "blessed-loss";

export interface TablebaseMove {
    uci: string;
    san: string;
    category: TablebaseCategory;
    dtz?: number;
    dtm?: number;
    checkmate: boolean;
    stalemate: boolean;
    /** Move captures or pawns -> DTZ zeroing move */
    conversion?: boolean;
    zeroing?: boolean;
}

export interface TablebaseResult {
    category: TablebaseCategory;
    dtz?: number;
    dtm?: number;
    checkmate: boolean;
    stalemate: boolean;
    insufficientMaterial: boolean;
    /** Legal moves ranked best-first */
    moves: TablebaseMove[];
}

export interface TablebaseOptions {
    baseUrl?: string;
    /** Request timeout in ms (default 2000) */
    timeout?: number;
}

/**
 * Whether a position is suitable for tablebase lookup (<= 7 pieces).
 * Counts only actual piece letters within the board field of the FEN,
 * ignoring digits, slashes, side-to-move, castling and halfmove fields.
 */
export function isTablebasePosition(fen: string): boolean {
    const board = fen.split(" ")[0] || "";

    const pieceCount = (board.match(/[a-zA-Z]/g) || []).length;

    return pieceCount >= 2 && pieceCount <= 7;
}

function getWhiteToMove(fen: string): boolean {
    return fen.split(" ")[1] == "w";
}

function isWinningCategory(category: TablebaseCategory): boolean {
    return category == "win"
        || category == "maybe-win"
        || category == "cursed-win";
}

function isLosingCategory(category: TablebaseCategory): boolean {
    return category == "loss" || category == "maybe-loss";
}

/**
 * Maps a tablebase category to a white-POV evaluation:
 * - Exact mate distance when dtm is available (<= 5 pieces).
 * - Mate on the DTZ horizon otherwise (6-7 piece positions), since
 *   centipawn 0 would misrepresent a forced win as a draw.
 * - Centipawn 0 for draws and 50-move bound results (cursed-win,
 *   blessed-loss), matching Stockfish's treatment of those cases.
 */
function categoryToEvaluation(
    category: TablebaseCategory,
    dtm: number | undefined,
    dtz: number | undefined,
    whiteToMove: boolean
): Evaluation {
    const winning = isWinningCategory(category);
    const losing = isLosingCategory(category);

    if (!winning && !losing) {
        return { type: "centipawn", value: 0 };
    }

    // Winner is the side-to-move in winning categories,
    // otherwise is the opponent.
    const whiteWins = winning ? whiteToMove : !whiteToMove;

    // Signed distances encode the losing side negatively
    const distance = Math.max(Math.abs(dtm ?? dtz ?? 1), 1);

    return {
        type: "mate",
        value: whiteWins ? distance : -distance
    };
}

/**
 * Converts a shared tablebase result and a FEN into one evaluation,
 * usable wherever tablebase results are stored in EngineLine records.
 */
export function getTablebaseResultEvaluation(
    result: TablebaseResult,
    fen: string
): Evaluation {
    return categoryToEvaluation(
        result.category,
        result.dtm,
        result.dtz,
        getWhiteToMove(fen)
    );
}

export function getTablebaseMoveEvaluation(
    move: TablebaseMove,
    fen: string
): Evaluation {
    // A move's category describes the resulting position, where the
    // opponent is now the side-to-move.
    return categoryToEvaluation(
        move.category,
        move.dtm,
        move.dtz,
        !getWhiteToMove(fen)
    );
}

/**
 * Human readable result from white's viewpoint, e.g.
 * "WHITE WINS IN 16", "BLACK WINS", "DRAWS (50-MOVE LIMIT)".
 *
 * Decisive results always name the winning side; the losing side is
 * never mentioned. Pass forResultingPosition = true when `result`
 * belongs to a move (its category describes the position after the
 * move, where the opponent becomes the side-to-move).
 */
export function formatTablebaseResult(
    result: TablebaseResult | TablebaseMove,
    fen: string,
    forResultingPosition = false
): string {
    const whiteToMove = forResultingPosition
        ? !getWhiteToMove(fen)
        : getWhiteToMove(fen);

    if (result.checkmate) {
        // Whoever is to move has been mated; report the winner instead
        return whiteToMove ? "BLACK WINS" : "WHITE WINS";
    }
    if (result.stalemate) {
        return "STALEMATE";
    }

    const winning = isWinningCategory(result.category);

    if (winning || isLosingCategory(result.category)) {
        const whiteWins = winning ? whiteToMove : !whiteToMove;
        // Signed distances encode the losing side negatively
        const distance = Math.abs(result.dtm ?? result.dtz ?? 0);

        const suffix = result.category == "cursed-win"
            ? " (50-MOVE LIMIT)"
            : result.category == "maybe-win" || result.category == "maybe-loss"
                ? "*" // DTZ-rounding caveat
                : "";

        return distance
            ? `${whiteWins ? "WHITE" : "BLACK"} WINS IN ${distance}${suffix}`
            : `${whiteWins ? "WHITE" : "BLACK"} WINS${suffix}`;
    }

    const drawLabels: Record<TablebaseCategory, string> = {
        "win": "",
        "maybe-win": "",
        "cursed-win": "",
        "loss": "",
        "maybe-loss": "",
        "draw": "TABLEBASE DRAWS",
        "blessed-loss": "TABLEBASE DRAWS (50-MOVE LIMIT)",
        "unknown": "TABLEBASE UNKNOWN"
    };

    return drawLabels[result.category];
}

/**
 * Lookup a position in the lichess syzygy tablebase.
 *
 * @param fen - The position's FEN string
 * @param options - Lookup options
 * @returns TablebaseResult or undefined if ineligible/not found/connection failed
 */
export async function lookupTablebase(
    fen: string,
    options: TablebaseOptions = {}
): Promise<TablebaseResult | undefined> {
    const {
        baseUrl = "https://tablebase.lichess.org",
        timeout = 2000
    } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Only spaces require manual encoding for this endpoint; slashes in
    // the query string are permitted and the parser encodes the rest.
    const url = `${baseUrl}/standard?fen=${fen.replace(/ /g, "%20")}`;

    try {
        const response = await fetch(url, { signal: controller.signal });

        // 400/404: invalid FEN, not a tablebase position, etc.
        if (!response.ok) {
            return undefined;
        }

        const data = await response.json();

        if (!data || !data.category) {
            return undefined;
        }

        return {
            category: data.category,
            dtz: data.dtz ?? undefined,
            dtm: data.dtm ?? undefined,
            checkmate: !!data.checkmate,
            stalemate: !!data.stalemate,
            insufficientMaterial: !!data.insufficient_material,
            moves: (data.moves || []).map((move: {
                uci: string;
                san: string;
                category: TablebaseCategory;
                dtz?: number | null;
                dtm?: number | null;
                checkmate?: boolean;
                stalemate?: boolean;
                conversion?: boolean;
                zeroing?: boolean;
            }): TablebaseMove => ({
                uci: move.uci,
                san: move.san,
                category: move.category,
                dtz: move.dtz ?? undefined,
                dtm: move.dtm ?? undefined,
                checkmate: !!move.checkmate,
                stalemate: !!move.stalemate,
                conversion: move.conversion,
                zeroing: move.zeroing
            }))
        };
    } catch (error: unknown) {
        // Also catches aborts from our own timeout
        console.warn("[tablebaseLookup] lookup failed:", error);
        return undefined;
    } finally {
        clearTimeout(timeoutId);
    }
}
