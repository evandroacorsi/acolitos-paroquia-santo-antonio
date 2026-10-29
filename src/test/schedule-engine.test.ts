import { describe, expect, it } from "vitest";

import { generateSchedule, validateSchedule } from "@/lib/schedule-engine";
import {
  Acolyte,
  CustomMass,
  ScheduleData,
  VariableRule,
} from "@/types/schedule";

const names = [
  "Maria Anália",
  "Evandro",
  "Allana",
  "Fernanda",
  "Gustavo Dellatorre",
  "Yara",
  "Giovana",
  "Paulo Ricardo",
  "Ana Júlia",
  "Erik",
  "Maria Eduarda",
  "Maria Parra",
];

const acolytes: Acolyte[] = names.map((name, i) => ({
  id: String(i + 1),
  name,
  active: true,
  vacation_only: false,
}));

function allEntries(data: ScheduleData) {
  return data.sections.flatMap((s) => s.entries);
}

describe("generateSchedule", () => {
  it("respects a max_assignments rule of 0", () => {
    const rules: VariableRule[] = [
      {
        id: "r1",
        acolyte_id: "2",
        rule_type: "max_assignments",
        rule_data: { max: 0 },
      },
    ];

    for (let i = 0; i < 20; i++) {
      const data = generateSchedule(2026, 10, acolytes, rules);
      const count = allEntries(data).filter((e) =>
        e.acolytes.includes("2"),
      ).length;
      expect(count).toBe(0);
    }
  });

  it("never schedules an acolyte on consecutive days", () => {
    for (let i = 0; i < 20; i++) {
      const data = generateSchedule(2026, 10, acolytes, []);
      const datesById: Record<string, string[]> = {};
      for (const entry of allEntries(data)) {
        for (const id of entry.acolytes) {
          (datesById[id] ??= []).push(entry.date);
        }
      }

      for (const [id, dates] of Object.entries(datesById)) {
        const days = dates
          .map((d) => new Date(d + "T12:00:00").getTime())
          .sort((a, b) => a - b);
        for (let j = 1; j < days.length; j++) {
          const diff = Math.round((days[j] - days[j - 1]) / 86_400_000);
          expect(diff, `acólito ${id} em dias seguidos`).toBeGreaterThan(1);
        }
      }
    }
  });
});

describe("custom masses", () => {
  const thursdayNoon: CustomMass = {
    id: "qui-12h",
    dayOfWeek: 4,
    time: "12h",
    location: "Salão Paroquial",
    requiredAcolytes: 1,
  };

  it("schedules a custom mass on every matching weekday of the month", () => {
    const data = generateSchedule(2026, 10, acolytes, [], false, {
      customMasses: [thursdayNoon],
    });
    const entries = allEntries(data).filter(
      (e) => e.dayOfWeek === 4 && e.time === "12h",
    );
    // Outubro/2026 tem quintas nos dias 1, 8, 15, 22 e 29
    expect(entries.map((e) => e.date)).toEqual([
      "2026-10-01",
      "2026-10-08",
      "2026-10-15",
      "2026-10-22",
      "2026-10-29",
    ]);
    expect(entries.every((e) => e.acolytes.length === 1)).toBe(true);
  });

  it("brings back the Friday 15h mass by default", () => {
    const data = generateSchedule(2026, 10, acolytes, []);
    const fridays = allEntries(data).filter(
      (e) =>
        e.dayOfWeek === 5 &&
        e.time === "15h" &&
        e.location === "Salão Paroquial",
    );
    expect(fridays.map((e) => e.date)).toEqual([
      "2026-10-02",
      "2026-10-09",
      "2026-10-16",
      "2026-10-23",
      "2026-10-30",
    ]);
  });

  it("generates nothing extra when the list is empty", () => {
    const data = generateSchedule(2026, 10, acolytes, [], false, {
      customMasses: [],
    });
    expect(allEntries(data).some((e) => e.dayOfWeek === 5)).toBe(false);
  });

  it("puts weekend custom masses in the weekend sections", () => {
    const data = generateSchedule(2026, 10, acolytes, [], false, {
      customMasses: [{ ...thursdayNoon, id: "dom-11h", dayOfWeek: 0, time: "11h" }],
    });
    const sunday = data.sections.find((s) => s.title === "Domingos")!;
    expect(sunday.entries.some((e) => e.time === "11h")).toBe(true);
  });

  it("warns when a custom mass is missing acolytes", () => {
    const data: ScheduleData = {
      sections: [
        {
          title: "Dias de Semana",
          entries: [
            {
              date: "2026-10-01",
              dayOfWeek: 4,
              location: "Salão Paroquial",
              time: "12h",
              acolytes: [],
            },
          ],
        },
      ],
    };

    const violations = validateSchedule(data, acolytes, [], false, {
      customMasses: [thursdayNoon],
    });
    expect(violations.some((v) => v.message.startsWith("Faltando 1"))).toBe(
      true,
    );
  });
});

describe("validateSchedule", () => {
  it("warns when a mass is missing acolytes", () => {
    const data: ScheduleData = {
      sections: [
        {
          title: "Domingos",
          entries: [
            {
              date: "2026-10-04",
              dayOfWeek: 0,
              location: "Salão Paroquial",
              time: "9h30",
              acolytes: ["2"],
            },
          ],
        },
      ],
    };

    const violations = validateSchedule(data, acolytes, []);
    expect(violations.some((v) => v.message.startsWith("Faltando 1"))).toBe(
      true,
    );
  });

  it("flags consecutive days as an error", () => {
    const data: ScheduleData = {
      sections: [
        {
          title: "Fim de semana",
          entries: [
            {
              date: "2026-10-03",
              dayOfWeek: 6,
              location: "São Judas Tadeu",
              time: "18h",
              acolytes: ["4", "5"],
            },
            {
              date: "2026-10-04",
              dayOfWeek: 0,
              location: "Salão Paroquial",
              time: "9h30",
              acolytes: ["4", "5"],
            },
          ],
        },
      ],
    };

    const violations = validateSchedule(data, acolytes, []);
    const consecutive = violations.filter((v) =>
      v.message.includes("dias seguidos"),
    );
    expect(consecutive.length).toBeGreaterThan(0);
    expect(consecutive.every((v) => v.type === "error")).toBe(true);
  });
});
