import { useState, useMemo } from "react";
import {
  Acolyte,
  DEFAULT_SCHEDULE_SETTINGS,
  IndividualRestriction,
  ScheduleSettings,
} from "@/types/schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Save,
  Users,
  Heart,
  Church,
  Clock,
  Calendar,
  MapPin,
  AlertCircle,
  AlertTriangle,
  Check,
  Plus,
  Trash2,
  Search,
  X,
  RotateCcw,
  Sparkles,
  Ban,
  Sliders,
  CheckCircle2,
  UserCheck,
  Info,
} from "lucide-react";
import Swal from "sweetalert2";

interface ScheduleSettingsManagerProps {
  acolytes: Acolyte[];
  settings: ScheduleSettings;
  onSave: (settings: ScheduleSettings) => Promise<void>;
}

// Opções de dias da semana
const DAYS_OF_WEEK = [
  { value: 0, label: "Dom", fullLabel: "Domingo" },
  { value: 1, label: "Seg", fullLabel: "Segunda" },
  { value: 2, label: "Ter", fullLabel: "Terça" },
  { value: 3, label: "Qua", fullLabel: "Quarta" },
  { value: 4, label: "Qui", fullLabel: "Quinta" },
  { value: 5, label: "Sex", fullLabel: "Sexta" },
  { value: 6, label: "Sáb", fullLabel: "Sábado" },
];

// Horários comuns de celebrações na paróquia
const COMMON_TIMES = ["7h", "7h30", "9h30", "15h", "18h", "19h", "19h30"];

// Locais e capelas comuns da paróquia
const COMMON_LOCATIONS = [
  "Salão Paroquial",
  "Santa Tereza",
  "Fátima",
  "São Judas",
  "Santa Teresinha",
  "Agissê",
  "Sebastião",
  "Hospital",
];

// Helpers de normalização e validação de horário
function normalizeTimeToken(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) return "";

  const colonMatch = value.match(/^(\d{1,2}):(\d{2})$/);
  if (colonMatch) {
    const hours = String(Number(colonMatch[1]));
    const minutes = colonMatch[2];
    return minutes === "00" ? `${hours}h` : `${hours}h${minutes}`;
  }

  const hMatch = value.match(/^(\d{1,2})h(?:([0-5]\d))?$/);
  if (hMatch) {
    const hours = String(Number(hMatch[1]));
    const minutes = hMatch[2];
    return !minutes || minutes === "00" ? `${hours}h` : `${hours}h${minutes}`;
  }

  return raw.trim();
}

function isValidTimeToken(raw: string): boolean {
  return /^(\d{1,2})(h|:)([0-5]\d)?$/i.test(raw.trim());
}

function mergeWithDefaults(settings: ScheduleSettings): ScheduleSettings {
  return {
    ...DEFAULT_SCHEDULE_SETTINGS,
    ...settings,
    weekendOnlyNames: settings.weekendOnlyNames || [],
    weakAcolytes: settings.weakAcolytes || [],
    lowCommitmentNames: settings.lowCommitmentNames || [],
    couples: settings.couples || [],
    individualRestrictions: settings.individualRestrictions || [],
    targetChapelLocationIncludes: settings.targetChapelLocationIncludes || [],
    avoidConsecutiveDays:
      settings.avoidConsecutiveDays ??
      DEFAULT_SCHEDULE_SETTINGS.avoidConsecutiveDays ??
      true,
  };
}

export default function ScheduleSettingsManager({
  acolytes,
  settings,
  onSave,
}: ScheduleSettingsManagerProps) {
  const [draft, setDraft] = useState<ScheduleSettings>(() =>
    mergeWithDefaults(settings),
  );
  const [activeTab, setActiveTab] = useState<
    "groups" | "couples" | "chapels" | "individual"
  >("groups");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Estados para o formulário de novo casal
  const [coupleFirst, setCoupleFirst] = useState("");
  const [coupleSecond, setCoupleSecond] = useState("");

  // Estado para busca de restrições individuais
  const [searchRestriction, setSearchRestriction] = useState("");

  // Estado para adição rápida de nova restrição individual
  const [newRestrictionName, setNewRestrictionName] = useState("");

  // Apenas acólitos ativos para seleção
  const activeAcolytes = useMemo(
    () => acolytes.filter((a) => a.active),
    [acolytes],
  );

  const update = <K extends keyof ScheduleSettings>(
    key: K,
    value: ScheduleSettings[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  // Funções para grupos de acólitos (Adicionar/Remover por nome)
  const toggleGroupMember = (
    groupKey: "weekendOnlyNames" | "weakAcolytes" | "lowCommitmentNames",
    name: string,
  ) => {
    const list = draft[groupKey];
    if (list.includes(name)) {
      update(
        groupKey,
        list.filter((n) => n !== name),
      );
    } else {
      update(groupKey, [...list, name]);
    }
  };

  // Funções de Casais / Duplas
  const handleAddCouple = () => {
    if (!coupleFirst || !coupleSecond) return;
    if (coupleFirst === coupleSecond) {
      Swal.fire({
        icon: "warning",
        title: "Atenção",
        text: "Selecione dois acólitos diferentes para formar uma dupla.",
      });
      return;
    }

    const alreadyExists = draft.couples.some(
      ([a, b]) =>
        (a === coupleFirst && b === coupleSecond) ||
        (a === coupleSecond && b === coupleFirst),
    );

    if (alreadyExists) {
      Swal.fire({
        icon: "info",
        title: "Dupla já cadastrada",
        text: "Este par de acólitos já está na lista de casais/duplas.",
      });
      return;
    }

    update("couples", [...draft.couples, [coupleFirst, coupleSecond]]);
    setCoupleFirst("");
    setCoupleSecond("");
  };

  const handleRemoveCouple = (index: number) => {
    update(
      "couples",
      draft.couples.filter((_, i) => i !== index),
    );
  };

  // Funções de Restrições Individuais
  const updateRestriction = (
    index: number,
    updates: Partial<IndividualRestriction>,
  ) => {
    setDraft((current) => ({
      ...current,
      individualRestrictions: current.individualRestrictions.map(
        (restriction, i) =>
          i === index ? { ...restriction, ...updates } : restriction,
      ),
    }));
  };

  const handleAddRestriction = (acolyteName?: string) => {
    const nameToAdd = acolyteName || newRestrictionName;
    if (!nameToAdd) return;

    // Verificar se o acólito já tem regra para avisar
    const existingIndex = draft.individualRestrictions.findIndex(
      (r) => r.name.toLowerCase() === nameToAdd.toLowerCase(),
    );

    if (existingIndex !== -1) {
      Swal.fire({
        icon: "info",
        title: "Regra existente",
        text: `Já existe uma regra para ${nameToAdd}. Você pode editá-la diretamente na lista abaixo.`,
      });
      setSearchRestriction(nameToAdd);
      setNewRestrictionName("");
      return;
    }

    setDraft((current) => ({
      ...current,
      individualRestrictions: [
        ...current.individualRestrictions,
        {
          name: nameToAdd,
          allowedDaysOfWeek: [],
          allowedTimes: [],
          blockedLocationIncludes: [],
          requiredLocationIncludes: [],
        },
      ],
    }));
    setNewRestrictionName("");
  };

  const removeRestriction = (index: number) => {
    setDraft((current) => ({
      ...current,
      individualRestrictions: current.individualRestrictions.filter(
        (_, i) => i !== index,
      ),
    }));
  };

  const handleResetToDefaults = async () => {
    const result = await Swal.fire({
      title: "Restaurar padrões?",
      text: "Isso redefinirá todas as configurações para os valores padrão da paróquia. Deseja continuar?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sim, restaurar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d33",
    });

    if (result.isConfirmed) {
      setDraft(mergeWithDefaults(DEFAULT_SCHEDULE_SETTINGS));
      setSaveError(null);
      Swal.fire({
        icon: "success",
        title: "Padrões restaurados",
        text: 'Clique em "Salvar Configurações" para gravar no banco de dados.',
        timer: 2000,
        showConfirmButton: false,
      });
    }
  };

  const handleSave = async () => {
    // Validação de horários
    const invalidTimes = draft.individualRestrictions
      .flatMap((restriction) => restriction.allowedTimes || [])
      .filter((time) => !isValidTimeToken(normalizeTimeToken(time)));

    if (invalidTimes.length > 0) {
      setSaveError(
        `Corrija os horários com formato inválido antes de salvar: ${invalidTimes.join(", ")}`,
      );
      return;
    }

    const normalizedDraft: ScheduleSettings = {
      ...draft,
      individualRestrictions: draft.individualRestrictions.map(
        (restriction) => ({
          ...restriction,
          allowedTimes: (restriction.allowedTimes || [])
            .map((time) => normalizeTimeToken(time))
            .filter(Boolean),
        }),
      ),
    };

    setSaveError(null);
    setSaving(true);
    try {
      await onSave(mergeWithDefaults(normalizedDraft));
    } finally {
      setSaving(false);
    }
  };

  // Filtragem de restrições individuais para busca
  const filteredRestrictions = useMemo(() => {
    if (!searchRestriction.trim()) return draft.individualRestrictions;
    const term = searchRestriction.toLowerCase();
    return draft.individualRestrictions.filter((r) =>
      r.name.toLowerCase().includes(term),
    );
  }, [draft.individualRestrictions, searchRestriction]);

  return (
    <div className="space-y-6">
      {/* Header Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-accent" />
            <h2 className="font-heading font-semibold text-lg text-foreground">
              Configurações & Regras dos Acólitos
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Defina preferências, disponibilidade, duplas fixas e restrições para a geração automática de escalas.
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetToDefaults}
            className="text-xs h-9"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Restaurar Padrões
          </Button>

          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            size="sm"
            className="text-xs h-9 bg-primary text-primary-foreground shadow-sm hover:opacity-90"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </div>
      </div>

      {/* Alerta de erro de validação */}
      {saveError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Sub-navegação em Abas Modernas */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        <TabButton
          active={activeTab === "groups"}
          onClick={() => setActiveTab("groups")}
          icon={<Users className="h-4 w-4" />}
          label="Grupos & Disponibilidade"
          badge={
            draft.weekendOnlyNames.length +
            draft.weakAcolytes.length +
            draft.lowCommitmentNames.length
          }
        />
        <TabButton
          active={activeTab === "couples"}
          onClick={() => setActiveTab("couples")}
          icon={<Heart className="h-4 w-4" />}
          label="Duplas & Casais"
          badge={draft.couples.length}
        />
        <TabButton
          active={activeTab === "chapels"}
          onClick={() => setActiveTab("chapels")}
          icon={<Church className="h-4 w-4" />}
          label="Capelas & Preferências"
        />
        <TabButton
          active={activeTab === "individual"}
          onClick={() => setActiveTab("individual")}
          icon={<Calendar className="h-4 w-4" />}
          label="Restrições Individuais"
          badge={draft.individualRestrictions.length}
        />
      </div>

      {/* ABA 1: GRUPOS & DISPONIBILIDADE */}
      {activeTab === "groups" && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Card 1: Só Fins de Semana */}
            <GroupSelectorCard
              title="Só Fins de Semana"
              description="Podem servir apenas aos sábados e domingos."
              icon={<Calendar className="h-4 w-4 text-blue-500" />}
              badgeVariant="secondary"
              selectedNames={draft.weekendOnlyNames}
              availableAcolytes={activeAcolytes}
              onToggle={(name) => toggleGroupMember("weekendOnlyNames", name)}
            />

            {/* Card 2: Acólitos com Dificuldade */}
            <GroupSelectorCard
              title="Acólitos Iniciantes / Dificuldade"
              description="Nunca serão escalados sozinhos nem com outro novato."
              icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
              badgeVariant="outline"
              selectedNames={draft.weakAcolytes}
              availableAcolytes={activeAcolytes}
              onToggle={(name) => toggleGroupMember("weakAcolytes", name)}
              badgeClassName="border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
            />

            {/* Card 3: Pouca Disponibilidade */}
            <GroupSelectorCard
              title="Pouca Disponibilidade"
              description="Recebem menor frequência nas escalas mensais."
              icon={<Clock className="h-4 w-4 text-purple-500" />}
              badgeVariant="secondary"
              selectedNames={draft.lowCommitmentNames}
              availableAcolytes={activeAcolytes}
              onToggle={(name) => toggleGroupMember("lowCommitmentNames", name)}
              extraContent={
                <div className="mt-4 pt-4 border-t border-border/60 space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-muted-foreground">
                      Peso da penalidade no algoritmo:
                    </span>
                    <Badge variant="outline" className="font-mono">
                      {draft.lowCommitmentPenalty}x
                    </Badge>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={draft.lowCommitmentPenalty}
                    onChange={(e) =>
                      update("lowCommitmentPenalty", Number(e.target.value) || 1)
                    }
                    className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Leve (1x)</span>
                    <span>Padrão (2x)</span>
                    <span>Severo (5x)</span>
                  </div>
                </div>
              }
            />
          </div>

          {/* Regra Geral: Evitar dias seguidos */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card shadow-sm">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 font-heading font-medium text-sm text-foreground">
                <Calendar className="h-4 w-4 text-accent" />
                <span>Evitar dias seguidos (Sábado e Domingo)</span>
                <Badge
                  variant="outline"
                  className="text-[10px] text-emerald-600 bg-emerald-500/10 border-emerald-500/30"
                >
                  Recomendado
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                O gerador de escalas evitará atribuir missas em dias consecutivos (ex: sábado e domingo do mesmo fim de semana) para o mesmo acólito.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={draft.avoidConsecutiveDays !== false}
                onChange={(e) => update("avoidConsecutiveDays", e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
      )}

      {/* ABA 2: DUPLAS & CASAIS */}
      {activeTab === "couples" && (
        <div className="space-y-6">
          {/* Card para Adicionar Novo Casal */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-rose-500 fill-rose-500/20" />
                <div>
                  <CardTitle className="text-base">Adicionar Dupla ou Casal</CardTitle>
                  <CardDescription className="text-xs">
                    O gerador de escalas dará preferência máxima para escalar estes dois acólitos juntos na mesma celebração.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="w-full sm:flex-1">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Primeiro Acólito
                  </label>
                  <select
                    value={coupleFirst}
                    onChange={(e) => setCoupleFirst(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Selecione o 1º acólito...</option>
                    {activeAcolytes.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-center p-2 mt-4 sm:mt-5 text-rose-500">
                  <Heart className="h-5 w-5 fill-rose-500/20 animate-pulse" />
                </div>

                <div className="w-full sm:flex-1">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Segundo Acólito
                  </label>
                  <select
                    value={coupleSecond}
                    onChange={(e) => setCoupleSecond(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Selecione o 2º acólito...</option>
                    {activeAcolytes
                      .filter((a) => a.name !== coupleFirst)
                      .map((a) => (
                        <option key={a.id} value={a.name}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="w-full sm:w-auto mt-2 sm:mt-5">
                  <Button
                    type="button"
                    onClick={handleAddCouple}
                    disabled={!coupleFirst || !coupleSecond}
                    className="w-full sm:w-auto"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Adicionar Dupla
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de Casais Configurados */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-medium text-sm text-foreground">
                Duplas Cadastradas ({draft.couples.length})
              </h3>
            </div>

            {draft.couples.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-border rounded-xl bg-card/50">
                <Heart className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm font-medium text-muted-foreground">
                  Nenhuma dupla ou casal cadastrado.
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Utilize o formulário acima para vincular acólitos que devem servir juntos.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {draft.couples.map(([first, second], index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-card shadow-sm hover:border-accent/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm text-foreground truncate max-w-[110px]">
                          {first}
                        </span>
                        <span className="text-rose-500 text-xs">❤️</span>
                        <span className="font-medium text-sm text-foreground truncate max-w-[110px]">
                          {second}
                        </span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveCouple(index)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 ml-2"
                      title="Remover dupla"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA 3: CAPELAS & PREFERÊNCIAS */}
      {activeTab === "chapels" && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Card: Titular de Capelas Fixas */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Church className="h-5 w-5 text-accent" />
                <div>
                  <CardTitle className="text-base">
                    Titular de Capelas Rurais / Fixas
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Define um acólito responsável pelas capelas distantes (ex: São Sebastião / Agissê). Ele não receberá alertas de repetição de finais de semana consecutivos nestes locais.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Acólito Titular
                  </label>
                  <select
                    value={draft.targetChapelAcolyteName}
                    onChange={(e) =>
                      update("targetChapelAcolyteName", e.target.value)
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Nenhum acólito selecionado</option>
                    {activeAcolytes.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Termos das Capelas Monitoradas
                  </label>
                  <LocationTagsInput
                    tags={draft.targetChapelLocationIncludes}
                    onChange={(newTags) =>
                      update("targetChapelLocationIncludes", newTags)
                    }
                    placeholder="Adicionar termo (ex: Agissê, Sebastião)..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Preferência Santa Tereza */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Church className="h-4 w-4 text-emerald-500" />
                <CardTitle className="text-base">
                  Preferência: Santa Tereza d'Ávila
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Acólito com prioridade para a missa de Domingo às 7h30 na capela Santa Tereza.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <select
                value={draft.santaTerezaPreferenceName}
                onChange={(e) =>
                  update("santaTerezaPreferenceName", e.target.value)
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Nenhuma preferência definida</option>
                {activeAcolytes.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ABA 4: RESTRIÇÕES INDIVIDUAIS */}
      {activeTab === "individual" && (
        <div className="space-y-6">
          {/* Barra de Ações & Adição de Regra */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-card border border-border shadow-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar acólito com restrição..."
                value={searchRestriction}
                onChange={(e) => setSearchRestriction(e.target.value)}
                className="pl-9 text-sm h-9"
              />
              {searchRestriction && (
                <button
                  type="button"
                  onClick={() => setSearchRestriction("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={newRestrictionName}
                onChange={(e) => setNewRestrictionName(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm h-9 max-w-[200px] focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Selecionar acólito...</option>
                {activeAcolytes.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>

              <Button
                type="button"
                onClick={() => handleAddRestriction()}
                disabled={!newRestrictionName}
                size="sm"
                className="h-9 whitespace-nowrap"
              >
                <Plus className="h-4 w-4 mr-1" />
                Adicionar Regra
              </Button>
            </div>
          </div>

          {/* Lista de Cartões de Restrições */}
          <div className="space-y-4">
            {filteredRestrictions.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl bg-card/50">
                <Calendar className="h-9 w-9 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm font-medium text-muted-foreground">
                  {searchRestriction
                    ? `Nenhuma restrição encontrada para "${searchRestriction}".`
                    : "Nenhuma restrição individual configurada."}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Selecione um acólito acima para criar uma regra específica de dias, horários ou locais.
                </p>
              </div>
            ) : (
              filteredRestrictions.map((restriction) => {
                // Encontrar o índice real no array original
                const realIndex = draft.individualRestrictions.findIndex(
                  (r) => r === restriction,
                );

                return (
                  <IndividualRestrictionCard
                    key={realIndex}
                    restriction={restriction}
                    availableAcolytes={activeAcolytes}
                    onUpdate={(updates) => updateRestriction(realIndex, updates)}
                    onRemove={() => removeRestriction(realIndex)}
                  />
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Rodapé Fixo / Notificador de Ação */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-border/80 bg-muted/40 backdrop-blur">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 text-accent shrink-0" />
          <span>
            As alterações só entrarão em vigor após clicar em <strong>Salvar Configurações</strong>.
          </span>
        </div>

        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-primary text-primary-foreground shadow-sm hover:opacity-90 font-medium text-sm"
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// SUB-COMPONENTES AUXILIARES
// -------------------------------------------------------------

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
        active
          ? "bg-accent text-accent-foreground shadow-sm font-semibold"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono font-normal ${
            active
              ? "bg-accent-foreground/20 text-accent-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// Seletor de Acólitos em formato de Card para Grupos
function GroupSelectorCard({
  title,
  description,
  icon,
  selectedNames,
  availableAcolytes,
  onToggle,
  badgeVariant = "secondary",
  badgeClassName,
  extraContent,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  selectedNames: string[];
  availableAcolytes: Acolyte[];
  onToggle: (name: string) => void;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  badgeClassName?: string;
  extraContent?: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const filteredToSelect = useMemo(() => {
    return availableAcolytes.filter(
      (a) =>
        !selectedNames.includes(a.name) &&
        a.name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [availableAcolytes, selectedNames, search]);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <Badge variant="secondary" className="font-mono text-xs">
            {selectedNames.length}
          </Badge>
        </div>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-2.5">
          {/* Tags dos acólitos selecionados */}
          <div className="flex flex-wrap gap-1.5 min-h-[48px] p-2 rounded-lg bg-muted/30 border border-border/50">
            {selectedNames.length === 0 ? (
              <span className="text-xs text-muted-foreground italic self-center">
                Nenhum acólito adicionado.
              </span>
            ) : (
              selectedNames.map((name) => (
                <span
                  key={name}
                  className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-card border border-border shadow-2xs font-medium text-foreground ${badgeClassName || ""}`}
                >
                  <span>{name}</span>
                  <button
                    type="button"
                    onClick={() => onToggle(name)}
                    className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                    title={`Remover ${name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Controle para adicionar acólito */}
          {isAdding ? (
            <div className="space-y-2 p-2 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar acólito..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-7 text-xs"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setIsAdding(false);
                    setSearch("");
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                {filteredToSelect.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-2">
                    Nenhum acólito disponível.
                  </p>
                ) : (
                  filteredToSelect.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        onToggle(a.name);
                        setSearch("");
                      }}
                      className="w-full text-left px-2 py-1 rounded text-xs hover:bg-muted transition-colors flex items-center justify-between"
                    >
                      <span>{a.name}</span>
                      <Plus className="h-3 w-3 text-accent" />
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
              onClick={() => setIsAdding(true)}
              className="w-full text-xs h-8 border-dashed"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Adicionar Acólito
            </Button>
          )}
        </div>

        {extraContent}
      </CardContent>
    </Card>
  );
}

// Card Detalhado para Cada Restrição Individual
function IndividualRestrictionCard({
  restriction,
  availableAcolytes,
  onUpdate,
  onRemove,
}: {
  restriction: IndividualRestriction;
  availableAcolytes: Acolyte[];
  onUpdate: (updates: Partial<IndividualRestriction>) => void;
  onRemove: () => void;
}) {
  const [customTime, setCustomTime] = useState("");

  const handleToggleTime = (time: string) => {
    const currentTimes = restriction.allowedTimes || [];
    const normalized = normalizeTimeToken(time);
    if (currentTimes.includes(normalized)) {
      onUpdate({
        allowedTimes: currentTimes.filter((t) => t !== normalized),
      });
    } else {
      onUpdate({
        allowedTimes: [...currentTimes, normalized],
      });
    }
  };

  const handleAddCustomTime = () => {
    if (!customTime.trim()) return;
    const normalized = normalizeTimeToken(customTime);
    if (!isValidTimeToken(normalized)) {
      Swal.fire({
        icon: "error",
        title: "Horário Inválido",
        text: 'Use o formato padrão como "7h", "9h30" ou "19h".',
      });
      return;
    }
    const currentTimes = restriction.allowedTimes || [];
    if (!currentTimes.includes(normalized)) {
      onUpdate({ allowedTimes: [...currentTimes, normalized] });
    }
    setCustomTime("");
  };

  const currentDays: number[] = useMemo(() => {
    if (
      restriction.allowedDaysOfWeek &&
      restriction.allowedDaysOfWeek.length > 0
    ) {
      return restriction.allowedDaysOfWeek;
    }
    if (restriction.onlyDayOfWeek !== undefined) {
      return [restriction.onlyDayOfWeek];
    }
    return [];
  }, [restriction.allowedDaysOfWeek, restriction.onlyDayOfWeek]);

  const handleToggleDayOfWeek = (dayValue: number) => {
    let nextDays: number[];
    if (currentDays.includes(dayValue)) {
      nextDays = currentDays.filter((d) => d !== dayValue);
    } else {
      nextDays = [...currentDays, dayValue].sort((a, b) => a - b);
    }

    onUpdate({
      allowedDaysOfWeek: nextDays,
      onlyDayOfWeek: nextDays.length === 1 ? nextDays[0] : undefined,
    });
  };

  const handleClearDays = () => {
    onUpdate({
      allowedDaysOfWeek: [],
      onlyDayOfWeek: undefined,
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm hover:border-border/80 transition-colors space-y-4">
      {/* Header do Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-accent/20 text-accent flex items-center justify-center font-heading font-semibold text-xs shrink-0">
            {restriction.name.charAt(0).toUpperCase() || "?"}
          </div>

          <div>
            <select
              value={restriction.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="font-heading font-semibold text-base bg-transparent border-0 p-0 focus:ring-0 focus:outline-none cursor-pointer text-foreground"
            >
              <option value="">Selecione o acólito...</option>
              {availableAcolytes.map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Restrições específicas de dias, horários e capelas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Remover Regra
          </Button>
        </div>
      </div>

      {/* Grid de Configurações da Regra */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1. Dias Permitidos */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-accent" />
              Dias Permitidos
            </span>
            {currentDays.length > 0 && (
              <button
                type="button"
                onClick={handleClearDays}
                className="text-[10px] text-muted-foreground hover:text-accent"
              >
                Limpar ({currentDays.length})
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1">
            {DAYS_OF_WEEK.map((d) => {
              const isSelected = currentDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => handleToggleDayOfWeek(d.value)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-all font-medium ${
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  title={d.fullLabel}
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-muted-foreground">
            {currentDays.length === 0
              ? "Qualquer dia da semana"
              : `Selecionado(s): ${currentDays
                  .map(
                    (val) =>
                      DAYS_OF_WEEK.find((d) => d.value === val)?.label,
                  )
                  .join(", ")}`}
          </p>

          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={!!restriction.onlyWeekends}
              onChange={(e) => onUpdate({ onlyWeekends: e.target.checked })}
              className="rounded accent-primary h-3.5 w-3.5"
            />
            <span>Apenas Fins de Semana (Sáb/Dom)</span>
          </label>
        </div>

        {/* 2. Horários Permitidos */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-accent" />
              Horários Permitidos
            </span>
            {(restriction.allowedTimes?.length ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => onUpdate({ allowedTimes: [] })}
                className="text-[10px] text-muted-foreground hover:text-accent"
              >
                Limpar ({restriction.allowedTimes?.length})
              </button>
            )}
          </div>

          {/* Chips de Horários Comuns */}
          <div className="flex flex-wrap gap-1">
            {COMMON_TIMES.map((time) => {
              const isSelected = (restriction.allowedTimes || []).includes(time);
              return (
                <button
                  key={time}
                  type="button"
                  onClick={() => handleToggleTime(time)}
                  className={`px-2 py-0.5 text-xs rounded-md font-mono transition-all ${
                    isSelected
                      ? "bg-accent text-accent-foreground font-semibold shadow-2xs"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {time}
                </button>
              );
            })}
          </div>

          {/* Input para horário customizado */}
          <div className="flex items-center gap-1 pt-1">
            <Input
              placeholder="Outro: ex 10h30"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCustomTime()}
              className="h-7 text-xs font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddCustomTime}
              disabled={!customTime.trim()}
              className="h-7 px-2 text-xs"
            >
              +
            </Button>
          </div>
        </div>

        {/* 3. Locais Bloqueados & Obrigatórios */}
        <div className="space-y-3 sm:col-span-2 lg:col-span-1">
          {/* Locais Bloqueados */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Ban className="h-3.5 w-3.5 text-destructive" />
              Locais Bloqueados (Não servir)
            </div>
            <LocationTagsInput
              tags={restriction.blockedLocationIncludes || []}
              onChange={(newTags) =>
                onUpdate({ blockedLocationIncludes: newTags })
              }
              placeholder="Ex: Fátima, Tereza..."
              suggestedLocations={COMMON_LOCATIONS}
              variant="destructive"
            />
          </div>

          {/* Locais Obrigatórios */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-emerald-500" />
              Locais Obrigatórios (Exclusivo)
            </div>
            <LocationTagsInput
              tags={restriction.requiredLocationIncludes || []}
              onChange={(newTags) =>
                onUpdate({ requiredLocationIncludes: newTags })
              }
              placeholder="Ex: Agissê, Sebastião..."
              suggestedLocations={COMMON_LOCATIONS}
              variant="success"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Input de Tags / Palavras-chave de Capela
function LocationTagsInput({
  tags,
  onChange,
  placeholder,
  suggestedLocations,
  variant = "default",
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  suggestedLocations?: string[];
  variant?: "default" | "destructive" | "success";
}) {
  const [inputVal, setInputVal] = useState("");

  const addTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim();
    if (!trimmed) return;
    if (!tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputVal("");
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter((t) => t !== tagToRemove));
  };

  const tagColorClass =
    variant === "destructive"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : variant === "success"
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
        : "bg-accent/15 text-accent-foreground border-accent/30";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1 min-h-[32px] p-1.5 rounded-md border border-input bg-background items-center">
        {tags.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border font-medium ${tagColorClass}`}
          >
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:opacity-70 text-current ml-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(inputVal);
            }
          }}
          placeholder={tags.length === 0 ? placeholder : "+ termo"}
          className="flex-1 min-w-[80px] bg-transparent text-xs p-1 focus:outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      {/* Sugestões rápidas de capelas */}
      {suggestedLocations && suggestedLocations.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {suggestedLocations
            .filter((loc) => !tags.includes(loc))
            .slice(0, 5)
            .map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => addTag(loc)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                + {loc}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
