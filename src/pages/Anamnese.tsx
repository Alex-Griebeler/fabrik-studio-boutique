import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import logoFabrik from "@/assets/logo-fabrik.png";

type FormData = {
  nome: string;
  telefone: string;
  email: string;
  idade: string;
  profissao: string;
  como_conheceu: string;
  indicacao_nome: string;
  busca_profissional: string;
  onde_treina: string;
  nota_condicao_fisica: string;
  nota_satisfacao_corpo: string;
  objetivos: string[];
  areas_melhorar: string[];
  periodo_treino: string[];
  frequencia_semanal: string[];
  maior_dificuldade: string;
  expectativa_experimental: string;
  parq_problema_cardiaco: string;
  parq_dor_peito_exercicio: string;
  parq_dor_peito_ultimo_mes: string;
  parq_perda_consciencia: string;
  parq_problema_osseo: string;
  parq_medicamento_pressao: string;
  parq_impedimento_medico: string;
  aceite_termo: boolean;
};

const initialForm: FormData = {
  nome: "",
  telefone: "",
  email: "",
  idade: "",
  profissao: "",
  como_conheceu: "",
  indicacao_nome: "",
  busca_profissional: "",
  onde_treina: "",
  nota_condicao_fisica: "",
  nota_satisfacao_corpo: "",
  objetivos: [],
  areas_melhorar: [],
  periodo_treino: [],
  frequencia_semanal: [],
  maior_dificuldade: "",
  expectativa_experimental: "",
  parq_problema_cardiaco: "",
  parq_dor_peito_exercicio: "",
  parq_dor_peito_ultimo_mes: "",
  parq_perda_consciencia: "",
  parq_problema_osseo: "",
  parq_medicamento_pressao: "",
  parq_impedimento_medico: "",
  aceite_termo: false,
};

const COMO_CONHECEU = ["Google", "Facebook", "Instagram", "Indicação", "Outro"];
const BUSCA_PROFISSIONAL = [
  "Nunca treinei com personal e quero apenas orientação básica",
  "Já treinei com personal, mas busco algo mais organizado e eficiente",
  "Já treinei com personal e procuro um trabalho de alta qualidade e individualizado",
  "Estou em dúvida e quero entender melhor como funciona um trabalho bem estruturado",
];
const ONDE_TREINA = ["Academia", "Studio", "Condomínio", "Em casa", "Outdoor/parque", "Não treino atualmente", "Outro"];
const OBJETIVOS = ["Emagrecimento", "Hipertrofia", "Performance", "Saúde, qualidade de vida e longevidade", "Recondicionamento pós lesão"];
const AREAS = ["Peitoral", "Costas", "Braços", "Abdômen", "Pernas", "Glúteos"];
const PERIODOS = ["Manhã", "Tarde", "Noite"];
const FREQUENCIAS = ["2x", "3x", "4x", "5x"];

function SectionTitle({ children, step }: { children: React.ReactNode; step: number }) {
  return (
    <div className="flex items-center gap-3 mb-6 mt-10 first:mt-0">
      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-semibold shrink-0">
        {step}
      </span>
      <h2 className="text-lg font-semibold text-foreground">{children}</h2>
    </div>
  );
}

function RequiredDot() {
  return <span className="text-destructive ml-1">*</span>;
}

function CheckboxGroup({
  options,
  selected,
  onChange,
  max,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  max?: number;
}) {
  const toggle = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt));
    } else if (!max || selected.length < max) {
      onChange([...selected, opt]);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt) => (
        <label
          key={opt}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
            selected.includes(opt)
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/30"
          }`}
        >
          <Checkbox
            checked={selected.includes(opt)}
            onCheckedChange={() => toggle(opt)}
          />
          <span className="text-sm">{opt}</span>
        </label>
      ))}
    </div>
  );
}

function RatingScale({
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  lowLabel: string;
  highLabel: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground mb-2">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
      <div className="flex gap-2">
        {["1", "2", "3", "4", "5"].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`flex-1 h-12 rounded-lg border text-sm font-medium transition-all ${
              value === n
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border hover:border-primary/50"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function ParqQuestion({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="py-3 border-b border-border last:border-0">
      <p className="text-sm mb-3">{label}</p>
      <RadioGroup value={value} onValueChange={onChange} className="flex gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <RadioGroupItem value="sim" />
          <span className="text-sm">Sim</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <RadioGroupItem value="nao" />
          <span className="text-sm">Não</span>
        </label>
      </RadioGroup>
    </div>
  );
}

export default function Anamnese() {
  const { leadId } = useParams<{ leadId: string }>();
  const [searchParams] = useSearchParams();
  const leadName = searchParams.get("nome") || "";
  const [form, setForm] = useState<FormData>({ ...initialForm, nome: leadName });
  const [step, setStep] = useState(0); // 0=form, 1=submitting, 2=done
  const [errors, setErrors] = useState<string[]>([]);

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!form.nome.trim()) errs.push("Nome completo");
    if (!form.telefone.trim()) errs.push("Telefone");
    if (!form.idade.trim()) errs.push("Idade");
    if (!form.profissao.trim()) errs.push("Profissão");
    if (!form.como_conheceu) errs.push("Como me conheceu");
    if (!form.busca_profissional) errs.push("O que busca");
    if (!form.onde_treina) errs.push("Onde treina");
    if (!form.nota_condicao_fisica) errs.push("Nota condição física");
    if (!form.nota_satisfacao_corpo) errs.push("Nota satisfação corpo");
    if (form.objetivos.length === 0) errs.push("Objetivo principal");
    if (form.areas_melhorar.length === 0) errs.push("Áreas do corpo");
    if (form.periodo_treino.length === 0) errs.push("Período do dia");
    if (form.frequencia_semanal.length === 0) errs.push("Frequência semanal");
    if (!form.maior_dificuldade.trim()) errs.push("Maior dificuldade");
    if (!form.expectativa_experimental.trim()) errs.push("Expectativa");
    if (!form.parq_problema_cardiaco) errs.push("PAR-Q: Problema cardíaco");
    if (!form.parq_dor_peito_exercicio) errs.push("PAR-Q: Dor no peito exercício");
    if (!form.parq_dor_peito_ultimo_mes) errs.push("PAR-Q: Dor no peito último mês");
    if (!form.parq_perda_consciencia) errs.push("PAR-Q: Perda de consciência");
    if (!form.parq_problema_osseo) errs.push("PAR-Q: Problema ósseo");
    if (!form.parq_medicamento_pressao) errs.push("PAR-Q: Medicamento pressão");
    if (!form.parq_impedimento_medico) errs.push("PAR-Q: Impedimento médico");
    if (!form.aceite_termo) errs.push("Aceite do termo");
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      toast.error(`Preencha os campos obrigatórios: ${errs.slice(0, 3).join(", ")}${errs.length > 3 ? "..." : ""}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors([]);
    setStep(1);

    const qualificationData = {
      anamnese_preenchida: true,
      anamnese_data: new Date().toISOString(),
      dados_pessoais: {
        nome: form.nome,
        telefone: form.telefone,
        email: form.email,
        idade: form.idade,
        profissao: form.profissao,
      },
      perfil: {
        como_conheceu: form.como_conheceu,
        indicacao_nome: form.indicacao_nome,
        busca_profissional: form.busca_profissional,
        onde_treina: form.onde_treina,
        nota_condicao_fisica: parseInt(form.nota_condicao_fisica),
        nota_satisfacao_corpo: parseInt(form.nota_satisfacao_corpo),
      },
      treino: {
        objetivos: form.objetivos,
        areas_melhorar: form.areas_melhorar,
        periodo_treino: form.periodo_treino,
        frequencia_semanal: form.frequencia_semanal,
        maior_dificuldade: form.maior_dificuldade,
        expectativa_experimental: form.expectativa_experimental,
      },
      parq: {
        problema_cardiaco: form.parq_problema_cardiaco === "sim",
        dor_peito_exercicio: form.parq_dor_peito_exercicio === "sim",
        dor_peito_ultimo_mes: form.parq_dor_peito_ultimo_mes === "sim",
        perda_consciencia: form.parq_perda_consciencia === "sim",
        problema_osseo: form.parq_problema_osseo === "sim",
        medicamento_pressao: form.parq_medicamento_pressao === "sim",
        impedimento_medico: form.parq_impedimento_medico === "sim",
      },
      termo_aceito: true,
      termo_aceito_em: new Date().toISOString(),
    };

    try {
      if (leadId) {
        const { error } = await supabase.rpc("update_lead_anamnese", {
          p_lead_id: leadId,
          p_qualification_details: qualificationData,
          p_name: form.nome || null,
          p_phone: form.telefone || null,
          p_email: form.email || null,
        });

        if (error) throw error;
      }
      setStep(2);
    } catch (err) {
      console.error("Erro ao salvar anamnese:", err);
      toast.error("Erro ao enviar formulário. Tente novamente.");
      setStep(0);
    }
  };

  if (step === 2) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">Obrigado, {form.nome.split(" ")[0]}!</h1>
            <p className="text-muted-foreground">
              Suas respostas foram recebidas com sucesso. Estou analisando tudo pessoalmente e
              em breve entro em contato para confirmar os detalhes do seu treino experimental.
            </p>
          </div>
          <img src={logoFabrik} alt="Fabrik" className="h-8 mx-auto opacity-60" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-secondary text-secondary-foreground py-8 px-4">
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <img src={logoFabrik} alt="Fabrik" className="h-10 mx-auto" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ fontFamily: "'PP Editorial New', serif" }}>
            O seu protocolo personalizado começa aqui
          </h1>
          <p className="text-secondary-foreground/80 text-sm max-w-lg mx-auto">
            Antes do nosso encontro, peço que responda a algumas perguntas rápidas — levará menos de 2 minutos.
            Assim, posso entender melhor suas necessidades, rotina e objetivos. Todo o conteúdo será
            analisado pessoalmente por mim. Até breve.
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-8 space-y-2">
        {errors.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-destructive">
              Preencha os campos obrigatórios destacados abaixo ({errors.length} pendente{errors.length > 1 ? "s" : ""})
            </p>
          </div>
        )}

        {/* Section 1: Dados Pessoais */}
        <SectionTitle step={1}>Dados Pessoais</SectionTitle>
        <div className="space-y-4">
          <div>
            <Label>Nome completo<RequiredDot /></Label>
            <Input value={form.nome} onChange={(e) => update("nome", e.target.value)} placeholder="Seu nome completo" className={errors.includes("Nome completo") ? "border-destructive" : ""} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Telefone<RequiredDot /></Label>
              <Input value={form.telefone} onChange={(e) => update("telefone", e.target.value)} placeholder="(11) 99999-9999" className={errors.includes("Telefone") ? "border-destructive" : ""} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="seu@email.com" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Idade<RequiredDot /></Label>
              <Input value={form.idade} onChange={(e) => update("idade", e.target.value)} placeholder="Ex: 35" className={errors.includes("Idade") ? "border-destructive" : ""} />
            </div>
            <div>
              <Label>Profissão<RequiredDot /></Label>
              <Input value={form.profissao} onChange={(e) => update("profissao", e.target.value)} placeholder="Sua profissão" className={errors.includes("Profissão") ? "border-destructive" : ""} />
            </div>
          </div>
        </div>

        {/* Section 2: Perfil */}
        <SectionTitle step={2}>Seu Perfil</SectionTitle>
        <div className="space-y-6">
          <div>
            <Label className="mb-2 block">Como você me conheceu?<RequiredDot /></Label>
            <RadioGroup value={form.como_conheceu} onValueChange={(v) => update("como_conheceu", v)} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {COMO_CONHECEU.map((opt) => (
                <label key={opt} className={`flex items-center gap-2 px-4 py-3 rounded-lg border cursor-pointer transition-all ${form.como_conheceu === opt ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}>
                  <RadioGroupItem value={opt} />
                  <span className="text-sm">{opt}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {form.como_conheceu === "Indicação" && (
            <div>
              <Label>Quem indicou?</Label>
              <Input value={form.indicacao_nome} onChange={(e) => update("indicacao_nome", e.target.value)} placeholder="Nome de quem indicou" />
            </div>
          )}

          <div>
            <Label className="mb-2 block">O que você busca com um profissional de treinamento?<RequiredDot /></Label>
            <RadioGroup value={form.busca_profissional} onValueChange={(v) => update("busca_profissional", v)} className="space-y-2">
              {BUSCA_PROFISSIONAL.map((opt) => (
                <label key={opt} className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${form.busca_profissional === opt ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}>
                  <RadioGroupItem value={opt} />
                  <span className="text-sm">{opt}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label className="mb-2 block">Onde treina atualmente?<RequiredDot /></Label>
            <RadioGroup value={form.onde_treina} onValueChange={(v) => update("onde_treina", v)} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ONDE_TREINA.map((opt) => (
                <label key={opt} className={`flex items-center gap-2 px-4 py-3 rounded-lg border cursor-pointer transition-all ${form.onde_treina === opt ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}>
                  <RadioGroupItem value={opt} />
                  <span className="text-sm">{opt}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
        </div>

        {/* Section 3: Autoavaliação */}
        <SectionTitle step={3}>Autoavaliação</SectionTitle>
        <div className="space-y-6">
          <div>
            <Label className="mb-3 block">Sua condição física atual<RequiredDot /></Label>
            <RatingScale value={form.nota_condicao_fisica} onChange={(v) => update("nota_condicao_fisica", v)} lowLabel="Totalmente destreinado(a)" highLabel="Extremamente treinado(a)" />
          </div>
          <div>
            <Label className="mb-3 block">Satisfação com seu corpo<RequiredDot /></Label>
            <RatingScale value={form.nota_satisfacao_corpo} onChange={(v) => update("nota_satisfacao_corpo", v)} lowLabel="Nada satisfeito(a)" highLabel="Totalmente satisfeito(a)" />
          </div>
        </div>

        {/* Section 4: Objetivos */}
        <SectionTitle step={4}>Objetivos e Preferências</SectionTitle>
        <div className="space-y-6">
          <div>
            <Label className="mb-2 block">Qual é o seu principal objetivo? (máx. 2)<RequiredDot /></Label>
            <CheckboxGroup options={OBJETIVOS} selected={form.objetivos} onChange={(v) => update("objetivos", v)} max={2} />
          </div>
          <div>
            <Label className="mb-2 block">Áreas do corpo que gostaria de melhorar<RequiredDot /></Label>
            <CheckboxGroup options={AREAS} selected={form.areas_melhorar} onChange={(v) => update("areas_melhorar", v)} />
          </div>
          <div>
            <Label className="mb-2 block">Período do dia para treinar<RequiredDot /></Label>
            <CheckboxGroup options={PERIODOS} selected={form.periodo_treino} onChange={(v) => update("periodo_treino", v)} />
          </div>
          <div>
            <Label className="mb-2 block">Frequência semanal<RequiredDot /></Label>
            <CheckboxGroup options={FREQUENCIAS} selected={form.frequencia_semanal} onChange={(v) => update("frequencia_semanal", v)} />
          </div>
          <div>
            <Label>Qual a sua maior dificuldade no exercício físico?<RequiredDot /></Label>
            <Textarea value={form.maior_dificuldade} onChange={(e) => update("maior_dificuldade", e.target.value)} placeholder="Ex: falta de motivação, dores, tempo..." rows={3} className={errors.includes("Maior dificuldade") ? "border-destructive" : ""} />
          </div>
          <div>
            <Label>O que você espera sentir ao final do treino experimental? (1 frase)<RequiredDot /></Label>
            <Textarea value={form.expectativa_experimental} onChange={(e) => update("expectativa_experimental", e.target.value)} placeholder="Ex: me sentir energizada e confiante" rows={2} className={errors.includes("Expectativa") ? "border-destructive" : ""} />
          </div>
        </div>

        {/* Section 5: PAR-Q */}
        <SectionTitle step={5}>PAR-Q — Questionário de Prontidão para Atividade Física</SectionTitle>
        <p className="text-sm text-muted-foreground mb-4">
          Por favor, leia atentamente e responda honestamente sim ou não.
        </p>
        <div className="border border-border rounded-lg p-4 space-y-1">
          <ParqQuestion label="Seu médico já disse que você possui algum problema cardíaco e recomendou atividades físicas apenas sob supervisão médica?" value={form.parq_problema_cardiaco} onChange={(v) => update("parq_problema_cardiaco", v)} />
          <ParqQuestion label="Quando pratica atividade física, sente dor no peito?" value={form.parq_dor_peito_exercicio} onChange={(v) => update("parq_dor_peito_exercicio", v)} />
          <ParqQuestion label="Você sentiu dor no peito no último mês?" value={form.parq_dor_peito_ultimo_mes} onChange={(v) => update("parq_dor_peito_ultimo_mes", v)} />
          <ParqQuestion label="Você já perdeu a consciência em alguma ocasião ou sofreu alguma queda em virtude de tontura?" value={form.parq_perda_consciencia} onChange={(v) => update("parq_perda_consciencia", v)} />
          <ParqQuestion label="Você possui algum problema ósseo ou articular que poderia agravar-se com a prática de atividade física?" value={form.parq_problema_osseo} onChange={(v) => update("parq_problema_osseo", v)} />
          <ParqQuestion label="Algum médico já prescreveu medicamento para pressão arterial ou para o coração?" value={form.parq_medicamento_pressao} onChange={(v) => update("parq_medicamento_pressao", v)} />
          <ParqQuestion label="Você tem algum conhecimento, por informação médica ou pela própria experiência, de algum motivo que poderia impedi-lo(a) de participar de atividades físicas sem supervisão médica?" value={form.parq_impedimento_medico} onChange={(v) => update("parq_impedimento_medico", v)} />
        </div>

        {/* Section 6: Termo */}
        <SectionTitle step={6}>Termo de Consentimento</SectionTitle>
        <div className="border border-border rounded-lg p-4 space-y-4">
          <div className="text-sm text-muted-foreground space-y-2 max-h-48 overflow-y-auto">
            <p>Este Termo de Consentimento destina-se às pessoas interessadas em participar do Treino Experimental na Fabrik. Ao aceitar este termo, você concorda com as seguintes condições:</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Concordo em participar voluntariamente do Treino Experimental oferecido pela Fabrik.</li>
              <li>Declaro que estou ciente dos riscos associados à prática de exercícios físicos intensos.</li>
              <li>Assumo total responsabilidade pela minha saúde e condição física ao participar dos treinos, eximindo o profissional de qualquer responsabilidade por eventuais intercorrências.</li>
              <li>Comprometo-me a informar o profissional sobre quaisquer condições de saúde relevantes que possam afetar minha segurança.</li>
              <li>Ao aceitar este termo, confirmo que li e compreendi todas as condições aqui estabelecidas.</li>
            </ol>
          </div>
          <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${form.aceite_termo ? "border-primary bg-primary/5" : errors.includes("Aceite do termo") ? "border-destructive" : "border-border"}`}>
            <Checkbox checked={form.aceite_termo} onCheckedChange={(v) => update("aceite_termo", v === true)} />
            <span className="text-sm font-medium">Li e concordo com o Termo de Consentimento<RequiredDot /></span>
          </label>
        </div>

        {/* Submit */}
        <div className="pt-8 pb-12">
          <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={step === 1}>
            {step === 1 ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar Anamnese"
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Suas respostas são confidenciais e serão utilizadas exclusivamente para personalizar seu treino.
          </p>
        </div>
      </form>
    </div>
  );
}
