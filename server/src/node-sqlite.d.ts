// Minimal typings for node:sqlite (the @types/node version predates it).
declare module "node:sqlite" {
    export interface StatementSync {
        all(...params: unknown[]): unknown[];
        get(...params: unknown[]): unknown;
        run(...params: unknown[]): {
            changes: number;
            lastInsertRowid: number | bigint;
        };
    }

    export class DatabaseSync {
        constructor(path: string, options?: {
            open?: boolean;
            readOnly?: boolean;
        });
        exec(sql: string): void;
        prepare(sql: string): StatementSync;
        close(): void;
    }
}
