import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../src/errors/AppError.js';
import {
  errorHandler,
  notFoundHandler,
} from '../../../src/middleware/errorHandler.js';

interface Captured {
  status: number;
  body: Record<string, unknown>;
}

function makeRes(headersSent = false): { res: Response; captured: Captured } {
  const captured: Captured = { status: 0, body: {} };
  const res = {
    headersSent,
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      captured.body = payload;
      return this;
    },
    end: vi.fn(),
  } as unknown as Response;
  return { res, captured };
}

function makeReq(): Request {
  return {
    id: 'req-1',
    method: 'POST',
    originalUrl: '/api/queries?draft=1',
  } as unknown as Request;
}

const next = (() => undefined) as unknown as NextFunction;

describe('errorHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an AppError with its own status, code and message', () => {
    const { res, captured } = makeRes();

    errorHandler(
      AppError.forbidden('You may not touch that'),
      makeReq(),
      res,
      next
    );

    expect(captured.status).toBe(403);
    expect(captured.body).toEqual({
      error: 'You may not touch that',
      code: 'FORBIDDEN',
      requestId: 'req-1',
    });
  });

  it('includes details when the error carries them', () => {
    const { res, captured } = makeRes();

    errorHandler(
      AppError.validation('Bad field', { field: 'title' }),
      makeReq(),
      res,
      next
    );

    expect(captured.status).toBe(400);
    expect(captured.body.details).toEqual({ field: 'title' });
  });

  it('never leaks the message of an unexpected error', () => {
    const { res, captured } = makeRes();
    const leaky = new Error(
      "ER_NO_SUCH_TABLE: Table 'defaultdb.resources' doesn't exist"
    );

    errorHandler(leaky, makeReq(), res, next);

    expect(captured.status).toBe(500);
    expect(captured.body).toEqual({
      error: 'Internal server error',
      code: 'INTERNAL',
      requestId: 'req-1',
    });
    expect(JSON.stringify(captured.body)).not.toContain('ER_NO_SUCH_TABLE');
  });

  it('turns an unparseable JSON body into a 400, not a 500', () => {
    const { res, captured } = makeRes();
    // The shape body-parser actually throws.
    const parseFailure = Object.assign(new SyntaxError('Unexpected token }'), {
      type: 'entity.parse.failed',
      status: 400,
    });

    errorHandler(parseFailure, makeReq(), res, next);

    expect(captured.status).toBe(400);
    expect(captured.body.code).toBe('MALFORMED_JSON');
  });

  it('maps an oversized body to 413', () => {
    const { res, captured } = makeRes();
    const tooLarge = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
    });

    errorHandler(tooLarge, makeReq(), res, next);

    expect(captured.status).toBe(413);
    expect(captured.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('aborts instead of double-writing when headers are already sent', () => {
    const { res, captured } = makeRes(true);

    errorHandler(new Error('late failure'), makeReq(), res, next);

    expect(res.end).toHaveBeenCalledOnce();
    expect(captured.status).toBe(0);
  });
});

describe('notFoundHandler', () => {
  it('answers 404 with the request id', () => {
    const { res, captured } = makeRes();

    notFoundHandler(makeReq(), res, next);

    expect(captured.status).toBe(404);
    expect(captured.body).toEqual({
      error: 'Route not found',
      code: 'NOT_FOUND',
      requestId: 'req-1',
    });
  });
});
