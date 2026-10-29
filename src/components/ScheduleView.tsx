import { ScheduleData, MONTH_NAMES, Acolyte } from "@/types/schedule";
import { useState, useRef, useMemo, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { toPng, toJpeg } from "html-to-image";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Download,
  FileImage,
  FileText,
  Users,
  Plus,
  ArrowLeftRight,
  Trash2,
  Sparkles,
  Calendar,
  Church,
  Search,
  Check,
  X,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import Swal from "sweetalert2";

interface ScheduleViewProps {
  data: ScheduleData;
  month: number;
  year: number;
  acolytes: Acolyte[];
  onUpdate?: (newData: ScheduleData) => void;
}

// Mapeamento dos dias da semana
const DAY_NAMES = [
  "DOMINGO",
  "SEGUNDA-FEIRA",
  "TERÇA-FEIRA",
  "QUARTA-FEIRA",
  "QUINTA-FEIRA",
  "SEXTA-FEIRA",
  "SÁBADO",
];

// Helper para formatar a data (DD/MM)
function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

// Helper robusto para formatar o horário (ex: "07:00" -> "7h", "19:30" -> "19h30")
function formatTimeSafe(time: string): string {
  if (!time) return "";

  // Se o horário tiver ":", tentamos formatar para o padrão "7h30"
  if (time.includes(":")) {
    const [h, m] = time.split(":");
    const hours = parseInt(h, 10);
    const minutes = parseInt(m, 10);

    if (isNaN(hours)) return time; // Se falhar, retorna o original
    if (isNaN(minutes) || minutes === 0) return `${hours}h`; // "07:00" -> "7h"

    return `${hours}h${minutes.toString().padStart(2, "0")}`; // "07:30" -> "7h30"
  }

  // Se já vier formatado do banco ou for um texto livre, mantém como está
  return time;
}

// Helper para gerar o display do Local e Horário
function formatLocationAndTime(location: string, time: string): string {
  return `${location}, às ${formatTimeSafe(time)}`;
}
export default function ScheduleView({
  data,
  month,
  year,
  acolytes,
  onUpdate,
}: ScheduleViewProps) {
  const acolyteMap = new Map(acolytes.map((a) => [a.id, a.name]));
  const [hoveredAcolyte, setHoveredAcolyte] = useState<string | null>(null);
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");
  const scheduleRef = useRef<HTMLDivElement>(null);
  const touchTimeout = useRef<NodeJS.Timeout | null>(null);
  const getName = (id: string) => acolyteMap.get(id) || id;

  // Lógica de exportação para Imagem (JPEG)
  const downloadImage = async () => {
    if (!scheduleRef.current) return;

    try {
      setIsExporting(true);

      // ⏳ espera o React aplicar as classes
      await new Promise((r) => setTimeout(r, 150));

      const dataUrl = await toJpeg(scheduleRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });

      const link = document.createElement("a");
      link.download = `escala-${month}-${year}.jpg`;
      link.href = dataUrl;
      link.click();
      Swal.fire({
        position: "center",
        icon: "success",
        title: "Imagem gerada com sucesso!",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
    } catch (err) {
      console.error("Erro ao gerar imagem:", err);
    } finally {
      setIsExporting(false);
    }
  };

  // Lógica de exportação para PDF
  const downloadPDF = async () => {
    if (!scheduleRef.current) return;

    try {
      setIsExporting(true);

      const dataUrl = await toPng(scheduleRef.current, {
        pixelRatio: 2, // Aumenta a qualidade no PDF
        backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(dataUrl, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`escala-acolitos-${month}-${year}.pdf`);
      Swal.fire({
        position: "center",
        icon: "success",
        title: "Arquivo PDF gerado com sucesso!",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
      setIsExporting(false);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
    }
  };

  // 1. Coletar todas as entradas
  // Usamos any aqui para evitar erro de tipagem caso ScheduleEntry não esteja exportado
  const allEntries: any[] = data.sections.flatMap((s, sIdx) =>
    s.entries.map((e, eIdx) => ({
      ...e,
      sectionIdx: sIdx,
      entryIdx: eIdx,
    })),
  );

  const acolyteCount = new Map<string, number>();
  allEntries.forEach((entry) => {
    entry.acolytes.forEach((id: string) => {
      acolyteCount.set(id, (acolyteCount.get(id) || 0) + 1);
    });
  });

  const acolyteStats = Array.from(acolyteCount.entries())
    .map(([id, count]) => ({ name: getName(id), count }))
    .sort((a, b) => b.count - a.count);

  // 2. Extrair todas as datas únicas e ordená-las
  const uniqueDates = [...new Set(allEntries.map((e) => e.date))].sort();

  const uniqueLocTimeCombos = allEntries.reduce((acc, entry, index) => {
    const key = `${entry.dayOfWeek}|${entry.location}|${entry.time}`;
    if (!acc.has(key)) {
      acc.set(key, {
        display: formatLocationAndTime(entry.location, entry.time),
        location: entry.location,
        time: entry.time,
        timeSort: entry.time,
        dayOfWeek: entry.dayOfWeek,
        sectionIdx: entry.sectionIdx,
        firstSeenIndex: index,
        count: 1,
      });
    } else {
      acc.get(key)!.count += 1;
    }
    return acc;
  }, new Map<string, { display: string; location: string; time: string; timeSort: string; dayOfWeek: number; sectionIdx: number; firstSeenIndex: number; count: number }>());

  const sortedLocTimeKeys = Array.from(uniqueLocTimeCombos.keys()).sort(
    (a, b) => {
      const aData = uniqueLocTimeCombos.get(a)!;
      const bData = uniqueLocTimeCombos.get(b)!;
      const getPriority = (data: (typeof aData)) => {
        if (data.dayOfWeek !== 6) return 100;
        if (data.location.includes("Agissê")) return 1;
        if (data.location.includes("São Judas")) return 0;
        return 10;
      };

      const priorityA = getPriority(aData);
      const priorityB = getPriority(bData);

      if (priorityA !== priorityB) return priorityA - priorityB;
      return aData.firstSeenIndex - bData.firstSeenIndex;
    },
  );

  const grid = new Map<string, Map<string, string>>();
  allEntries.forEach((entry) => {
    const locTimeKey = `${entry.dayOfWeek}|${entry.location}|${entry.time}`;
    if (!grid.has(entry.date)) grid.set(entry.date, new Map());
    const acolytesList = entry.acolytes.map(getName).join(" / ");
    grid.get(entry.date)!.set(locTimeKey, acolytesList || "—");
  });

  const allDaysOfWeek = [0, 6, 1, 2, 3, 4, 5];
  const [search, setSearch] = useState("");

  const matchesSearch = (entry: any) => {
    if (!search.trim()) return true;
    const searchLower = search.toLowerCase();
    const hasName = entry.acolytes.some((id: string) =>
      getName(id).toLowerCase().includes(searchLower),
    );
    const hasSolemnity = (entry.solemnityName || "")
      .toLowerCase()
      .includes(searchLower);
    const hasRole = Object.values(entry.acolyteRoles || {}).some((role: any) =>
      String(role).toLowerCase().includes(searchLower),
    );

    return hasName || hasSolemnity || hasRole;
  };

  const [isExporting, setIsExporting] = useState(false);

  // =======================================================================
  // 2. Lógica de Alteração e Remoção (Modal e Atualização do Data)
  // =======================================================================
  const upsertEntry = (
    sectionIdx: number,
    entryIdx: number | undefined,
    entryTemplate: any,
    updates: Partial<any>,
  ) => {
    if (!onUpdate) return;

    const newData = {
      ...data,
      sections: data.sections.map((section, sIdx) => {
        if (sIdx !== sectionIdx) return section;

        return {
          ...section,
          entries:
            entryIdx === undefined
              ? [
                  ...section.entries,
                  {
                    date: entryTemplate.date,
                    dayOfWeek: entryTemplate.dayOfWeek,
                    location: entryTemplate.location,
                    time: entryTemplate.time,
                    acolytes: entryTemplate.acolytes || [],
                    isSolemn: entryTemplate.isSolemn || false,
                    solemnityName: entryTemplate.solemnityName || "",
                    acolyteRoles: entryTemplate.acolyteRoles || {},
                    ...updates,
                  },
                ]
              : section.entries.map((entry, eIdx) =>
                  eIdx === entryIdx ? { ...entry, ...updates } : entry,
                ),
        };
      }),
    };

    onUpdate(newData);
  };

  const updateEntryAcolytes = (
    sectionIdx: number,
    entryIdx: number | undefined,
    entryTemplate: any,
    newAcolytes: string[],
  ) => {
    const filteredRoles = Object.fromEntries(
      Object.entries(entryTemplate.acolyteRoles || {}).filter(([id]) =>
        newAcolytes.includes(id),
      ),
    );
    upsertEntry(sectionIdx, entryIdx, entryTemplate, {
      acolytes: newAcolytes,
      acolyteRoles: filteredRoles,
    });
  };

  const clearTouchTimeout = () => {
    if (touchTimeout.current) clearTimeout(touchTimeout.current);
  };

  // =======================================================================
  // Lógica Unificada de Gerenciamento da Célula (Modal Moderno)
  // =======================================================================
  const [managingEntry, setManagingEntry] = useState<any | null>(null);

  const manageCell = (entry: any) => {
    if (!isAdminRoute || !entry) return;
    setManagingEntry(entry);
  };

  const handleSaveSlot = (updates: {
    acolytes: string[];
    isSolemn: boolean;
    solemnityName: string;
    acolyteRoles: Record<string, string>;
  }) => {
    if (!managingEntry) return;
    upsertEntry(
      managingEntry.sectionIdx,
      managingEntry.entryIdx,
      managingEntry,
      updates,
    );
    setManagingEntry(null);
  };

  return (
    <div className="space-y-8">
      {/* Botões de Exportação - Visíveis apenas se houver dados */}

      {data && isAdminRoute && (
        <div className="flex flex-wrap justify-end gap-2 mb-4 no-print">
          <Button
            variant="outline"
            size="sm"
            onClick={downloadImage}
            className="w-full gap-2 sm:w-auto"
          >
            <FileImage className="h-4 w-4" /> Exportar JPEG
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadPDF}
            className="w-full gap-2 sm:w-auto"
          >
            <FileText className="h-4 w-4" /> Exportar PDF
          </Button>
        </div>
      )}

      <div
        ref={scheduleRef}
        className="bg-background rounded-lg px-0 sm:px-4 md:pb-20 md:px-20"
      >
        {isAdminRoute && (
          <div className="text-center space-y-2">
            <div className="inline-block border-b-2 border-accent pb-2">
              <h1 className="text-2xl md:text-3xl font-heading font-semibold tracking-wide text-foreground">
                Escala de Acólitos
              </h1>
            </div>
            <p className="text-lg font-heading text-accent">
              {MONTH_NAMES[month - 1]} de {year}
            </p>
            <p className="text-sm text-muted-foreground pb-4">
              Paróquia Santo Antônio — Rancharia/SP
            </p>
          </div>
        )}
        {!isExporting && (
          <div className="mb-4">
            <input
              type="text"
              placeholder="Digite o nome do acólito..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        )}
        {/* Loop dinâmico para renderizar as tabelas de cada dia da semana */}
        {allDaysOfWeek.map((dayIndex) => {
          // Filtra as datas que caem neste dia da semana
          const datesForDay = uniqueDates.filter((date) => {
            const isSameDay =
              new Date(date + "T12:00:00").getDay() === dayIndex;

            if (!isSameDay) return false;

            // verifica se existe pelo menos uma escala com o nome buscado nesse dia
            const hasMatch = allEntries.some(
              (entry) => entry.date === date && matchesSearch(entry),
            );

            return hasMatch;
          });

          // Se não houver escala para este dia na semana, pula a renderização
          if (datesForDay.length === 0) return null;

          // Filtra as linhas (Local/Horário) que pertencem a este dia
          const keysForDay = sortedLocTimeKeys.filter(
            (key) => uniqueLocTimeCombos.get(key)!.dayOfWeek === dayIndex,
          );

          return (
            <div key={dayIndex} className="space-y-3 pb-6">
                <div
                  className={`border border-border/70 rounded-md bg-card shadow-inner ${
                    isExporting
                      ? "overflow-visible [&::-webkit-scrollbar]:hidden"
                      : "overflow-x-auto"
                  }`}
                >
                <table className="w-full table-fixed border-collapse text-[10px] leading-tight sm:text-xs md:text-sm">
                  <thead>
                    {/* Título da Seção (ex: TERÇA-FEIRA) */}
                    <tr>
                      <th
                        colSpan={datesForDay.length + 1}
                        className="font-bold text-center py-3 bg-muted/60 text-foreground border border-border"
                      >
                        {DAY_NAMES[dayIndex]}
                      </th>
                    </tr>
                    {/* Cabeçalhos das Colunas (Datas) */}
                    <tr className="border border-border">
                      <th className="w-[5.5rem] break-words bg-muted/30 px-1.5 py-2 text-left font-semibold text-muted-foreground sm:w-40 sm:px-3 md:w-48 border-r border-border">
                        Local/Horário
                      </th>
                      {datesForDay.map((date) => (
                        <th
                          key={date}
                          className="break-words bg-muted/30 px-1 py-2 text-center font-semibold text-muted-foreground sm:px-3 border-r border-border last:border-r-0"
                        >
                          {formatDateBR(date)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Linhas de Local + Horário */}
                    {keysForDay.map((key) => {
                      const locTimeData = uniqueLocTimeCombos.get(key)!;
                      return (
                        <tr
                          key={key}
                          className="border border-border hover:bg-secondary/20 transition-colors"
                        >
                          <td className="break-words border-r border-border px-1.5 py-2 text-left font-medium text-foreground sm:px-3 sm:py-3">
                            {locTimeData.display}
                          </td>
                          {/* Células com os nomes dos Acólitos */}
                          {datesForDay.map((date) => {
                            const isHighlighted =
                              hoveredAcolyte &&
                              grid
                                .get(date)
                                ?.get(key)
                                ?.includes(
                                  acolyteMap.get(hoveredAcolyte) || "",
                                );
                            const entry = allEntries.find(
                              (e) =>
                                e.date === date &&
                                `${e.dayOfWeek}|${e.location}|${e.time}` ===
                                  key,
                            );
                            const editableEntry =
                              entry ||
                              (isAdminRoute
                                ? {
                                    date,
                                    dayOfWeek: dayIndex,
                                    location: locTimeData.location,
                                    time: locTimeData.time,
                                    acolytes: [],
                                    isSolemn: false,
                                    solemnityName: "",
                                    acolyteRoles: {},
                                    sectionIdx: locTimeData.sectionIdx,
                                    entryIdx: undefined,
                                  }
                                : null);

                            return (
                              <td
                                key={date}
                                onClick={() => {
                                  if (!isAdminRoute || !editableEntry) return;
                                  manageCell(editableEntry);
                                }}
                                onContextMenu={(e) => {
                                  if (!isAdminRoute || !editableEntry) return;
                                  e.preventDefault();
                                  manageCell(editableEntry);
                                }}
                                onTouchStart={() => {
                                  if (!isAdminRoute || !editableEntry) return;
                                  touchTimeout.current = setTimeout(() => {
                                    manageCell(editableEntry);
                                  }, 500);
                                }}
                                onTouchEnd={clearTouchTimeout}
                                onTouchMove={clearTouchTimeout}
                                title={
                                  isAdminRoute && editableEntry
                                    ? "Clique para gerenciar os acólitos desta missa"
                                    : ""
                                }
                                className={`break-words border-r border-border px-1.5 py-2 text-center last:border-r-0 sm:px-3 sm:py-3 whitespace-pre-wrap transition-colors ${
                                  entry?.isSolemn
                                    ? "bg-amber-100/70 text-foreground"
                                    : isHighlighted
                                      ? "bg-yellow-200/40 text-foreground font-semibold"
                                      : "text-muted-foreground"
                                } ${isAdminRoute && editableEntry ? "hover:bg-accent/20 cursor-pointer" : ""}`}
                              >
                                {(() => {
                                  // Se a escala não existir ou estiver vazia
                                  if (
                                    !entry ||
                                    !entry.acolytes?.length ||
                                    !matchesSearch(entry)
                                  ) {
                                    return (
                                      <div className="flex min-w-0 flex-col items-center gap-1">
                                        {entry?.isSolemn && (
                                          <div className="max-w-full break-words text-[9px] font-semibold uppercase tracking-wide text-amber-700 sm:text-[11px]">
                                            {entry.solemnityName?.trim() ||
                                              "Missa solene"}
                                          </div>
                                        )}
                                        <span className="text-muted-foreground/50 italic">
                                          —
                                        </span>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div className="flex min-w-0 flex-col items-center gap-1">
                                      {entry.isSolemn && (
                                        <div className="max-w-full break-words text-[9px] font-semibold uppercase tracking-wide text-amber-700 sm:text-[11px]">
                                          {entry.solemnityName?.trim() ||
                                            "Missa solene"}
                                        </div>
                                      )}
                                      {entry.acolytes.map(
                                        (id: string, index: number) => {
                                          const name = getName(id);
                                          const count =
                                            acolyteCount.get(id) || 0;
                                          const role =
                                            entry.acolyteRoles?.[id]?.trim();

                                          return (
                                            <div
                                              key={id}
                                              className="flex min-w-0 max-w-full flex-col items-center"
                                            >
                                              {/* Nome */}

                                              <span
                                                title={`${name} está em ${count} escala${count > 1 ? "s" : ""}`}
                                                className="max-w-full break-words font-bold hover:underline cursor-help"
                                                onMouseEnter={() =>
                                                  setHoveredAcolyte(id)
                                                }
                                                onMouseLeave={() =>
                                                  setHoveredAcolyte(null)
                                                }
                                              >
                                                {name}
                                              </span>
                                              {entry.isSolemn && role && (
                                                <span className="max-w-full break-words text-[9px] font-medium text-muted-foreground sm:text-[11px]">
                                                  {role}
                                                </span>
                                              )}

                                              {/* Separador (se não for o último) */}
                                              {index <
                                                entry.acolytes.length - 1 && (
                                                <span className="text-muted-foreground opacity-60">
                                                  |
                                                </span>
                                              )}
                                            </div>
                                          );
                                        },
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                            );
                          })}{" "}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
      {isAdminRoute && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">
            Quantidade de Escalas por Acólito
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {acolyteStats.map((a) => (
              <div
                key={a.name}
                className="border rounded-md p-3 bg-muted/30 text-sm"
              >
                <p className="font-medium text-foreground">{a.name}</p>
                <p className="text-muted-foreground">
                  {a.count} escala{a.count > 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Moderno de Gerenciamento da Missa/Célula */}
      {isAdminRoute && (
        <SlotManagerDialog
          isOpen={!!managingEntry}
          onClose={() => setManagingEntry(null)}
          entry={managingEntry}
          acolytes={acolytes}
          getName={getName}
          onSave={handleSaveSlot}
        />
      )}
    </div>
  );
}

interface SlotManagerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entry: any;
  acolytes: Acolyte[];
  getName: (id: string) => string;
  onSave: (updates: {
    acolytes: string[];
    isSolemn: boolean;
    solemnityName: string;
    acolyteRoles: Record<string, string>;
  }) => void;
}

function SlotManagerDialog({
  isOpen,
  onClose,
  entry,
  acolytes,
  getName,
  onSave,
}: SlotManagerDialogProps) {
  if (!entry) return null;

  const [currentAcolytes, setCurrentAcolytes] = useState<string[]>(
    entry.acolytes || [],
  );
  const [isSolemn, setIsSolemn] = useState<boolean>(entry.isSolemn || false);
  const [solemnityName, setSolemnityName] = useState<string>(
    entry.solemnityName || "",
  );
  const [roles, setRoles] = useState<Record<string, string>>(
    entry.acolyteRoles || {},
  );

  const [substitutingId, setSubstitutingId] = useState<string | null>(null);
  const [searchSubstitute, setSearchSubstitute] = useState("");
  const [searchAdd, setSearchAdd] = useState("");
  const [isAddingOpen, setIsAddingOpen] = useState(false);

  // Sincronizar estado inicial quando a entrada abrir
  useEffect(() => {
    if (entry) {
      setCurrentAcolytes(entry.acolytes || []);
      setIsSolemn(entry.isSolemn || false);
      setSolemnityName(entry.solemnityName || "");
      setRoles(entry.acolyteRoles || {});
      setSubstitutingId(null);
      setSearchSubstitute("");
      setSearchAdd("");
      setIsAddingOpen(false);
    }
  }, [entry, isOpen]);

  // Lista de acólitos disponíveis para adicionar (apenas ativos que ainda não estão nesta missa)
  const availableToAdd = useMemo(() => {
    return acolytes
      .filter((a) => a.active && !currentAcolytes.includes(a.id))
      .filter((a) =>
        a.name.toLowerCase().includes(searchAdd.trim().toLowerCase()),
      );
  }, [acolytes, currentAcolytes, searchAdd]);

  // Lista de acólitos disponíveis para substituição
  const availableToSubstitute = useMemo(() => {
    return acolytes
      .filter((a) => a.active && !currentAcolytes.includes(a.id))
      .filter((a) =>
        a.name.toLowerCase().includes(searchSubstitute.trim().toLowerCase()),
      );
  }, [acolytes, currentAcolytes, searchSubstitute]);

  const handleAddAcolyte = (id: string) => {
    setCurrentAcolytes((prev) => [...prev, id]);
    setSearchAdd("");
    setIsAddingOpen(false);
  };

  const handleRemoveAcolyte = (id: string) => {
    setCurrentAcolytes((prev) => prev.filter((aId) => aId !== id));
    setRoles((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (substitutingId === id) setSubstitutingId(null);
  };

  const handleSubstitute = (oldId: string, newId: string) => {
    setCurrentAcolytes((prev) =>
      prev.map((aId) => (aId === oldId ? newId : aId)),
    );
    setRoles((prev) => {
      const next = { ...prev };
      if (next[oldId]) {
        next[newId] = next[oldId];
        delete next[oldId];
      }
      return next;
    });
    setSubstitutingId(null);
    setSearchSubstitute("");
  };

  const handleRoleChange = (id: string, role: string) => {
    setRoles((prev) => ({
      ...prev,
      [id]: role,
    }));
  };

  const handleSaveAndClose = () => {
    const filteredRoles = Object.fromEntries(
      Object.entries(roles).filter(
        ([id, role]) => currentAcolytes.includes(id) && role.trim(),
      ),
    );

    onSave({
      acolytes: currentAcolytes,
      isSolemn,
      solemnityName: isSolemn ? solemnityName.trim() : "",
      acolyteRoles: isSolemn ? filteredRoles : {},
    });
    toast.success("Escala atualizada com sucesso!");
    onClose();
  };

  const dateFormatted = formatDateBR(entry.date);
  const locTime = formatLocationAndTime(entry.location, entry.time);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-accent shrink-0" />
            <DialogTitle className="text-base font-heading font-semibold">
              Gerenciar Escala: {dateFormatted}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
            <Church className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium text-foreground/80">{locTime}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Seção 1: Acólitos Escalados */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-accent" />
                Acólitos Escalados ({currentAcolytes.length})
              </label>
            </div>

            {currentAcolytes.length === 0 ? (
              <div className="text-center py-6 border border-dashed rounded-lg bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  Nenhum acólito escalado para esta celebração.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {currentAcolytes.map((id) => {
                  const name = getName(id);
                  const isSubstitutingThis = substitutingId === id;

                  return (
                    <div
                      key={id}
                      className="rounded-lg border border-border bg-card p-3 shadow-2xs space-y-2 transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-accent/20 text-accent font-semibold text-xs flex items-center justify-center shrink-0">
                            {name.charAt(0).toUpperCase() || "?"}
                          </div>
                          <span className="text-sm font-semibold text-foreground truncate">
                            {name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setSubstitutingId(
                                isSubstitutingThis ? null : id,
                              )
                            }
                            className="h-7 px-2.5 text-xs font-medium"
                          >
                            <ArrowLeftRight className="h-3 w-3 mr-1" />
                            {isSubstitutingThis ? "Cancelar" : "Substituir"}
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveAcolyte(id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Remover da escala"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Painel inline de substituição */}
                      {isSubstitutingThis && (
                        <div className="p-3 rounded-md bg-accent/10 border border-accent/30 space-y-2 animate-in fade-in-50">
                          <div className="flex items-center justify-between text-xs font-semibold text-accent-foreground">
                            <span>Substituir {name} por:</span>
                            <button
                              type="button"
                              onClick={() => setSubstitutingId(null)}
                              className="text-muted-foreground hover:text-foreground text-[11px]"
                            >
                              Fechar
                            </button>
                          </div>

                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Buscar substituto..."
                              value={searchSubstitute}
                              onChange={(e) =>
                                setSearchSubstitute(e.target.value)
                              }
                              className="h-8 pl-8 text-xs bg-background"
                              autoFocus
                            />
                          </div>

                          <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                            {availableToSubstitute.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground text-center py-2">
                                Nenhum outro acólito ativo encontrado.
                              </p>
                            ) : (
                              availableToSubstitute.map((sub) => (
                                <button
                                  key={sub.id}
                                  type="button"
                                  onClick={() =>
                                    handleSubstitute(id, sub.id)
                                  }
                                  className="w-full text-left px-2.5 py-1.5 rounded text-xs hover:bg-card flex items-center justify-between transition-colors border border-transparent hover:border-border"
                                >
                                  <span className="font-medium">{sub.name}</span>
                                  <Check className="h-3.5 w-3.5 text-accent" />
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}

                      {/* Campo de função litúrgica se for missa solene */}
                      {isSolemn && (
                        <div className="pt-1">
                          <Input
                            placeholder="Função (ex: Turiferário, Naveta, Crucífero...)"
                            value={roles[id] || ""}
                            onChange={(e) =>
                              handleRoleChange(id, e.target.value)
                            }
                            className="h-7 text-xs bg-background"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Seção 2: Adicionar Novo Acólito */}
          <div className="space-y-2">
            {isAddingOpen ? (
              <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2 animate-in fade-in-50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">
                    Adicionar Acólito à Missa
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingOpen(false)}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar acólito para adicionar..."
                    value={searchAdd}
                    onChange={(e) => setSearchAdd(e.target.value)}
                    className="h-8 pl-8 text-xs bg-background"
                    autoFocus
                  />
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                  {availableToAdd.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground text-center py-2">
                      Nenhum outro acólito ativo disponível.
                    </p>
                  ) : (
                    availableToAdd.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => handleAddAcolyte(a.id)}
                        className="w-full text-left px-2.5 py-1.5 rounded text-xs hover:bg-card border border-transparent hover:border-border flex items-center justify-between transition-colors"
                      >
                        <span className="font-medium">{a.name}</span>
                        <Plus className="h-3.5 w-3.5 text-accent" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddingOpen(true)}
                className="w-full text-xs h-8 border-dashed"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar Acólito a esta Missa
              </Button>
            )}
          </div>

          {/* Seção 3: Missa Solene & Solenidade */}
          <div className="rounded-lg border border-border p-3 bg-muted/20 space-y-2.5">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-semibold text-foreground">
                  Missa Solene / Solenidade
                </span>
              </div>
              <input
                type="checkbox"
                checked={isSolemn}
                onChange={(e) => setIsSolemn(e.target.checked)}
                className="rounded accent-primary h-4 w-4"
              />
            </label>

            {isSolemn && (
              <div className="space-y-2 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Nome da Solenidade
                  </label>
                  <Input
                    placeholder="Ex: Corpus Christi, Páscoa, Festa da Padroeira"
                    value={solemnityName}
                    onChange={(e) => setSolemnityName(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Você pode preencher as funções litúrgicas específicas nos cartões dos acólitos acima.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex flex-row justify-end gap-2 pt-3 border-t border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs h-8"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSaveAndClose}
            className="text-xs h-8 bg-primary text-primary-foreground font-medium shadow-sm hover:opacity-90"
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
