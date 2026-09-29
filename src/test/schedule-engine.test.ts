import { describe, expect, it } from "vitest";

import { generateSchedule, validateSchedule } from "@/lib/schedule-engine";
import { Acolyte, ScheduleData, VariableRule } from "@/types/schedule";

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
