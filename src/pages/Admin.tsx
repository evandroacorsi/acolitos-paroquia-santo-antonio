import AcolyteManager from "@/components/AcolyteManager";
import RuleManager from "@/components/RuleManager";
import ScheduleEditor from "@/components/ScheduleEditor";
import ScheduleSettingsManager from "@/components/ScheduleSettingsManager";
import ScheduleView from "@/components/ScheduleView";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  addCustomMassesToSchedule,
  generateSchedule,
  validateSchedule,
} from "@/lib/schedule-engine";
import {
  Acolyte,
  DEFAULT_SCHEDULE_SETTINGS,
  MONTH_NAMES,
  RuleViolation,
  ScheduleData,
  ScheduleSettings,
  VariableRule,
} from "@/types/schedule";
import {
  AlertCircle,
  AlertTriangle,
  CalendarPlus,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Eye,
  LogOut,
  Moon,
  RefreshCw,
  Save,
  Sun,
  Trash,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom"; // <-- Importamos o useNavigate
import Swal from "sweetalert2";

export default function Admin() {
  const navigate = useNavigate();

  // Estados de Autenticação (Tudo direto no componente agora)
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Estados da Escala
  const [acolytes, setAcolytes] = useState<Acolyte[]>([]);
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<string>("draft");
  const [variableRules, setVariableRules] = useState<VariableRule[]>([]);
  const [scheduleSettings, setScheduleSettings] = useState<ScheduleSettings>(
    DEFAULT_SCHEDULE_SETTINGS,
  );
  const [violations, setViolations] = useState<RuleViolation[]>([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [isVacation, setIsVacation] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [tab, setTab] = useState<
    "schedule" | "acolytes" | "rules" | "settings"
  >("schedule");

  // Funções de carregamento
  const loadAcolytes = useCallback(async () => {
    const { data } = await supabase.from("acolytes").select("*").order("name");
    if (data) setAcolytes(data);
  }, []);

  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true);
    setScheduleData(null);
    setScheduleId(null);
    setScheduleStatus("draft");

    const { data } = await supabase
      .from("schedules")
      .select("*")
      .eq("month", month)
      .eq("year", year)
      .maybeSingle();

    if (data) {
      setScheduleId(data.id);
      setScheduleData(data.data as unknown as ScheduleData);
      setScheduleStatus(data.status);
    }

    setScheduleLoading(false);
  }, [month, year]);

  const loadRules = useCallback(async () => {
    if (!scheduleId) {
      setVariableRules([]);
      return;
    }
    const { data } = await supabase
      .from("variable_rules")
      .select("*")
      .eq("schedule_id", scheduleId);
    if (data) setVariableRules(data as unknown as VariableRule[]);
  }, [scheduleId]);

  const loadScheduleSettings = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("schedule_settings")
      .select("value")
      .eq("key", "default")
      .maybeSingle();

    if (data?.value) {
      setScheduleSettings({
        ...DEFAULT_SCHEDULE_SETTINGS,
        ...(data.value as Partial<ScheduleSettings>),
      });
    }
  }, []);

  const handleSaveScheduleSettings = async (settings: ScheduleSettings) => {
    const { error } = await (supabase as any).from("schedule_settings").upsert(
      {
        key: "default",
        value: settings,
      },
      { onConflict: "key" },
    );

    if (error) {
      toast.error("Erro ao salvar configurações");
      return;
    }

    setScheduleSettings(settings);
    toast.success("Configurações salvas");
  };

  useEffect(() => {
    const checkAuth = async () => {
      // 1. Pega a sessão
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // Se não tiver logado, chuta pra fora (Ajuste a rota se seu login for em outro lugar)
      if (!session) {
        navigate("/");
        return;
      }

      // 2. Verifica se é admin (Já que no de acólitos você precisa dessa regra)
      const { data: isUserAdmin } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "admin",
      });

      if (!isUserAdmin) {
        setIsAdmin(false);
        setLoading(false);
        return; // Para aqui, não carrega os acólitos
      }

      // 3. Deu tudo certo! Salva os dados e carrega o sistema
      setUser(session.user);
      setIsAdmin(true);
      loadAcolytes();
      loadScheduleSettings();
      setLoading(false);
    };

    checkAuth();
  }, [navigate, loadAcolytes, loadScheduleSettings]);

  useEffect(() => {
    if (!isAdmin) return;
    loadSchedule();
  }, [isAdmin, loadSchedule]);

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("theme") === "dark";
  });

  useEffect(() => {
    const root = window.document.documentElement;

    if (darkMode) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  // Carrega regras sempre que o scheduleId mudar
  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // Validação de regras da escala
  useEffect(() => {
    if (scheduleData && acolytes.length > 0) {
      const v = validateSchedule(
        scheduleData,
        acolytes,
        variableRules,
        isVacation,
        scheduleSettings,
      );
      setViolations(v);
    } else {
      setViolations([]);
    }
  }, [scheduleData, acolytes, variableRules, isVacation, scheduleSettings]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/"); // Chuta pra home após sair
  };

  const handleGenerate = async () => {
    if (scheduleData) {
      const result = await Swal.fire({
        title: "Sobrescrever escala?",
        text: "Já existe uma escala para este mês. Se gerar uma nova, a atual será perdida!",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Sim, gerar nova",
        cancelButtonText: "Manter atual",
      });

      if (!result.isConfirmed) return;
    }
    let bestData: ScheduleData | null = null;
    let bestViolationsCount = Infinity;
    const MAX_RETRIES = 100; // Aumentei um pouco o limite pois encontrar < 5 totais é mais difícil que apenas < 5 erros

    toast.info("Otimizando escala (Erros + Alertas). Aguarde...");

    for (let i = 0; i < MAX_RETRIES; i++) {
      const data = generateSchedule(
        year,
        month,
        acolytes,
        variableRules,
        isVacation,
        scheduleSettings,
      );

      const currentViolations = validateSchedule(
        data,
        acolytes,
        variableRules,
        isVacation,
        scheduleSettings,
      );

      // 🔥 Agora contamos o total (Erros + Avisos)
      const totalViolationsCount = currentViolations.length;

      if (totalViolationsCount < bestViolationsCount) {
        bestViolationsCount = totalViolationsCount;
        bestData = data;
      }

      // Se a escala tiver 5 ou menos problemas no total, aceitamos imediatamente
      if (totalViolationsCount <= 5) {
        console.log(
          `Escala excelente encontrada na tentativa ${i + 1} com ${totalViolationsCount} violações totais.`,
        );
        break;
      }
    }

    if (!bestData) return;

    setScheduleData(bestData);

    if (scheduleId) {
      await supabase
        .from("schedules")
        .update({ data: bestData as any })
        .eq("id", scheduleId);
    } else {
      const { data: newSched } = await supabase
        .from("schedules")
        .insert([
          { month, year, data: bestData as any, status: "draft" },
        ] as any)
        .select()
        .single();
      if (newSched) setScheduleId(newSched.id);
    }

    if (bestViolationsCount <= 5) {
      toast.success(
        `Escala gerada! Total de problemas: ${bestViolationsCount}`,
      );
    } else {
      toast.warning(
        `Após ${MAX_RETRIES} tentativas, a melhor escala teve ${bestViolationsCount} problemas.`,
      );
    }
  };

  // Completa a escala atual com as missas extras que ainda não estão nela,
  // sem regenerar o restante
  const handleAddCustomMasses = async () => {
    if (!scheduleId || !scheduleData) return;

    if (scheduleSettings.customMasses.length === 0) {
      Swal.fire({
        icon: "info",
        title: "Nenhuma missa extra",
        text: 'Cadastre as missas na aba Configurações > "Missas Extras".',
      });
      return;
    }

    // Como só as missas novas são sorteadas, algumas tentativas bastam
    let best: ReturnType<typeof addCustomMassesToSchedule> | null = null;
    let bestViolationsCount = Infinity;
    for (let i = 0; i < 30; i++) {
      const result = addCustomMassesToSchedule(
        scheduleData,
        year,
        month,
        acolytes,
        variableRules,
        isVacation,
        scheduleSettings,
      );
      const count = validateSchedule(
        result.data,
        acolytes,
        variableRules,
        isVacation,
        scheduleSettings,
      ).length;
      if (count < bestViolationsCount) {
        bestViolationsCount = count;
        best = result;
      }
    }

    if (!best || best.added.length === 0) {
      Swal.fire({
        icon: "info",
        title: "Nada a adicionar",
        text: "A escala já tem todas as missas extras cadastradas.",
      });
      return;
    }

    const confirm = await Swal.fire({
      title: "Adicionar missas extras?",
      text: `${best.added.length} missa(s) extra(s) serão incluídas na escala de ${MONTH_NAMES[month - 1]}. O restante da escala não será alterado.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sim, adicionar",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;

    const { error } = await supabase
      .from("schedules")
      .update({ data: best.data as any })
      .eq("id", scheduleId);

    if (error) {
      toast.error("Erro ao salvar a escala");
      return;
    }

    setScheduleData(best.data);
    toast.success(`${best.added.length} missa(s) extra(s) adicionada(s)`);
  };

  const handleSave = async () => {
    if (!scheduleId || !scheduleData) return;
    await supabase
      .from("schedules")
      .update({ data: scheduleData as any })
      .eq("id", scheduleId);
    Swal.fire({
      position: "center",
      icon: "success",
      title: "Escala salva com sucesso!",
      showConfirmButton: true,
      timer: 2000,
      timerProgressBar: true,
    });
  };

  const handlePublish = async () => {
    if (!scheduleId) return;
    const newStatus = scheduleStatus === "published" ? "draft" : "published";
    await supabase
      .from("schedules")
      .update({ status: newStatus })
      .eq("id", scheduleId);
    setScheduleStatus(newStatus);
    toast.success(
      newStatus === "published" ? "Escala publicada!" : "Escala despublicada",
    );
  };

  const handleDelete = async () => {
    if (!scheduleId) return;

    const result = await Swal.fire({
      title: "Tem certeza?",
      text: "Esta escala será apagada permanentemente!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33", // Cor de perigo
      cancelButtonColor: "#3085d6",
      cancelButtonText: "Cancelar",
      confirmButtonText: "Sim, excluir!",
      color: "var(--foreground)",
    });

    if (result.isConfirmed) {
      const { error } = await supabase
        .from("schedules")
        .delete()
        .eq("id", scheduleId);

      if (!error) {
        setScheduleId(null);
        setScheduleData(null);
        setScheduleStatus("draft");
        Swal.fire("Excluída!", "A escala foi removida.", "success");
      } else {
        toast.error("Erro ao excluir escala");
      }
    }
  };

  const changeMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (m < 1) {
      m = 12;
      y--;
    }
    setMonth(m);
    setYear(y);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-xl font-semibold">
          Você não tem permissão de administrador.
        </p>
        <Link to="/" className="text-accent underline">
          Voltar para Home
        </Link>
      </div>
    );
  }

  const errors = violations.filter((v) => v.type === "error");
  const warnings = violations.filter((v) => v.type === "warning");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-3">
          {/* Título */}
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="font-heading font-semibold text-base sm:text-lg truncate">
              Painel do Administrador
            </h1>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2">
            {/* Toggle Dark Mode */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDarkMode((prev) => !prev)}
              className="rounded-full"
            >
              {darkMode ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>

            {/* Divider sutil */}
            <div className="w-px h-5 bg-border mx-1" />

            {/* Logout */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="flex items-center gap-1"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6 overflow-hidden">
        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-6 border-b border-border">
          {(["schedule", "acolytes", "rules", "settings"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "schedule"
                ? "Escala"
                : t === "acolytes"
                  ? "Acólitos"
                  : t === "rules"
                    ? "Regras"
                    : "Configurações"}
            </button>
          ))}
        </div>

        {tab === "acolytes" && (
          <AcolyteManager acolytes={acolytes} onRefresh={loadAcolytes} />
        )}

        {tab === "rules" &&
          (scheduleId ? (
            <RuleManager
              scheduleId={scheduleId}
              acolytes={acolytes}
              rules={variableRules}
              onRefresh={loadRules}
            />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>Gere uma escala primeiro para adicionar regras variáveis.</p>
            </div>
          ))}

        {tab === "settings" && (
          <ScheduleSettingsManager
            acolytes={acolytes}
            settings={scheduleSettings}
            onSave={handleSaveScheduleSettings}
          />
        )}

        {tab === "schedule" && (
          <div className="space-y-4">
            {/* Month selector + actions */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex w-full items-center justify-center gap-1 sm:w-auto">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => changeMonth(-1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-0 flex-1 font-heading font-semibold text-base text-center sm:min-w-[160px] sm:flex-none sm:text-lg">
                  {MONTH_NAMES[month - 1]} {year}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => changeMonth(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* <div className="flex items-center gap-2">
                <Checkbox
                  id="vacation"
                  checked={isVacation}
                  onCheckedChange={(v) => setIsVacation(!!v)}
                />
                <Label htmlFor="vacation" className="text-sm">
                  Período de férias
                </Label>
              </div> */}

              <div className="flex flex-wrap w-full gap-2 sm:ml-auto sm:w-auto">
                <Button onClick={handleGenerate} size="sm" className="flex-1 sm:flex-none">
                  <RefreshCw className="h-4 w-4 mr-1" /> Gerar
                </Button>
                {scheduleData && (
                  <>
                    <Button
                      onClick={handleAddCustomMasses}
                      variant="outline"
                      size="sm"
                      className="flex-1 sm:flex-none"
                      title="Inclui as missas extras que faltam, sem regenerar a escala"
                    >
                      <CalendarPlus className="h-4 w-4 mr-1" /> Missas Extras
                    </Button>
                    <Button
                      onClick={handleSave}
                      variant="outline"
                      size="sm"
                      className="flex-1 sm:flex-none"
                    >
                      <Save className="h-4 w-4 mr-1" /> Salvar
                    </Button>
                    <Button
                      onClick={() =>
                        setViewMode((v) => (v === "edit" ? "preview" : "edit"))
                      }
                      variant="outline"
                      size="sm"
                      className="flex-1 sm:flex-none"
                    >
                      {viewMode === "edit" ? (
                        <Eye className="h-4 w-4 mr-1" />
                      ) : (
                        <Edit2 className="h-4 w-4 mr-1" />
                      )}
                      {viewMode === "edit" ? "Preview" : "Editar"}
                    </Button>
                    <Button
                      onClick={handlePublish}
                      variant="outline"
                      size="sm"
                      className={
                        scheduleStatus === "published"
                          ? "flex-1 sm:flex-none"
                          : "flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white"
                      }
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      {scheduleStatus === "published"
                        ? "Despublicar"
                        : "Publicar"}
                    </Button>
                    <Button
                      onClick={handleDelete}
                      variant="destructive"
                      size="sm"
                      className="flex-1 sm:flex-none"
                    >
                      <Trash className="h-4 w-4 mr-1" /> Excluir
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Violations */}
            {violations.length > 0 && (
              <div className="space-y-1">
                {errors.map((v, i) => (
                  <div
                    key={`e-${i}`}
                    className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded"
                  >
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    {v.message}
                  </div>
                ))}
                {warnings.map((v, i) => (
                  <div
                    key={`w-${i}`}
                    className="flex items-start gap-2 text-sm text-accent bg-accent/10 px-3 py-2 rounded"
                  >
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    {v.message}
                  </div>
                ))}
              </div>
            )}

            {/* Schedule content */}
            {scheduleLoading ? (
              <div className="flex items-center justify-center min-h-[50vh]">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : scheduleData ? (
              viewMode === "edit" ? (
                <ScheduleEditor
                  data={scheduleData}
                  acolytes={acolytes}
                  onChange={setScheduleData}
                />
              ) : (
                <ScheduleView
                  data={scheduleData}
                  month={month}
                  year={year}
                  acolytes={acolytes}
                  onUpdate={setScheduleData}
                />
              )
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-lg">
                  Nenhuma escala para {MONTH_NAMES[month - 1]} {year}
                </p>
                <p className="text-sm mt-1">
                  Clique em "Gerar" para criar uma nova escala
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
