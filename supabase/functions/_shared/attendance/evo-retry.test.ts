import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BACKOFF_MS,
  DEFAULT_RETRY_ATTEMPTS,
  EVO_BODY_PARSE_FAILED_PREFIX,
  EVO_BODY_READ_FAILED_PREFIX,
  EVO_FETCH_FAILED_PREFIX,
  isTransientError,
  withRetry,
} from "./evo-retry";

const noopSleep = () => Promise.resolve();

describe("isTransientError", () => {
  it("trata erro lendo body como transitório", () => {
    expect(
      isTransientError(
        new Error(`${EVO_BODY_READ_FAILED_PREFIX} TypeError: ...`),
      ),
    ).toBe(true);
  });

  it("trata erro de rede no fetch como transitório", () => {
    expect(
      isTransientError(new Error(`${EVO_FETCH_FAILED_PREFIX} ECONNRESET`)),
    ).toBe(true);
  });

  it("trata JSON inválido em resposta 2xx como transitório", () => {
    expect(
      isTransientError(
        new Error(`${EVO_BODY_PARSE_FAILED_PREFIX} unexpected token`),
      ),
    ).toBe(true);
  });

  it("HTTP 5xx é transitório", () => {
    expect(isTransientError(new Error("EVO 500 https://x.io: oops"))).toBe(true);
    expect(isTransientError(new Error("EVO 502 https://x.io: bad gateway"))).toBe(true);
    expect(isTransientError(new Error("EVO 503 https://x.io"))).toBe(true);
    expect(isTransientError(new Error("EVO 599 https://x.io"))).toBe(true);
  });

  it("HTTP 429 é transitório (rate limit)", () => {
    expect(isTransientError(new Error("EVO 429 https://x.io"))).toBe(true);
  });

  it("HTTP 4xx (exceto 429) é fatal", () => {
    expect(isTransientError(new Error("EVO 400 https://x.io"))).toBe(false);
    expect(isTransientError(new Error("EVO 401 https://x.io"))).toBe(false);
    expect(isTransientError(new Error("EVO 403 https://x.io"))).toBe(false);
    expect(isTransientError(new Error("EVO 404 https://x.io"))).toBe(false);
    expect(isTransientError(new Error("EVO 422 https://x.io"))).toBe(false);
  });

  it("erro com mensagem desconhecida é fatal (não é EVO_*)", () => {
    expect(isTransientError(new Error("random failure"))).toBe(false);
    expect(isTransientError(new Error(""))).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});

describe("withRetry — sucesso na primeira tentativa", () => {
  it("não reexecuta nem dorme se primeira chamada resolve", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const sleep = vi.fn(noopSleep);
    const result = await withRetry(fn, {
      attempts: 3,
      backoffMs: [10, 20, 30],
      isTransient: () => true,
      sleep,
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("withRetry — sucesso após segunda tentativa", () => {
  it("retorna na 2ª tentativa após erro transitório", async () => {
    const transient = new Error(`${EVO_BODY_READ_FAILED_PREFIX} flaky`);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce("ok-on-retry");
    const onFail = vi.fn();
    const result = await withRetry(fn, {
      attempts: 3,
      backoffMs: [10, 20],
      isTransient: isTransientError,
      onAttemptFailed: onFail,
      sleep: noopSleep,
    });
    expect(result).toBe("ok-on-retry");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(onFail.mock.calls[0][0]).toBe(0); // attempt index
    expect(onFail.mock.calls[0][1]).toBe(transient);
    expect(onFail.mock.calls[0][2]).toBe(10); // waitMs
  });
});

describe("withRetry — retry em erro lendo body", () => {
  it("reexecuta até esgotar tentativas e relança último erro", async () => {
    const err = new Error(`${EVO_BODY_READ_FAILED_PREFIX} reading body`);
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      withRetry(fn, {
        attempts: 3,
        backoffMs: [10, 20, 30],
        isTransient: isTransientError,
        sleep: noopSleep,
      }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("withRetry — retry em HTTP 502", () => {
  it("reexecuta em 502 até esgotar", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("EVO 502 https://x: gateway"))
      .mockRejectedValueOnce(new Error("EVO 502 https://x: gateway"))
      .mockResolvedValueOnce("eventually-ok");
    const result = await withRetry(fn, {
      attempts: 3,
      backoffMs: [1, 1, 1],
      isTransient: isTransientError,
      sleep: noopSleep,
    });
    expect(result).toBe("eventually-ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("withRetry — não retry em HTTP 400", () => {
  it("propaga 400 imediatamente sem reexecutar", async () => {
    const err400 = new Error("EVO 400 https://x: bad request");
    const fn = vi.fn().mockRejectedValue(err400);
    const sleep = vi.fn(noopSleep);
    await expect(
      withRetry(fn, {
        attempts: 3,
        backoffMs: [10, 20, 30],
        isTransient: isTransientError,
        sleep,
      }),
    ).rejects.toBe(err400);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("propaga 404 imediatamente (sem retry)", async () => {
    const err404 = new Error("EVO 404 https://x");
    const fn = vi.fn().mockRejectedValue(err404);
    await expect(
      withRetry(fn, {
        attempts: 3,
        backoffMs: [10, 20, 30],
        isTransient: isTransientError,
        sleep: noopSleep,
      }),
    ).rejects.toBe(err404);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("withRetry — defaults razoáveis", () => {
  it("DEFAULT_RETRY_ATTEMPTS é 3", () => {
    expect(DEFAULT_RETRY_ATTEMPTS).toBe(3);
  });

  it("DEFAULT_BACKOFF_MS aumenta entre tentativas", () => {
    expect(DEFAULT_BACKOFF_MS.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < DEFAULT_BACKOFF_MS.length; i++) {
      expect(DEFAULT_BACKOFF_MS[i]).toBeGreaterThan(DEFAULT_BACKOFF_MS[i - 1]);
    }
  });
});
