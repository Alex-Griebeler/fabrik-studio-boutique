import { describe, it, expect } from "vitest";
import {
  evaluateStudent,
  evaluateAll,
  isWithinSendWindow,
  type AttendanceEvent,
} from "./detection";

// Helper pra montar evento curto.
function ev(
  date: string,
  status: AttendanceEvent["status"],
  opts: Partial<AttendanceEvent> = {},
): AttendanceEvent {
  return {
    studentId: "stu-1",
    sessionId: `sess-${date}-${Math.random().toString(36).slice(2, 6)}`,
    bookingId: opts.sessionType === "personal" ? null : `book-${date}`,
    sessionType: "group",
    modality: "Bootcamp",
    date,
    startTime: "07:00",
    status,
    trainerId: "trainer-jp",
    assistantTrainerId: null,
    ...opts,
  };
}

describe("evaluateStudent — regra group_2_misses", () => {
  it("retorna alerta quando últimas 2 sessões grupo são faltas", () => {
    const events = [
      ev("2026-05-01", "present"),
      ev("2026-05-03", "no_show"),
      ev("2026-05-05", "no_show"),
    ];
    const result = evaluateStudent(events);
    expect(result).not.toBeNull();
    expect(result!.alertType).toBe("group_2_misses");
    expect(result!.missedDates).toEqual(["2026-05-03", "2026-05-05"]);
    expect(result!.lastAttendedAt).toBe("2026-05-01");
  });

  it("não dispara com 1 falta isolada em grupo", () => {
    const events = [
      ev("2026-05-01", "present"),
      ev("2026-05-03", "no_show"),
    ];
    expect(evaluateStudent(events)).toBeNull();
  });

  it("não dispara se a última sessão foi presença", () => {
    const events = [
      ev("2026-05-01", "no_show"),
      ev("2026-05-03", "no_show"),
      ev("2026-05-05", "present"),
    ];
    expect(evaluateStudent(events)).toBeNull();
  });

  it("conta cancelled_late como falta", () => {
    const events = [
      ev("2026-05-01", "present"),
      ev("2026-05-03", "cancelled_late"),
      ev("2026-05-05", "no_show"),
    ];
    const result = evaluateStudent(events);
    expect(result).not.toBeNull();
    expect(result!.alertType).toBe("group_2_misses");
    expect(result!.missedDates).toEqual(["2026-05-03", "2026-05-05"]);
  });

  it("ignora cancelled_on_time (não quebra streak nem conta)", () => {
    const events = [
      ev("2026-05-01", "no_show"),
      ev("2026-05-03", "cancelled_on_time"), // ignorado
      ev("2026-05-05", "no_show"),
    ];
    const result = evaluateStudent(events);
    expect(result).not.toBeNull();
    expect(result!.alertType).toBe("group_2_misses");
    expect(result!.missedDates).toEqual(["2026-05-01", "2026-05-05"]);
  });

  it("ignora sessões futuras com status scheduled", () => {
    const events = [
      ev("2026-05-01", "no_show"),
      ev("2026-05-03", "no_show"),
      ev("2026-05-08", "scheduled"), // futura, ignorada
    ];
    const result = evaluateStudent(events);
    expect(result).not.toBeNull();
    expect(result!.alertType).toBe("group_2_misses");
  });

  it("usa data+hora pra ordenar (mesmo dia, horários diferentes)", () => {
    const events = [
      { ...ev("2026-05-05", "present"), startTime: "07:00" },
      { ...ev("2026-05-05", "no_show"), startTime: "18:00" },
      { ...ev("2026-05-06", "no_show"), startTime: "07:00" },
    ];
    const result = evaluateStudent(events);
    expect(result).not.toBeNull();
    expect(result!.alertType).toBe("group_2_misses");
    // Confere que considerou as duas faltas mais recentes
    expect(result!.missedDates).toEqual(["2026-05-05", "2026-05-06"]);
  });
});

describe("evaluateStudent — regra pt_1_miss", () => {
  it("dispara com 1 falta em sessão personal", () => {
    const events = [
      ev("2026-05-01", "present", { sessionType: "personal" }),
      ev("2026-05-05", "no_show", { sessionType: "personal" }),
    ];
    const result = evaluateStudent(events);
    expect(result).not.toBeNull();
    expect(result!.alertType).toBe("pt_1_miss");
    expect(result!.missedDates).toEqual(["2026-05-05"]);
  });

  it("dispara mesmo se streak inclui faltas em grupo", () => {
    // Aluno PT que também faz grupo — uma falta personal acelera.
    const events = [
      ev("2026-05-01", "present", { sessionType: "group" }),
      ev("2026-05-05", "no_show", { sessionType: "personal" }),
    ];
    const result = evaluateStudent(events);
    expect(result).not.toBeNull();
    expect(result!.alertType).toBe("pt_1_miss");
  });

  it("não dispara se streak personal é só de presenças", () => {
    const events = [
      ev("2026-05-01", "present", { sessionType: "personal" }),
      ev("2026-05-05", "present", { sessionType: "personal" }),
    ];
    expect(evaluateStudent(events)).toBeNull();
  });
});

describe("evaluateStudent — edge cases", () => {
  it("retorna null pra histórico vazio", () => {
    expect(evaluateStudent([])).toBeNull();
  });

  it("retorna null se só houver eventos future/scheduled", () => {
    const events = [ev("2026-05-10", "scheduled"), ev("2026-05-12", "scheduled")];
    expect(evaluateStudent(events)).toBeNull();
  });

  it("captura trainerId da falta mais recente", () => {
    const events = [
      ev("2026-05-01", "no_show", { trainerId: "trainer-felipe" }),
      ev("2026-05-05", "no_show", { trainerId: "trainer-jp" }),
    ];
    const result = evaluateStudent(events);
    expect(result!.primaryTrainerId).toBe("trainer-jp");
  });

  it("preserva sessionIds e bookingIds", () => {
    const events: AttendanceEvent[] = [
      {
        ...ev("2026-05-03", "no_show"),
        sessionId: "sess-A",
        bookingId: "book-A",
      },
      {
        ...ev("2026-05-05", "no_show"),
        sessionId: "sess-B",
        bookingId: "book-B",
      },
    ];
    const result = evaluateStudent(events);
    expect(result!.missedSessionIds).toEqual(["sess-A", "sess-B"]);
    expect(result!.missedBookingIds).toEqual(["book-A", "book-B"]);
  });

  it("filtra bookingId null pra sessões personal", () => {
    const events: AttendanceEvent[] = [
      {
        ...ev("2026-05-05", "no_show", { sessionType: "personal" }),
        sessionId: "sess-PT",
        bookingId: null,
      },
    ];
    const result = evaluateStudent(events);
    expect(result!.missedBookingIds).toEqual([]);
    expect(result!.missedSessionIds).toEqual(["sess-PT"]);
  });
});

describe("evaluateAll", () => {
  it("agrega múltiplos alunos, ignora os sem risco", () => {
    const map = new Map<string, AttendanceEvent[]>([
      [
        "stu-A",
        [
          { ...ev("2026-05-01", "no_show"), studentId: "stu-A" },
          { ...ev("2026-05-03", "no_show"), studentId: "stu-A" },
        ],
      ],
      [
        "stu-B",
        [{ ...ev("2026-05-05", "present"), studentId: "stu-B" }],
      ],
      [
        "stu-C",
        [
          { ...ev("2026-05-05", "no_show", { sessionType: "personal" }), studentId: "stu-C" },
        ],
      ],
    ]);
    const result = evaluateAll(map);
    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.studentId).sort();
    expect(ids).toEqual(["stu-A", "stu-C"]);
  });
});

describe("isWithinSendWindow", () => {
  const window = { startHour: 9, endHour: 19, daysOfWeek: [1, 2, 3, 4, 5] };

  it("aceita terça às 10h", () => {
    // 2026-05-05 é terça
    const tueAt10 = new Date(2026, 4, 5, 10, 0, 0);
    expect(isWithinSendWindow(tueAt10, window)).toBe(true);
  });

  it("rejeita sábado", () => {
    // 2026-05-09 é sábado
    const sat = new Date(2026, 4, 9, 10, 0, 0);
    expect(isWithinSendWindow(sat, window)).toBe(false);
  });

  it("rejeita 8h (antes do start)", () => {
    const tueAt8 = new Date(2026, 4, 5, 8, 0, 0);
    expect(isWithinSendWindow(tueAt8, window)).toBe(false);
  });

  it("rejeita 19h (fim exclusivo)", () => {
    const tueAt19 = new Date(2026, 4, 5, 19, 0, 0);
    expect(isWithinSendWindow(tueAt19, window)).toBe(false);
  });

  it("aceita 18:59", () => {
    const tueAt1859 = new Date(2026, 4, 5, 18, 59, 0);
    expect(isWithinSendWindow(tueAt1859, window)).toBe(true);
  });
});
