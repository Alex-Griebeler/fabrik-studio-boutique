import { describe, expect, it } from "vitest";
import {
  classifyTwilioStatus,
  normalizeTwilioMessageStatus,
} from "./twilio-status";

describe("normalizeTwilioMessageStatus", () => {
  it("delivered sem erro", () => {
    const r = normalizeTwilioMessageStatus({
      sid: "SM123",
      status: "delivered",
      error_code: null,
      error_message: null,
    });
    expect(r).toEqual({
      status: "delivered",
      errorCode: null,
      errorMessage: null,
    });
  });

  it("sent (em trânsito) sem erro", () => {
    const r = normalizeTwilioMessageStatus({
      status: "sent",
      error_code: null,
      error_message: null,
    });
    expect(r.status).toBe("sent");
    expect(r.errorCode).toBeNull();
    expect(r.errorMessage).toBeNull();
  });

  it("queued sem erro", () => {
    const r = normalizeTwilioMessageStatus({ status: "queued" });
    expect(r.status).toBe("queued");
    expect(r.errorCode).toBeNull();
  });

  it("failed com error_code numérico", () => {
    const r = normalizeTwilioMessageStatus({
      status: "failed",
      error_code: 63015,
      error_message: "Channel could not be reached",
    });
    expect(r.status).toBe("failed");
    expect(r.errorCode).toBe("63015");
    expect(r.errorMessage).toBe("Channel could not be reached");
  });

  it("undelivered com error_message", () => {
    const r = normalizeTwilioMessageStatus({
      status: "undelivered",
      error_code: 30008,
      error_message: "Unknown error",
    });
    expect(r.status).toBe("undelivered");
    expect(r.errorCode).toBe("30008");
    expect(r.errorMessage).toBe("Unknown error");
  });

  it("error_code já string preserva", () => {
    const r = normalizeTwilioMessageStatus({
      status: "failed",
      error_code: "63015",
      error_message: "x",
    });
    expect(r.errorCode).toBe("63015");
  });

  it("payload incompleto vira tudo null", () => {
    expect(normalizeTwilioMessageStatus({})).toEqual({
      status: null,
      errorCode: null,
      errorMessage: null,
    });
    expect(normalizeTwilioMessageStatus(null)).toEqual({
      status: null,
      errorCode: null,
      errorMessage: null,
    });
    expect(normalizeTwilioMessageStatus(undefined)).toEqual({
      status: null,
      errorCode: null,
      errorMessage: null,
    });
  });

  it("strings vazias viram null", () => {
    const r = normalizeTwilioMessageStatus({
      status: "",
      error_code: "",
      error_message: "",
    });
    expect(r).toEqual({
      status: null,
      errorCode: null,
      errorMessage: null,
    });
  });

  it("payload sem `status` mas com erro ainda devolve erro", () => {
    const r = normalizeTwilioMessageStatus({
      error_code: 30001,
      error_message: "Queue overflow",
    });
    expect(r.status).toBeNull();
    expect(r.errorCode).toBe("30001");
    expect(r.errorMessage).toBe("Queue overflow");
  });

  it("ignora campos não-numéricos/string em error_code", () => {
    const r = normalizeTwilioMessageStatus({
      status: "failed",
      error_code: { weird: true },
    });
    expect(r.status).toBe("failed");
    expect(r.errorCode).toBeNull();
  });

  it("error_code NaN não vira string 'NaN'", () => {
    const r = normalizeTwilioMessageStatus({
      status: "failed",
      error_code: Number.NaN,
    });
    expect(r.errorCode).toBeNull();
  });
});

describe("classifyTwilioStatus", () => {
  it("delivered/read → delivered", () => {
    expect(classifyTwilioStatus("delivered")).toBe("delivered");
    expect(classifyTwilioStatus("DELIVERED")).toBe("delivered");
    expect(classifyTwilioStatus("read")).toBe("delivered");
  });

  it("failed/undelivered → failed", () => {
    expect(classifyTwilioStatus("failed")).toBe("failed");
    expect(classifyTwilioStatus("undelivered")).toBe("failed");
  });

  it("queued/sent/sending/accepted/scheduled → in_transit", () => {
    expect(classifyTwilioStatus("queued")).toBe("in_transit");
    expect(classifyTwilioStatus("sent")).toBe("in_transit");
    expect(classifyTwilioStatus("sending")).toBe("in_transit");
    expect(classifyTwilioStatus("accepted")).toBe("in_transit");
    expect(classifyTwilioStatus("scheduled")).toBe("in_transit");
  });

  it("null/desconhecido → unknown", () => {
    expect(classifyTwilioStatus(null)).toBe("unknown");
    expect(classifyTwilioStatus("alguma_coisa_nova")).toBe("unknown");
  });
});
