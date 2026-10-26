import { Chess } from "chess.js";
import { ParseTree, parseGame } from "@mliebelt/pgn-parser";
import { uniqueId } from "lodash-es";

import Game from "@/types/game/Game";
import { StateTreeNode } from "@/types/game/position/StateTreeNode";
import PieceColour from "@/constants/PieceColour";

type ParsedPGNMove = ParseTree["moves"][number];

function parseStateTree(game: Game) {
    const parsedPGN = parseGame(game.pgn);

    function addMovesToNode(
        node: StateTreeNode,
        moves: ParsedPGNMove[],
        mainline: boolean
    ) {
        let lastNode = node;

        for (const pgnMove of moves) {
            const sanMove = pgnMove.notation.notation;
            console.log(`[parseStateTree] Attempting '${sanMove}'`); // Debug logging

            const parsedMove = new Chess(lastNode.state.fen)
                .move(sanMove);

            if (parsedMove) {
                // Move was valid, create new node
                const newNode: StateTreeNode = {
                    id: uniqueId(),
                    mainline: mainline,
                    parent: lastNode,
                    children: [],
                    state: {
                        fen: parsedMove.after,
                        engineLines: [],
                        move: {
                            san: parsedMove.san,
                            uci: parsedMove.lan
                        },
                        moveColour: parsedMove.color == "w"
                            ? PieceColour.WHITE
                            : PieceColour.BLACK
                    }
                };

                lastNode.children.push(newNode);
                lastNode = newNode;
            } else {
                // Move was invalid - this can happen in Chess 960 with strict validation,
                // or with malformed/not-supported PGN notations like extended castling.
                console.warn(`[parseStateTree] Skipping invalid move '${sanMove}'`);
                // Continue with next move - the invalid PGN notation is treated similarly
                // to a comment/variation that couldn't be parsed into the game
            }

            for (const variation of pgnMove.variations) {
                addMovesToNode(lastNode, variation, false);
            }
        }
    }

    const rootNode: StateTreeNode = {
        id: uniqueId(),
        mainline: true,
        children: [],
        state: {
            fen: game.initialPosition,
            engineLines: []
        }
    };

    addMovesToNode(rootNode, parsedPGN.moves, true);

    return rootNode;
}

export default parseStateTree;