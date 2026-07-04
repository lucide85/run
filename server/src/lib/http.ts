import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 4 fanger ikke avviste promises fra async-handlere – en uhåndtert
 * rejection tar ned hele prosessen (Node ≥ 15). Wrap alle async-ruter i ah()
 * slik at feil ender i error-middlewaren i stedet.
 */
export function ah(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Gyldig dato eller null (Prisma kaster på Invalid Date – valider før bruk). */
export function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return null;
  const d = new Date(value as string | number | Date);
  return Number.isNaN(d.getTime()) ? null : d;
}
