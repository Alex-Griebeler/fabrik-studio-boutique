import { describe, it, expect } from "vitest";
import {
  alertSignature,
  collapseByDay,
  evaluateStudent,
  evaluateAll,
  isHistoricalDuplicate,
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

  it("mesmo dia: present+no_show → dia vira present (no_show colapsa)", () => {
    // Bug #2: 1 present + 1 no_show no mesmo dia, mais um no_show no dia
    // seguinte. Antes contaria como streak de 2 faltas. Agora o dia
    // 05/05 colapsa em present, sobra só 1 dia-falta (06/05) → NÃO alerta.
    const events = [
      { ...ev("2026-05-05", "present"), startTime: "07:00" },
      { ...ev("2026-05-05", "no_show"), startTime: "18:00" },
      { ...ev("2026-05-06", "no_show"), startTime: "07:00" },
    ];
    expect(evaluateStudent(events)).toBeNull();
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

  it("missedSessionIds aceita UUID puro (formato gravado em attendance_alerts.missed_session_ids uuid[])", () => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const uuidA = "11111111-2222-3333-4444-555555555555";
    const uuidB = "66666666-7777-8888-9999-aaaaaaaaaaaa";
    const events: AttendanceEvent[] = [
      {
        ...ev("2026-05-03", "no_show"),
        sessionId: uuidA,
        bookingId: null,
      },
      {
        ...ev("2026-05-05", "no_show"),
        sessionId: uuidB,
        bookingId: null,
      },
    ];
    const result = evaluateStudent(events);
    expect(result!.missedSessionIds).toEqual([uuidA, uuidB]);
    // garante que cada elemento bate com o formato uuid (sanity pra
    // não regredir e voltar a injetar source_id textual no futuro)
    for (const id of result!.missedSessionIds) {
      expect(id).toMatch(UUID_RE);
    }
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

describe("evaluateStudent — Bug #2: same-day collapse", () => {
  it("2 no_shows no mesmo dia NÃO alertam em grupo (1 dia-falta apenas)", () => {
    // Caso real Christina Aires: HIIT 08:30 + FLOW 08:00 no mesmo dia.
    // Tecnicamente 2 events, mas 1 só dia ruim → não dispara grupo.
    const events = [
      { ...ev("2026-05-01", "present") },
      { ...ev("2026-05-07", "no_show"), startTime: "08:00", modality: "FLOW" },
      { ...ev("2026-05-07", "no_show"), startTime: "08:30", modality: "HIIT" },
    ];
    expect(evaluateStudent(events)).toBeNull();
  });

  it("3 no_shows no mesmo dia ainda contam como 1 dia-falta", () => {
    const events = [
      { ...ev("2026-05-01", "present") },
      { ...ev("2026-05-07", "no_show"), startTime: "07:00" },
      { ...ev("2026-05-07", "no_show"), startTime: "09:00" },
      { ...ev("2026-05-07", "no_show"), startTime: "18:00" },
    ];
    expect(evaluateStudent(events)).toBeNull();
  });

  it("2 no_shows em dias DISTINTOS continuam alertando em grupo", () => {
    const events = [
      { ...ev("2026-05-01", "present") },
      { ...ev("2026-05-06", "no_show") },
      { ...ev("2026-05-07", "no_show") },
    ];
    const result = evaluateStudent(events);
    expect(result).not.toBeNull();
    expect(result!.alertType).toBe("group_2_misses");
    expect(result!.missedDates).toEqual(["2026-05-06", "2026-05-07"]);
  });

  it("dia com no_show + cancelled_late conta como no_show (1 dia-falta)", () => {
    const events = [
      { ...ev("2026-05-01", "present") },
      {
        ...ev("2026-05-07", "no_show"),
        startTime: "07:00",
      },
      {
        ...ev("2026-05-07", "cancelled_late"),
        startTime: "18:00",
      },
    ];
    // Só 1 dia-falta → grupo não alerta
    expect(evaluateStudent(events)).toBeNull();
  });

  it("missedSessionIds preserva TODOS os events dos dias-falta (mesmo colapsados)", () => {
    const events: AttendanceEvent[] = [
      { ...ev("2026-05-01", "present"), sessionId: "sess-present" },
      {
        ...ev("2026-05-06", "no_show"),
        startTime: "08:00",
        sessionId: "sess-06-A",
      },
      {
        ...ev("2026-05-06", "no_show"),
        startTime: "10:00",
        sessionId: "sess-06-B",
      },
      {
        ...ev("2026-05-07", "no_show"),
        sessionId: "sess-07",
      },
    ];
    const result = evaluateStudent(events);
    expect(result).not.toBeNull();
    expect(result!.missedDates).toEqual(["2026-05-06", "2026-05-07"]);
    // 2 events no dia 06 + 1 no dia 07 = 3 sessionIds preservados
    expect(result!.missedSessionIds).toEqual([
      "sess-06-A",
      "sess-06-B",
      "sess-07",
    ]);
  });

  it("PT no mesmo dia ainda alerta (1 dia-falta basta pra personal)", () => {
    const events = [
      { ...ev("2026-05-01", "present", { sessionType: "personal" }) },
      {
        ...ev("2026-05-07", "no_show", { sessionType: "personal" }),
        startTime: "08:00",
      },
      {
        ...ev("2026-05-07", "no_show", { sessionType: "personal" }),
        startTime: "18:00",
      },
    ];
    const result = evaluateStudent(events);
    expect(result).not.toBeNull();
    expect(result!.alertType).toBe("pt_1_miss");
    expect(result!.missedDates).toEqual(["2026-05-07"]);
  });

  it("dia com personal + group no_show → vira pt_1_miss", () => {
    const events = [
      {
        ...ev("2026-05-07", "no_show", { sessionType: "personal" }),
        startTime: "08:00",
      },
      {
        ...ev("2026-05-07", "no_show", { sessionType: "group" }),
        startTime: "18:00",
      },
    ];
    const result = evaluateStudent(events);
    expect(result).not.toBeNull();
    expect(result!.alertType).toBe("pt_1_miss");
  });
});

describe("collapseByDay", () => {
  it("agrupa eventos por data e aplica prioridade present > no_show > cancelled_late", () => {
    const events = [
      ev("2026-05-01", "no_show"),
      { ...ev("2026-05-01", "present"), startTime: "10:00" },
      ev("2026-05-02", "no_show"),
      ev("2026-05-03", "cancelled_late"),
    ];
    const buckets = collapseByDay(events);
    expect(buckets).toHaveLength(3);
    expect(buckets[0]).toMatchObject({ date: "2026-05-01", status: "present" });
    expect(buckets[1]).toMatchObject({ date: "2026-05-02", status: "no_show" });
    expect(buckets[2]).toMatchObject({
      date: "2026-05-03",
      status: "cancelled_late",
    });
  });

  it("preserva events só do status escolhido (descarta os menos prioritários)", () => {
    const events = [
      { ...ev("2026-05-01", "present"), sessionId: "p1" },
      { ...ev("2026-05-01", "no_show"), sessionId: "n1" },
    ];
    const buckets = collapseByDay(events);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].events.map((e) => e.sessionId)).toEqual(["p1"]);
  });

  it("ordena buckets cronologicamente", () => {
    const events = [
      ev("2026-05-10", "no_show"),
      ev("2026-05-01", "no_show"),
      ev("2026-05-05", "no_show"),
    ];
    const dates = collapseByDay(events).map((b) => b.date);
    expect(dates).toEqual(["2026-05-01", "2026-05-05", "2026-05-10"]);
  });
});

describe("alertSignature + isHistoricalDuplicate (Bug #3)", () => {
  it("assinatura é invariante a ordem de missedDates", () => {
    const a = alertSignature({
      alertType: "group_2_misses",
      missedDates: ["2026-05-03", "2026-05-05"],
    });
    const b = alertSignature({
      alertType: "group_2_misses",
      missedDates: ["2026-05-05", "2026-05-03"],
    });
    expect(a).toBe(b);
  });

  it("assinatura distingue alert_type diferente", () => {
    const a = alertSignature({
      alertType: "group_2_misses",
      missedDates: ["2026-05-05"],
    });
    const b = alertSignature({
      alertType: "pt_1_miss",
      missedDates: ["2026-05-05"],
    });
    expect(a).not.toBe(b);
  });

  it("dedupa datas iguais antes de comparar (defensivo)", () => {
    const a = alertSignature({
      alertType: "group_2_misses",
      missedDates: ["2026-05-05", "2026-05-05"],
    });
    const b = alertSignature({
      alertType: "group_2_misses",
      missedDates: ["2026-05-05"],
    });
    expect(a).toBe(b);
  });

  it("isHistoricalDuplicate=true quando mesma assinatura existe no histórico", () => {
    const history = [
      {
        alert_type: "group_2_misses" as const,
        missed_dates: ["2026-05-05", "2026-05-07"],
      },
    ];
    const candidate = {
      alertType: "group_2_misses" as const,
      missedDates: ["2026-05-07", "2026-05-05"], // ordem diferente
    };
    expect(isHistoricalDuplicate(candidate, history)).toBe(true);
  });

  it("isHistoricalDuplicate=false quando datas overlap parcialmente (NÃO é assinatura)", () => {
    // Trava explícita: overlap parcial NÃO conta como duplicata.
    // Alerta novo {05,07,09} vs histórico {05,07} são alertas diferentes
    // (o novo agregou uma data adicional). Não suprimir.
    const history = [
      {
        alert_type: "group_2_misses" as const,
        missed_dates: ["2026-05-05", "2026-05-07"],
      },
    ];
    const candidate = {
      alertType: "group_2_misses" as const,
      missedDates: ["2026-05-05", "2026-05-07", "2026-05-09"],
    };
    expect(isHistoricalDuplicate(candidate, history)).toBe(false);
  });

  it("isHistoricalDuplicate=false quando alert_type diferente, mesmo missed_dates", () => {
    const history = [
      {
        alert_type: "pt_1_miss" as const,
        missed_dates: ["2026-05-05"],
      },
    ];
    const candidate = {
      alertType: "group_2_misses" as const,
      missedDates: ["2026-05-05"],
    };
    expect(isHistoricalDuplicate(candidate, history)).toBe(false);
  });

  it("isHistoricalDuplicate=false com histórico vazio", () => {
    const candidate = {
      alertType: "group_2_misses" as const,
      missedDates: ["2026-05-05", "2026-05-07"],
    };
    expect(isHistoricalDuplicate(candidate, [])).toBe(false);
  });

  it("isHistoricalDuplicate olha múltiplos registros históricos", () => {
    const history = [
      {
        alert_type: "group_2_misses" as const,
        missed_dates: ["2026-04-20", "2026-04-22"],
      },
      {
        alert_type: "group_2_misses" as const,
        missed_dates: ["2026-05-05", "2026-05-07"],
      },
    ];
    const candidate = {
      alertType: "group_2_misses" as const,
      missedDates: ["2026-05-05", "2026-05-07"],
    };
    expect(isHistoricalDuplicate(candidate, history)).toBe(true);
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
