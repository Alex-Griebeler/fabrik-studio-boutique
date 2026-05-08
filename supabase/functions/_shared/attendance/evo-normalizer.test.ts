import { describe, it, expect } from "vitest";
import {
  deriveSessionType,
  evoSourceId,
  findStudentMatch,
  findTrainerMatch,
  normalizeDocument,
  normalizeEmail,
  normalizeEvoEnrollment,
  normalizeInstructorName,
  type StudentRecord,
  type TrainerRecord,
} from "./evo-normalizer";

describe("normalizeEvoEnrollment — flags de ignore", () => {
  it("ignora removed=true mesmo com status=0", () => {
    const r = normalizeEvoEnrollment({ status: 0, removed: true });
    expect(r.status).toBeNull();
    expect(r.reason).toBe("removed");
  });

  it("ignora suspended=true", () => {
    const r = normalizeEvoEnrollment({ status: 1, suspended: true });
    expect(r.status).toBeNull();
    expect(r.reason).toBe("suspended");
  });

  it("ignora replacement=true mesmo com status=0", () => {
    const r = normalizeEvoEnrollment({ status: 0, replacement: true });
    expect(r.status).toBeNull();
    expect(r.reason).toBe("replacement");
  });

  it("flags têm prioridade sobre justifiedAbsence", () => {
    const r = normalizeEvoEnrollment({
      status: 1,
      justifiedAbsence: true,
      removed: true,
    });
    expect(r.status).toBeNull();
    expect(r.reason).toBe("removed");
  });
});

describe("normalizeEvoEnrollment — justifiedAbsence", () => {
  it("justifiedAbsence=true vira cancelled_on_time", () => {
    const r = normalizeEvoEnrollment({ status: 1, justifiedAbsence: true });
    expect(r.status).toBe("cancelled_on_time");
    expect(r.reason).toBe("justified_absence");
  });

  it("justifiedAbsence=true sobrescreve status numérico (mesmo quando seria present)", () => {
    const r = normalizeEvoEnrollment({ status: 0, justifiedAbsence: true });
    expect(r.status).toBe("cancelled_on_time");
  });
});

describe("normalizeEvoEnrollment — status numérico", () => {
  it("status=0 → present", () => {
    const r = normalizeEvoEnrollment({ status: 0 });
    expect(r.status).toBe("present");
    expect(r.reason).toBe("evo_status_0_present");
  });

  it("status=1 → no_show", () => {
    const r = normalizeEvoEnrollment({ status: 1 });
    expect(r.status).toBe("no_show");
    expect(r.reason).toBe("evo_status_1_no_show");
  });

  it("status=2 → ignore (cancelamento sem timestamp)", () => {
    const r = normalizeEvoEnrollment({ status: 2 });
    expect(r.status).toBeNull();
    expect(r.reason).toContain("evo_status_2");
  });
});

describe("normalizeEvoEnrollment — status desconhecido", () => {
  it("status=99 → ignore com warning", () => {
    const r = normalizeEvoEnrollment({ status: 99 });
    expect(r.status).toBeNull();
    expect(r.reason).toBe("evo_status_unknown_99");
  });

  it("status=null → ignore com warning", () => {
    const r = normalizeEvoEnrollment({ status: null });
    expect(r.status).toBeNull();
    expect(r.reason).toContain("unknown");
  });

  it("status=undefined → ignore com warning", () => {
    const r = normalizeEvoEnrollment({ status: undefined });
    expect(r.status).toBeNull();
    expect(r.reason).toContain("unknown");
  });
});

describe("normalizeEvoEnrollment — flags false explícitas", () => {
  it("flags=false não interferem em status válido", () => {
    const r = normalizeEvoEnrollment({
      status: 0,
      removed: false,
      suspended: false,
      replacement: false,
      justifiedAbsence: false,
    });
    expect(r.status).toBe("present");
  });

  it("status=1 com flags=false → no_show normal", () => {
    const r = normalizeEvoEnrollment({
      status: 1,
      removed: false,
      suspended: false,
      replacement: false,
      justifiedAbsence: false,
    });
    expect(r.status).toBe("no_show");
  });
});

describe("deriveSessionType", () => {
  it("capacity=1 → personal", () => {
    expect(deriveSessionType(1)).toBe("personal");
  });

  it("capacity>1 → group", () => {
    expect(deriveSessionType(2)).toBe("group");
    expect(deriveSessionType(8)).toBe("group");
  });

  it("capacity null/undefined → group (fallback seguro)", () => {
    expect(deriveSessionType(null)).toBe("group");
    expect(deriveSessionType(undefined)).toBe("group");
  });

  it("capacity=0 → group (não é personal)", () => {
    expect(deriveSessionType(0)).toBe("group");
  });
});

describe("normalizeDocument", () => {
  it("remove pontuação de CPF formatado", () => {
    expect(normalizeDocument("123.456.789-00")).toBe("12345678900");
  });

  it("preserva CPF sem máscara", () => {
    expect(normalizeDocument("12345678900")).toBe("12345678900");
  });

  it("retorna null pra strings vazias ou whitespace", () => {
    expect(normalizeDocument("")).toBeNull();
    expect(normalizeDocument(null)).toBeNull();
    expect(normalizeDocument(undefined)).toBeNull();
    expect(normalizeDocument("   ")).toBeNull();
  });

  it("remove letras", () => {
    expect(normalizeDocument("abc123def456")).toBe("123456");
  });
});

describe("normalizeEmail", () => {
  it("lowercase e trim", () => {
    expect(normalizeEmail("  ALEX@FABRIKBRASIL.COM  ")).toBe(
      "alex@fabrikbrasil.com",
    );
  });

  it("retorna null pra vazio", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("normalizeInstructorName", () => {
  it("lowercase, trim, colapsa espaços", () => {
    expect(normalizeInstructorName("  JP   da Silva  ")).toBe("jp da silva");
  });

  it("retorna null pra vazio", () => {
    expect(normalizeInstructorName("")).toBeNull();
    expect(normalizeInstructorName(null)).toBeNull();
  });
});

describe("evoSourceId", () => {
  it("formato {sessionId}:{memberId}", () => {
    expect(evoSourceId(17535, 4321)).toBe("17535:4321");
  });

  it("aceita string IDs", () => {
    expect(evoSourceId("abc", "def")).toBe("abc:def");
  });
});

describe("findStudentMatch — match por CPF", () => {
  const students: StudentRecord[] = [
    { id: "stu-A", cpf: "123.456.789-00", email: "alice@test.com" },
    { id: "stu-B", cpf: "98765432100", email: "bob@test.com" },
    { id: "stu-C", cpf: null, email: "no-cpf@test.com" },
  ];

  it("casa CPF cru com CPF formatado no CRM", () => {
    const r = findStudentMatch(
      { idMember: 1, document: "12345678900" },
      students,
    );
    expect(r.studentId).toBe("stu-A");
    expect(r.method).toBe("cpf");
  });

  it("casa CPF formatado EVO com CPF cru CRM", () => {
    const r = findStudentMatch(
      { idMember: 2, document: "987.654.321-00" },
      students,
    );
    expect(r.studentId).toBe("stu-B");
    expect(r.method).toBe("cpf");
  });

  it("aceita campo `cpf` em vez de `document`", () => {
    const r = findStudentMatch({ idMember: 1, cpf: "12345678900" }, students);
    expect(r.method).toBe("cpf");
    expect(r.studentId).toBe("stu-A");
  });

  it("preferência CPF sobre email quando ambos batem", () => {
    const r = findStudentMatch(
      { idMember: 1, document: "98765432100", email: "alice@test.com" },
      students,
    );
    expect(r.method).toBe("cpf");
    expect(r.studentId).toBe("stu-B");
  });
});

describe("findStudentMatch — match por email", () => {
  const students: StudentRecord[] = [
    { id: "stu-A", cpf: "11111111111", email: "alice@test.com" },
    { id: "stu-B", cpf: null, email: "BoB@TEST.com" },
  ];

  it("casa email com case diferente (lowercase normalizado)", () => {
    const r = findStudentMatch(
      { idMember: 1, email: "ALICE@TEST.COM" },
      students,
    );
    expect(r.method).toBe("email");
    expect(r.studentId).toBe("stu-A");
  });

  it("casa email com whitespace e case mistos", () => {
    const r = findStudentMatch(
      { idMember: 2, email: "  bob@test.com  " },
      students,
    );
    expect(r.method).toBe("email");
    expect(r.studentId).toBe("stu-B");
  });

  it("usa email só se CPF não bater", () => {
    const r = findStudentMatch(
      { idMember: 3, document: "99999999999", email: "alice@test.com" },
      students,
    );
    expect(r.method).toBe("email");
    expect(r.studentId).toBe("stu-A");
  });
});

describe("findStudentMatch — unmatched", () => {
  const students: StudentRecord[] = [
    { id: "stu-A", cpf: "11111111111", email: "alice@test.com" },
  ];

  it("retorna unmatched quando não tem CPF nem email", () => {
    const r = findStudentMatch({ idMember: 1 }, students);
    expect(r.method).toBe("unmatched");
    expect(r.studentId).toBeNull();
  });

  it("retorna unmatched quando CPF e email não batem", () => {
    const r = findStudentMatch(
      { idMember: 1, document: "00000000000", email: "x@y.z" },
      students,
    );
    expect(r.method).toBe("unmatched");
    expect(r.studentId).toBeNull();
  });

  it("retorna unmatched quando lista de students é vazia", () => {
    const r = findStudentMatch(
      { idMember: 1, document: "11111111111" },
      [],
    );
    expect(r.method).toBe("unmatched");
    expect(r.studentId).toBeNull();
  });

  it("ignora students com CPF null em busca por CPF", () => {
    const studentsWithNulls: StudentRecord[] = [
      { id: "stu-X", cpf: null, email: null },
    ];
    const r = findStudentMatch(
      { idMember: 1, document: "11111111111" },
      studentsWithNulls,
    );
    expect(r.method).toBe("unmatched");
  });
});

describe("findTrainerMatch", () => {
  const trainers: TrainerRecord[] = [
    { id: "tr-jp", full_name: "JP da Silva" },
    { id: "tr-felipe", full_name: "Felipe   Souza" },
    { id: "tr-raquel", full_name: "Raquel Oliveira" },
  ];

  it("casa por nome exato", () => {
    const r = findTrainerMatch("JP da Silva", trainers);
    expect(r.method).toBe("name");
    expect(r.trainerId).toBe("tr-jp");
  });

  it("casa case-insensitive", () => {
    const r = findTrainerMatch("jp DA silva", trainers);
    expect(r.trainerId).toBe("tr-jp");
  });

  it("colapsa múltiplos espaços", () => {
    const r = findTrainerMatch("Felipe Souza", trainers);
    expect(r.trainerId).toBe("tr-felipe");
  });

  it("trim de leading/trailing whitespace", () => {
    const r = findTrainerMatch("   Raquel Oliveira   ", trainers);
    expect(r.trainerId).toBe("tr-raquel");
  });

  it("retorna unmatched quando não acha", () => {
    const r = findTrainerMatch("Desconhecido", trainers);
    expect(r.method).toBe("unmatched");
    expect(r.trainerId).toBeNull();
  });

  it("retorna unmatched pra null/undefined/vazio", () => {
    expect(findTrainerMatch(null, trainers).method).toBe("unmatched");
    expect(findTrainerMatch(undefined, trainers).method).toBe("unmatched");
    expect(findTrainerMatch("", trainers).method).toBe("unmatched");
    expect(findTrainerMatch("   ", trainers).method).toBe("unmatched");
  });

  it("retorna unmatched com lista vazia de trainers", () => {
    const r = findTrainerMatch("JP da Silva", []);
    expect(r.method).toBe("unmatched");
  });
});
