import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Violation } from "@encaixe/core";
import type { ViolationCode } from "../../../packages/core/src/check/anti-invention";
import { VALIDATION_CODES, type ValidationCode } from "../../../packages/core/src/schema/codes";

export type Locale = "pt-BR" | "en";

const ptBR = {
  "editor.steps": "Etapas do currículo",
  "editor.step1": "1 Banco de fatos",
  "editor.step2": "2 Vaga e aderência",
  "editor.step3": "3 Revisão",
  "editor.soon": "em breve",
  "editor.saved": "Salvo neste navegador",
  "editor.notSaved": "Ainda não salvo neste navegador",
  "editor.subtitle": "Seu currículo, encaixado na vaga. Sem inventar nada.",
  "editor.export": "Exportar JSON",
  "editor.import": "Importar JSON",
  "editor.replace": "Substituir o banco atual pelo arquivo importado?",
  "editor.start": "Começar do zero",
  "editor.old": "Importar currículo antigo",
  "editor.example": "carregar exemplo",
  "editor.welcome": "Monte seu banco de fatos",
  "editor.intro": "Cadastre o que você fez. Estes fatos serão as fontes do seu currículo.",
  "editor.startHelp": "Crie seu perfil e adicione experiências, projetos e conquistas.",
  "editor.importHelp": "Continue a partir de um banco de fatos em JSON.",
  "editor.oldHelp": "Extraia fatos de um currículo e revise cada um.",
  "editor.invalid": "O conteúdo salvo neste navegador é inválido. Baixe uma cópia antes de começar de novo.",
  "editor.raw": "Baixar conteúdo bruto",
  "editor.restart": "Começar de novo",
  "editor.restartConfirm": "Descartar o conteúdo salvo inválido e começar de novo?",
  "editor.storageError":
    "Não foi possível salvar neste navegador. Exporte o JSON para guardar suas alterações.",
  "editor.readError": "Não foi possível ler o arquivo.",
  "editor.remote": "Banco remoto (opcional)",
  "editor.remoteHelp": "Sincronização entre dispositivos. Você pode continuar usando apenas este navegador.",
  "editor.profile": "Perfil",
  "editor.editProfile": "Editar perfil",
  "editor.empty": "Nenhum fato cadastrado nesta seção.",
  "editor.experience": "Experiências",
  "editor.project": "Projetos",
  "editor.education": "Formação",
  "editor.skill": "Skills",
  "editor.achievement": "Conquistas",
  "editor.add": "Adicionar",
  "editor.addAchievement": "+ Conquista",
  "editor.edit": "Editar",
  "editor.delete": "Excluir",
  "editor.deleteConfirm": "Excluir o fato {id}?",
  "editor.blocked": "Este fato é referenciado por:",
  "editor.archive": "Arquivar",
  "editor.unarchive": "Desarquivar",
  "editor.archived": "arquivado",
  "editor.save": "Salvar",
  "editor.cancel": "Cancelar",
  "editor.close": "Fechar",
  "editor.newFact": "Adicionar fato",
  "editor.editFact": "Editar fato",
  "editor.metrics": "Métricas",
  "editor.addMetric": "Adicionar métrica",
  "editor.remove": "Remover",
  "editor.links": "Links",
  "editor.addLink": "Adicionar link",
  "editor.period": "Informar período",
  "editor.current": "Atual",
  "editor.optional": "Não informado",
  "editor.commas": "Separe os valores por vírgula.",
  "field.fullName": "Nome completo",
  "field.headline": "Título profissional",
  "field.email": "E-mail",
  "field.phone": "Telefone",
  "field.location": "Localização",
  "field.locale": "Idioma do currículo",
  "field.company": "Empresa",
  "field.role": "Cargo / papel",
  "field.employmentType": "Vínculo",
  "field.workMode": "Modalidade",
  "field.summary": "Resumo",
  "field.name": "Nome",
  "field.description": "Descrição",
  "field.contextId": "Contexto",
  "field.url": "URL",
  "field.repositoryUrl": "URL do repositório",
  "field.text": "Conquista",
  "field.date": "Data",
  "field.category": "Categoria",
  "field.level": "Nível",
  "field.aliases": "Apelidos",
  "field.institution": "Instituição",
  "field.title": "Título",
  "field.type": "Tipo de formação",
  "field.status": "Situação",
  "field.credentialUrl": "URL da credencial",
  "field.tags": "Tags",
  "field.skillIds": "Skills utilizadas",
  "field.start": "Início",
  "field.end": "Fim",
  "field.value": "Valor",
  "field.unit": "Unidade",
  "field.label": "Rótulo",
  "enum.pt-BR": "Português (Brasil)",
  "enum.en": "Inglês",
  "enum.employee": "CLT",
  "enum.contractor": "PJ",
  "enum.internship": "Estágio",
  "enum.freelance": "Freelance",
  "enum.volunteer": "Voluntariado",
  "enum.other": "Outro",
  "enum.onsite": "Presencial",
  "enum.hybrid": "Híbrido",
  "enum.remote": "Remoto",
  "enum.programming_language": "Linguagem de programação",
  "enum.framework": "Framework",
  "enum.library": "Biblioteca",
  "enum.database": "Banco de dados",
  "enum.tool": "Ferramenta",
  "enum.platform": "Plataforma",
  "enum.practice": "Prática",
  "enum.soft_skill": "Habilidade interpessoal",
  "enum.spoken_language": "Idioma",
  "enum.basic": "Básico",
  "enum.intermediate": "Intermediário",
  "enum.advanced": "Avançado",
  "enum.expert": "Especialista",
  "enum.high_school": "Ensino médio",
  "enum.technical": "Técnico",
  "enum.technologist": "Tecnólogo",
  "enum.bachelor": "Bacharelado",
  "enum.postgraduate": "Pós-graduação",
  "enum.master": "Mestrado",
  "enum.doctorate": "Doutorado",
  "enum.course": "Curso",
  "enum.bootcamp": "Bootcamp",
  "enum.certification": "Certificação",
  "enum.completed": "Concluído",
  "enum.in_progress": "Em andamento",
  "enum.incomplete": "Incompleto",
  "app.name": "Encaixe",
  "app.title": "Encaixe — Banco de fatos",
  "app.subtitle": "Playground do checador anti-invenção",
  "header.theme": "Tema atual: {theme}. Alternar tema",
  "header.locale": "Idioma atual: Português. Mudar para inglês",
  "header.localeShort": "PT",
  "theme.system": "Sistema",
  "theme.light": "Claro",
  "theme.dark": "Escuro",
  "bank.title": "Banco de fatos",
  "bank.help": "Dados fictícios. Clique em um ID para copiar.",
  "bank.copy": "Copiar ID {id}",
  "bank.copied": "ID copiado: {id}",
  "bank.copyFailed": "Não foi possível copiar. Copie manualmente: {id}",
  "draft.title": "Rascunho (JSON)",
  "draft.reset": "Restaurar exemplo",
  "draft.help":
    "Edite o JSON para conferir as fontes em tempo real. O exemplo contém invenções intencionais.",
  "draft.invalidJson": "JSON inválido",
  "draft.root": "raiz",
  "draft.invalidValue": "Valor inválido",
  "check.count": "{count} violações",
  "check.one": "{count} violação",
  "check.success": "Nenhuma invenção encontrada",
  "check.preview": "Prévia",
  "check.violations": "Violações",
  "check.value": "Valor:",
};

const en: Record<keyof typeof ptBR, string> = {
  "editor.steps": "Resume steps",
  "editor.step1": "1 Fact bank",
  "editor.step2": "2 Job and match",
  "editor.step3": "3 Review",
  "editor.soon": "coming soon",
  "editor.saved": "Saved in this browser",
  "editor.notSaved": "Not yet saved in this browser",
  "editor.subtitle": "Your resume, matched to the job. Without inventing anything.",
  "editor.export": "Export JSON",
  "editor.import": "Import JSON",
  "editor.replace": "Replace the current bank with the imported file?",
  "editor.start": "Start from scratch",
  "editor.old": "Import an old resume",
  "editor.example": "load example",
  "editor.welcome": "Build your fact bank",
  "editor.intro": "Record what you have done. These facts will be the sources for your resume.",
  "editor.startHelp": "Create your profile and add experiences, projects and achievements.",
  "editor.importHelp": "Continue from a fact bank in JSON.",
  "editor.oldHelp": "Extract facts from a resume and review each one.",
  "editor.invalid": "The content saved in this browser is invalid. Download a copy before starting over.",
  "editor.raw": "Download raw content",
  "editor.restart": "Start over",
  "editor.restartConfirm": "Discard the invalid saved content and start over?",
  "editor.storageError": "Could not save in this browser. Export JSON to keep your changes.",
  "editor.readError": "Could not read the file.",
  "editor.remote": "Remote bank (optional)",
  "editor.remoteHelp": "Sync across devices. You can keep using just this browser.",
  "editor.profile": "Profile",
  "editor.editProfile": "Edit profile",
  "editor.empty": "No facts in this section yet.",
  "editor.experience": "Experiences",
  "editor.project": "Projects",
  "editor.education": "Education",
  "editor.skill": "Skills",
  "editor.achievement": "Achievements",
  "editor.add": "Add",
  "editor.addAchievement": "+ Achievement",
  "editor.edit": "Edit",
  "editor.delete": "Delete",
  "editor.deleteConfirm": "Delete fact {id}?",
  "editor.blocked": "This fact is referenced by:",
  "editor.archive": "Archive",
  "editor.unarchive": "Unarchive",
  "editor.archived": "archived",
  "editor.save": "Save",
  "editor.cancel": "Cancel",
  "editor.close": "Close",
  "editor.newFact": "Add fact",
  "editor.editFact": "Edit fact",
  "editor.metrics": "Metrics",
  "editor.addMetric": "Add metric",
  "editor.remove": "Remove",
  "editor.links": "Links",
  "editor.addLink": "Add link",
  "editor.period": "Include period",
  "editor.current": "Current",
  "editor.optional": "Not specified",
  "editor.commas": "Separate values with commas.",
  "field.fullName": "Full name",
  "field.headline": "Professional headline",
  "field.email": "Email",
  "field.phone": "Phone",
  "field.location": "Location",
  "field.locale": "Resume language",
  "field.company": "Company",
  "field.role": "Role",
  "field.employmentType": "Employment type",
  "field.workMode": "Work mode",
  "field.summary": "Summary",
  "field.name": "Name",
  "field.description": "Description",
  "field.contextId": "Context",
  "field.url": "URL",
  "field.repositoryUrl": "Repository URL",
  "field.text": "Achievement",
  "field.date": "Date",
  "field.category": "Category",
  "field.level": "Level",
  "field.aliases": "Aliases",
  "field.institution": "Institution",
  "field.title": "Title",
  "field.type": "Education type",
  "field.status": "Status",
  "field.credentialUrl": "Credential URL",
  "field.tags": "Tags",
  "field.skillIds": "Skills used",
  "field.start": "Start",
  "field.end": "End",
  "field.value": "Value",
  "field.unit": "Unit",
  "field.label": "Label",
  "enum.pt-BR": "Portuguese (Brazil)",
  "enum.en": "English",
  "enum.employee": "Employee",
  "enum.contractor": "Contractor",
  "enum.internship": "Internship",
  "enum.freelance": "Freelance",
  "enum.volunteer": "Volunteer",
  "enum.other": "Other",
  "enum.onsite": "On site",
  "enum.hybrid": "Hybrid",
  "enum.remote": "Remote",
  "enum.programming_language": "Programming language",
  "enum.framework": "Framework",
  "enum.library": "Library",
  "enum.database": "Database",
  "enum.tool": "Tool",
  "enum.platform": "Platform",
  "enum.practice": "Practice",
  "enum.soft_skill": "Soft skill",
  "enum.spoken_language": "Spoken language",
  "enum.basic": "Basic",
  "enum.intermediate": "Intermediate",
  "enum.advanced": "Advanced",
  "enum.expert": "Expert",
  "enum.high_school": "High school",
  "enum.technical": "Technical",
  "enum.technologist": "Technologist",
  "enum.bachelor": "Bachelor",
  "enum.postgraduate": "Postgraduate",
  "enum.master": "Master",
  "enum.doctorate": "Doctorate",
  "enum.course": "Course",
  "enum.bootcamp": "Bootcamp",
  "enum.certification": "Certification",
  "enum.completed": "Completed",
  "enum.in_progress": "In progress",
  "enum.incomplete": "Incomplete",
  "app.name": "Encaixe",
  "app.title": "Encaixe — Fact bank",
  "app.subtitle": "Anti-invention checker playground",
  "header.theme": "Current theme: {theme}. Switch theme",
  "header.locale": "Current language: English. Switch to Portuguese",
  "header.localeShort": "EN",
  "theme.system": "System",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "bank.title": "Fact bank",
  "bank.help": "Fictional data. Click an ID to copy it.",
  "bank.copy": "Copy ID {id}",
  "bank.copied": "ID copied: {id}",
  "bank.copyFailed": "Could not copy. Copy manually: {id}",
  "draft.title": "Draft (JSON)",
  "draft.reset": "Restore example",
  "draft.help": "Edit the JSON to check sources in real time. The example contains intentional inventions.",
  "draft.invalidJson": "Invalid JSON",
  "draft.root": "root",
  "draft.invalidValue": "Invalid value",
  "check.count": "{count} violations",
  "check.one": "{count} violation",
  "check.success": "No inventions found",
  "check.preview": "Preview",
  "check.violations": "Violations",
  "check.value": "Value:",
};

const violations: Record<Locale, Record<ViolationCode, string>> = {
  "pt-BR": {
    unknown_fact: "Fato desconhecido: {value}",
    archived_fact: "Fato arquivado: {value}",
    wrong_context: "Fonte fora do contexto: {value}",
    unsupported_skill: "Competência sem apoio nas fontes: {value}",
    unsupported_number: "Número sem apoio nas fontes: {value}",
  },
  en: {
    unknown_fact: "Unknown fact: {value}",
    archived_fact: "Archived fact: {value}",
    wrong_context: "Source outside the context: {value}",
    unsupported_skill: "Skill unsupported by the sources: {value}",
    unsupported_number: "Number unsupported by the sources: {value}",
  },
};

const validation: Record<Locale, Record<ValidationCode, string>> = {
  "pt-BR": {
    required: "Campo obrigatório",
    invalid_year_month: "Data inválida; use AAAA-MM",
    period_end_before_start: "O fim do período deve ser igual ou posterior ao início",
    duplicate_tags: "Tags duplicadas",
    invalid_fact_id: "ID de fato inválido",
    fact_id_wrong_kind: "O ID do fato não corresponde ao seu tipo",
    source_required: "Informe pelo menos uma fonte",
    duplicate_id: "ID duplicado: {id}",
    missing_reference: "Referência não encontrada: {id}",
    wrong_reference_kind: "A referência não corresponde ao tipo esperado",
    ambiguous_skill_name: "Nome de competência ambíguo: {name}",
  },
  en: {
    required: "Required field",
    invalid_year_month: "Invalid date; use YYYY-MM",
    period_end_before_start: "The period must end on or after its start",
    duplicate_tags: "Duplicate tags",
    invalid_fact_id: "Invalid fact ID",
    fact_id_wrong_kind: "The fact ID does not match its kind",
    source_required: "Provide at least one source",
    duplicate_id: "Duplicate ID: {id}",
    missing_reference: "Reference not found: {id}",
    wrong_reference_kind: "The reference does not match the expected kind",
    ambiguous_skill_name: "Ambiguous skill name: {name}",
  },
};

type Params = Record<string, unknown>;
type Issue = { message: string; params?: Params };
export type TranslationKey = keyof typeof ptBR;

function interpolate(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    params[name] === undefined ? placeholder : String(params[name]),
  );
}

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem("encaixe.locale");
    if (saved === "pt-BR" || saved === "en") return saved;
  } catch {
    // Fall back to the browser language when storage is unavailable.
  }
  return navigator.language.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}

type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Params) => string;
  tViolation: (violation: Violation) => string;
  tIssue: (issue: Issue) => string;
};

const LocaleContext = createContext<I18n | undefined>(undefined);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const dictionary = locale === "pt-BR" ? ptBR : en;

  useEffect(() => {
    try {
      localStorage.setItem("encaixe.locale", locale);
    } catch {
      // Language switching still works without storage.
    }
    document.documentElement.lang = locale;
    document.title = dictionary["app.title"];
  }, [locale, dictionary]);

  const t: I18n["t"] = (key, params) => interpolate(dictionary[key], params);
  const tViolation: I18n["tViolation"] = (violation) =>
    interpolate(violations[locale][violation.code], { value: violation.value });
  const tIssue: I18n["tIssue"] = (issue) => {
    const code = VALIDATION_CODES.find((candidate) => candidate === issue.message);
    return code ? interpolate(validation[locale][code], issue.params) : t("draft.invalidValue");
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t, tViolation, tIssue }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useI18n(): I18n {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useI18n requires LocaleProvider");
  return context;
}
