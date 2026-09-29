import {
  Acolyte,
  ScheduleEntry,
  ScheduleSection,
  ScheduleData,
  VariableRule,
  RuleViolation,
  MassSlot,
  SUNDAY_MASSES,
  SATURDAY_MASSES,
  SATURDAY_BIWEEKLY_MASS,
  SATURDAY_HOSPITAL_MASS,
  WEEKDAY_MASSES,
  DEFAULT_SCHEDULE_SETTINGS,
  ScheduleSettings,
} from "@/types/schedule";

// ========== DATE HELPERS ==========

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function isNthDayOfMonth(date: Date, dayOfWeek: number, n: number): boolean {
  if (date.getDay() !== dayOfWeek) return false;
  const d = date.getDate();
  return Math.ceil(d / 7) === n;
}

function getWeekNumber(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function formatDateBR(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${d}/${m}`;
}

// ========== CONFIGURABLE RULES ==========

function mergeSettings(settings?: Partial<ScheduleSettings>): ScheduleSettings {
  return {
    ...DEFAULT_SCHEDULE_SETTINGS,
    ...settings,
    weekendOnlyNames:
      settings?.weekendOnlyNames ?? DEFAULT_SCHEDULE_SETTINGS.weekendOnlyNames,
    weakAcolytes:
      settings?.weakAcolytes ?? DEFAULT_SCHEDULE_SETTINGS.weakAcolytes,
    lowCommitmentNames:
      settings?.lowCommitmentNames ??
      DEFAULT_SCHEDULE_SETTINGS.lowCommitmentNames,
    couples: settings?.couples ?? DEFAULT_SCHEDULE_SETTINGS.couples,
    individualRestrictions:
      settings?.individualRestrictions ??
      DEFAULT_SCHEDULE_SETTINGS.individualRestrictions,
    targetChapelLocationIncludes:
      settings?.targetChapelLocationIncludes ??
      DEFAULT_SCHEDULE_SETTINGS.targetChapelLocationIncludes,
    avoidConsecutiveDays:
      settings?.avoidConsecutiveDays ??
      DEFAULT_SCHEDULE_SETTINGS.avoidConsecutiveDays ??
      true,
  };
}

function locationMatches(location: string, terms: string[] = []): boolean {
  return terms.some((term) => term && location.includes(term));
}

function canServe(
  acolyte: Acolyte,
  entry: { date: string; dayOfWeek: number; location: string; time: string },
  variableRules: VariableRule[],
  isVacation: boolean,
  settings: ScheduleSettings,
): boolean {
  const name = acolyte.name;
  const dow = entry.dayOfWeek;
  const isWeekend = dow === 0 || dow === 6;

  // Vacation-only (Caio, Beatriz)
  if (acolyte.vacation_only && !isVacation) return false;

  // Weekend-only people
  if (settings.weekendOnlyNames.includes(name) && !isWeekend) return false;

  const individualRule = settings.individualRestrictions.find(
    (rule) => rule.name === name,
  );
  if (individualRule) {
    if (individualRule.onlyWeekends && !isWeekend) return false;

    // Restrição de múltiplos dias da semana (ex: Sexta e Domingo [5, 0])
    if (
      individualRule.allowedDaysOfWeek &&
      individualRule.allowedDaysOfWeek.length > 0 &&
      !individualRule.allowedDaysOfWeek.includes(dow)
    ) {
      return false;
    }

    // Retrocompatibilidade se tiver apenas onlyDayOfWeek legado
    if (
      (!individualRule.allowedDaysOfWeek ||
        individualRule.allowedDaysOfWeek.length === 0) &&
      individualRule.onlyDayOfWeek !== undefined &&
      dow !== individualRule.onlyDayOfWeek
    ) {
      return false;
    }
    if (
      individualRule.allowedTimes?.length &&
      !individualRule.allowedTimes.includes(entry.time)
    )
      return false;
    if (
      individualRule.requiredLocationIncludes?.length &&
      !locationMatches(entry.location, individualRule.requiredLocationIncludes)
    )
      return false;
    if (
      individualRule.blockedLocationIncludes?.length &&
      locationMatches(entry.location, individualRule.blockedLocationIncludes)
    )
      return false;
  }

  // Variable rules: unavailable dates
  const acolyteVarRules = variableRules.filter(
    (r) => r.acolyte_id === acolyte.id,
  );
  for (const rule of acolyteVarRules) {
    if (rule.rule_type === "unavailable_date") {
      const dates = rule.rule_data.dates || [];
      if (dates.includes(entry.date)) return false;
    }
  }

  return true;
}

// ========== SCHEDULE GENERATION ==========

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateSchedule(
  year: number,
  month: number,
  acolytes: Acolyte[],
  variableRules: VariableRule[],
  isVacation: boolean = false,
  rawSettings?: Partial<ScheduleSettings>,
): ScheduleData {
  const settings = mergeSettings(rawSettings);
  const days = getDaysInMonth(year, month);
  const activeAcolytes = acolytes.filter((a) => a.active);

  // Track assignments count per acolyte
  const assignmentCount: Record<string, number> = {};
  // Track assigned dates per acolyte (para evitar mesmo dia e dias seguidos)
  const assignedDates: Record<string, Set<string>> = {};

  activeAcolytes.forEach((a) => {
    assignmentCount[a.id] = 0;
    assignedDates[a.id] = new Set();
  });

  // Track last chapel per acolyte (for no-repeat rule)
  const lastWeekendChapel: Record<string, string> = {};

  // Get max assignments from variable rules
  const maxAssignments: Record<string, number> = {};
  variableRules.forEach((r) => {
    if (r.rule_type === "max_assignments" && typeof r.rule_data.max === "number") {
      maxAssignments[r.acolyte_id] = r.rule_data.max;
    }
  });

  const sections: ScheduleSection[] = [];

  function getAdjacentDates(dateStr: string): [string, string] {
    const d = new Date(dateStr + "T12:00:00");
    const prev = new Date(d);
    prev.setDate(prev.getDate() - 1);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    return [formatDate(prev), formatDate(next)];
  }

  function hasConsecutiveDay(acolyteId: string, dateStr: string): boolean {
    const dates = assignedDates[acolyteId];
    if (!dates) return false;
    const [prev, next] = getAdjacentDates(dateStr);
    return dates.has(prev) || dates.has(next);
  }

  function hasSameDay(acolyteId: string, dateStr: string): boolean {
    const dates = assignedDates[acolyteId];
    if (!dates) return false;
    return dates.has(dateStr);
  }

  function blocksConsecutiveDay(acolyteId: string, dateStr: string): boolean {
    return (
      settings.avoidConsecutiveDays !== false &&
      hasConsecutiveDay(acolyteId, dateStr)
    );
  }

  function assignAcolyte(
    a: Acolyte,
    entry: { date: string; location: string; time: string; dayOfWeek: number },
  ) {
    if (!assignedDates[a.id]) assignedDates[a.id] = new Set();
    assignedDates[a.id].add(entry.date);
    assignmentCount[a.id] = (assignmentCount[a.id] || 0) + 1;
    const isWeekend = entry.dayOfWeek === 0 || entry.dayOfWeek === 6;
    if (isWeekend) {
      lastWeekendChapel[a.id] = `${entry.location}|${entry.time}`;
    }
  }

  // Helper to pick acolytes for a slot
  function pickAcolytes(
    entry: { date: string; dayOfWeek: number; location: string; time: string },
    count: number,
    preference?: string, // acolyte name to prefer
  ): string[] {
    const picked: Acolyte[] = [];
    const isWeekend = entry.dayOfWeek === 0 || entry.dayOfWeek === 6;

    const isTargetChapel = locationMatches(
      entry.location,
      settings.targetChapelLocationIncludes,
    );
    if (entry.dayOfWeek === 6 && isTargetChapel) {
      const fixedAcolyte = activeAcolytes.find(
        (a) => a.name === settings.targetChapelAcolyteName,
      );
      if (fixedAcolyte && !picked.some((p) => p.id === fixedAcolyte.id)) {
        picked.push(fixedAcolyte);
        assignAcolyte(fixedAcolyte, entry);
      }
    }

    // Se a missa já tiver atingido as vagas necessárias, encerra aqui
    if (picked.length >= count) {
      return picked.map((a) => a.id);
    }

    // 2. Filtra os elegíveis (removendo quem já foi forçado na etapa anterior)
    const eligible = activeAcolytes.filter((a) => {
      if (picked.some((p) => p.id === a.id)) return false;
      if (!canServe(a, entry, variableRules, isVacation, settings))
        return false;
      if (hasSameDay(a.id, entry.date)) return false; // Evita mais de uma missa no mesmo dia
      if (blocksConsecutiveDay(a.id, entry.date)) return false; // Nunca escala em dias seguidos
      // Check max assignments
      if (
        maxAssignments[a.id] !== undefined &&
        assignmentCount[a.id] >= maxAssignments[a.id]
      )
        return false;
      return true;
    });

    // 3. Ordena os elegíveis para balancear a escala
    const sorted = shuffle(eligible).sort((a, b) => {
      const penaltyA = settings.lowCommitmentNames.includes(a.name)
        ? settings.lowCommitmentPenalty
        : 0;
      const penaltyB = settings.lowCommitmentNames.includes(b.name)
        ? settings.lowCommitmentPenalty
        : 0;

      const scoreA = (assignmentCount[a.id] || 0) + penaltyA;
      const scoreB = (assignmentCount[b.id] || 0) + penaltyB;

      return scoreA - scoreB;
    });

    // 4. Aplica a preferência (ex: Giovana em Santa Tereza)
    if (preference) {
      const prefIdx = sorted.findIndex((a) => a.name === preference);
      if (prefIdx > 0) {
        const [pref] = sorted.splice(prefIdx, 1);
        sorted.unshift(pref);
      }
    }

    // 5. Evita o mesmo local E horário dois fins de semana seguidos
    const locTimeKey = `${entry.location}|${entry.time}`;
    const filtered = isWeekend
      ? sorted
          .filter((a) => lastWeekendChapel[a.id] !== locTimeKey)
          .concat(sorted.filter((a) => lastWeekendChapel[a.id] === locTimeKey))
      : sorted;

    const uniqueFiltered = [
      ...new Map(filtered.map((a) => [a.id, a])).values(),
    ];

    for (const a of uniqueFiltered) {
      if (picked.length >= count) break;
      if (picked.some((p) => p.id === a.id)) continue;

      // Se temos apenas acólitos fracos no final da vaga
      if (count >= 2 && picked.length === count - 1) {
        const allWeak = [...picked, a].every((p) =>
          settings.weakAcolytes.includes(p.name),
        );
        if (allWeak) {
          const strong = uniqueFiltered.find(
            (s) =>
              !settings.weakAcolytes.includes(s.name) &&
              !picked.find((p) => p.id === s.id) &&
              s.id !== a.id,
          );
          if (strong) {
            picked.push(strong);
            assignAcolyte(strong, entry);
            continue;
          }
        }
      }

      // Se faz parte de um casal e a celebração comporta o casal (count >= 2)
      const couple = settings.couples.find(
        ([c1, c2]) => c1 === a.name || c2 === a.name,
      );
      if (couple && count >= 2 && picked.length <= count - 2) {
        const partnerName = couple[0] === a.name ? couple[1] : couple[0];
        const partner = activeAcolytes.find((p) => p.name === partnerName);
        if (
          partner &&
          !picked.some((p) => p.id === partner.id) &&
          canServe(partner, entry, variableRules, isVacation, settings) &&
          !hasSameDay(partner.id, entry.date) &&
          !blocksConsecutiveDay(partner.id, entry.date) &&
          (maxAssignments[partner.id] === undefined ||
            (assignmentCount[partner.id] || 0) < maxAssignments[partner.id])
        ) {
          picked.push(a);
          assignAcolyte(a, entry);
          picked.push(partner);
          assignAcolyte(partner, entry);
          continue;
        }
      }

      picked.push(a);
      assignAcolyte(a, entry);
    }

    return picked.map((a) => a.id);
  }

  const sundayEntries: ScheduleEntry[] = [];
  const saturdayEntries: ScheduleEntry[] = [];
  const weekdayEntries: ScheduleEntry[] = [];

  // Ordena os dias do mês cronologicamente para coordenar sábados e domingos
  const sortedDays = [...days].sort((a, b) => a.getTime() - b.getTime());

  for (const day of sortedDays) {
    const dow = day.getDay();
    const dateStr = formatDate(day);
    const weekNum = getWeekNumber(day);

    // 1. Terças e Quartas
    const weekdayMass = WEEKDAY_MASSES.find((m) => m.dayOfWeek === dow);
    if (weekdayMass) {
      const ids = pickAcolytes(
        {
          date: dateStr,
          dayOfWeek: dow,
          location: weekdayMass.slot.location,
          time: weekdayMass.slot.time,
        },
        weekdayMass.slot.requiredAcolytes,
      );
      weekdayEntries.push({
        date: dateStr,
        dayOfWeek: dow,
        location: weekdayMass.slot.location,
        time: weekdayMass.slot.time,
        acolytes: ids,
      });
    }

    // 2. Sábados
    if (dow === 6) {
      // 2.1 Agissê / São Sebastião (2º e 4º sábados)
      if (weekNum === 2 || weekNum === 4) {
        const ids = pickAcolytes(
          {
            date: dateStr,
            dayOfWeek: 6,
            location: SATURDAY_BIWEEKLY_MASS.location,
            time: SATURDAY_BIWEEKLY_MASS.time,
          },
          SATURDAY_BIWEEKLY_MASS.requiredAcolytes,
          settings.targetChapelAcolyteName,
        );
        saturdayEntries.push({
          date: dateStr,
          dayOfWeek: 6,
          location: SATURDAY_BIWEEKLY_MASS.location,
          time: SATURDAY_BIWEEKLY_MASS.time,
          acolytes: ids,
        });
      }

      // 2.2 Hospital (2º sábado)
      if (weekNum === 2) {
        const ids = pickAcolytes(
          {
            date: dateStr,
            dayOfWeek: 6,
            location: SATURDAY_HOSPITAL_MASS.location,
            time: SATURDAY_HOSPITAL_MASS.time,
          },
          SATURDAY_HOSPITAL_MASS.requiredAcolytes,
        );
        saturdayEntries.push({
          date: dateStr,
          dayOfWeek: 6,
          location: SATURDAY_HOSPITAL_MASS.location,
          time: SATURDAY_HOSPITAL_MASS.time,
          acolytes: ids,
        });
      }

      // 2.3 Missas Regulares de Sábado
      for (const mass of SATURDAY_MASSES) {
        const ids = pickAcolytes(
          {
            date: dateStr,
            dayOfWeek: 6,
            location: mass.location,
            time: mass.time,
          },
          mass.requiredAcolytes,
        );
        saturdayEntries.push({
          date: dateStr,
          dayOfWeek: 6,
          location: mass.location,
          time: mass.time,
          acolytes: ids,
        });
      }
    }

    // 3. Domingos
    if (dow === 0) {
      for (const mass of SUNDAY_MASSES) {
        const preference = mass.location.includes("Santa Ter")
          ? settings.santaTerezaPreferenceName
          : undefined;
        const ids = pickAcolytes(
          {
            date: dateStr,
            dayOfWeek: 0,
            location: mass.location,
            time: mass.time,
          },
          mass.requiredAcolytes,
          preference,
        );
        sundayEntries.push({
          date: dateStr,
          dayOfWeek: 0,
          location: mass.location,
          time: mass.time,
          acolytes: ids,
        });
      }
    }
  }

  sections.push({ title: "Domingos", entries: sundayEntries });
  sections.push({ title: "Sábados", entries: saturdayEntries });
  sections.push({ title: "Dias de Semana", entries: weekdayEntries });

  return { sections };
}

// ========== VALIDATION ==========

function getRequiredAcolytes(entry: ScheduleEntry): number | undefined {
  const matches = (slot: MassSlot) =>
    slot.location === entry.location && slot.time === entry.time;

  const candidates: MassSlot[] =
    entry.dayOfWeek === 0
      ? SUNDAY_MASSES
      : entry.dayOfWeek === 6
        ? [...SATURDAY_MASSES, SATURDAY_BIWEEKLY_MASS, SATURDAY_HOSPITAL_MASS]
        : WEEKDAY_MASSES.filter((m) => m.dayOfWeek === entry.dayOfWeek).map(
            (m) => m.slot,
          );

  return candidates.find(matches)?.requiredAcolytes;
}

export function validateSchedule(
  data: ScheduleData,
  acolytes: Acolyte[],
  variableRules: VariableRule[],
  isVacation: boolean = false,
  rawSettings?: Partial<ScheduleSettings>,
): RuleViolation[] {
  const settings = mergeSettings(rawSettings);
  const violations: RuleViolation[] = [];
  const acolyteMap = new Map(acolytes.map((a) => [a.id, a]));
  const dailyAssignments: Record<string, Record<string, number>> = {};
  const entriesByDate: Record<string, ScheduleEntry[]> = {};
  const acolyteDates: Record<string, string[]> = {};

  // Track assignments
  const assignmentCount: Record<string, number> = {};
  const weekendChapelHistory: Record<
    string,
    { location: string; time: string; date: string }[]
  > = {};

  // Max assignments from variable rules
  const maxAssignments: Record<string, number> = {};
  variableRules.forEach((r) => {
    if (r.rule_type === "max_assignments" && typeof r.rule_data.max === "number") {
      maxAssignments[r.acolyte_id] = r.rule_data.max;
    }
  });

  for (const section of data.sections) {
    for (const entry of section.entries) {
      if (!entriesByDate[entry.date]) entriesByDate[entry.date] = [];
      entriesByDate[entry.date].push(entry);

      for (const acolyteId of entry.acolytes) {
        const acolyte = acolyteMap.get(acolyteId);
        if (!acolyte) continue;

        if (!acolyteDates[acolyteId]) acolyteDates[acolyteId] = [];
        if (!acolyteDates[acolyteId].includes(entry.date)) {
          acolyteDates[acolyteId].push(entry.date);
        }

        assignmentCount[acolyteId] = (assignmentCount[acolyteId] || 0) + 1;

        if (!dailyAssignments[acolyteId]) dailyAssignments[acolyteId] = {};
        dailyAssignments[acolyteId][entry.date] =
          (dailyAssignments[acolyteId][entry.date] || 0) + 1;

        if (dailyAssignments[acolyteId][entry.date] === 2) {
          violations.push({
            type: "warning",
            message: `${acolyte.name} está escalado(a) mais de uma vez no mesmo dia (${formatDateBR(new Date(entry.date + "T12:00:00"))})`,
            entry,
          });
        }
        // Check fixed rules
        if (!canServe(acolyte, entry, variableRules, isVacation, settings)) {
          violations.push({
            type: "error",
            message: `${acolyte.name} não pode servir em ${entry.location} ${entry.time} no dia ${formatDateBR(new Date(entry.date + "T12:00:00"))}`,
            entry,
          });
        }

        // Check weekend chapel repetition
        const isWeekend = entry.dayOfWeek === 0 || entry.dayOfWeek === 6;
        if (isWeekend) {
          const history = weekendChapelHistory[acolyteId] || [];

          const lastSameChapel = history.filter(
            (h) => h.location === entry.location && h.time === entry.time,
          );

          if (lastSameChapel.length > 0) {
            const lastDate = new Date(
              lastSameChapel[lastSameChapel.length - 1].date,
            );
            const thisDate = new Date(entry.date);
            const diffDays =
              (thisDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);

            // Ignorar o aviso se for a Maria Anália em suas capelas fixas
            const isMariaFixed =
              acolyte.name === settings.targetChapelAcolyteName &&
              locationMatches(
                entry.location,
                settings.targetChapelLocationIncludes,
              );

            if (diffDays <= 7 && !isMariaFixed) {
              violations.push({
                type: "warning",
                message: `${acolyte.name} está repetindo ${entry.location} às ${entry.time} em fins de semana seguidos`,
                entry,
              });
            }
          }
          if (!weekendChapelHistory[acolyteId])
            weekendChapelHistory[acolyteId] = [];

          weekendChapelHistory[acolyteId].push({
            location: entry.location,
            time: entry.time,
            date: entry.date,
          });
        }
      }

      // Check missing acolytes
      const required = getRequiredAcolytes(entry);
      if (required !== undefined && entry.acolytes.length < required) {
        const missing = required - entry.acolytes.length;
        violations.push({
          type: "warning",
          message: `Faltando ${missing} acólito(s) em ${entry.location} ${entry.time} (${formatDateBR(new Date(entry.date + "T12:00:00"))})`,
          entry,
        });
      }

      // Check weak acolytes together
      if (entry.acolytes.length >= 2) {
        const allWeak = entry.acolytes.every((id) => {
          const a = acolyteMap.get(id);
          return a && settings.weakAcolytes.includes(a.name);
        });
        if (allWeak) {
          violations.push({
            type: "warning",
            message: `Somente acólitos com dificuldades juntos em ${entry.location} ${entry.time} (${formatDateBR(new Date(entry.date + "T12:00:00"))})`,
            entry,
          });
        }
      }

      // Check single weak acolyte alone
      if (entry.acolytes.length === 1) {
        const a = acolyteMap.get(entry.acolytes[0]);
        if (a && settings.weakAcolytes.includes(a.name)) {
          violations.push({
            type: "warning",
            message: `${a.name} (Acólito com dificuldade) está sozinho(a) em ${entry.location} ${entry.time} (${formatDateBR(new Date(entry.date + "T12:00:00"))})`,
            entry,
          });
        }
      }
    }
  }

  // Validação de Dias Consecutivos (ex: Sábado e Domingo)
  if (settings.avoidConsecutiveDays !== false) {
    for (const [acolyteId, dates] of Object.entries(acolyteDates)) {
      const acolyte = acolyteMap.get(acolyteId);
      if (!acolyte) continue;

      const sortedDates = [...dates].sort();
      for (let i = 0; i < sortedDates.length - 1; i++) {
        const d1 = new Date(sortedDates[i] + "T12:00:00");
        const d2 = new Date(sortedDates[i + 1] + "T12:00:00");
        const diffDays = Math.round(
          (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diffDays === 1) {
          const entryD2 = Object.values(entriesByDate)
            .flat()
            .find(
              (e) =>
                e.date === sortedDates[i + 1] && e.acolytes.includes(acolyteId),
            );

          violations.push({
            type: "error",
            message: `${acolyte.name} está escalado(a) em dias seguidos (${formatDateBR(d1)} e ${formatDateBR(d2)})`,
            entry: entryD2,
          });
        }
      }
    }
  }

  for (const [date, entries] of Object.entries(entriesByDate)) {
    for (const [firstName, secondName] of settings.couples) {
      const first = acolytes.find((a) => a.name === firstName);
      const second = acolytes.find((a) => a.name === secondName);
      if (!first || !second) continue;

      const firstEntries = entries.filter((entry) =>
        entry.acolytes.includes(first.id),
      );
      const secondEntries = entries.filter((entry) =>
        entry.acolytes.includes(second.id),
      );

      if (firstEntries.length === 0 || secondEntries.length === 0) continue;

      const servedTogether = entries.some(
        (entry) =>
          entry.acolytes.includes(first.id) &&
          entry.acolytes.includes(second.id),
      );

      if (!servedTogether) {
        violations.push({
          type: "warning",
          message: `${firstName} e ${secondName} estão no mesmo dia (${formatDateBR(new Date(date + "T12:00:00"))}), mas não na mesma missa`,
          entry: firstEntries[0],
        });
      }
    }
  }

  // Check max assignments
  for (const [acolyteId, max] of Object.entries(maxAssignments)) {
    const count = assignmentCount[acolyteId] || 0;
    if (count > max) {
      const a = acolyteMap.get(acolyteId);
      violations.push({
        type: "error",
        message: `${a?.name || "Acólito"} tem ${count} escalas (máximo definido: ${max})`,
      });
    }
  }

  return violations;
}
