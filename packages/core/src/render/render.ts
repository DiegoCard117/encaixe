import { indexFacts, type FactBank, type Profile } from "../schema/bank";
import type { Period } from "../schema/common";
import type { EducationFact, ExperienceFact, SkillFact } from "../schema/facts";
import type { ResumeDraft } from "../schema/resume";

export interface RenderedResume {
  locale: "pt-BR" | "en";
  profile: Profile;
  headline?: string;
  summary?: string;
  experiences: {
    factId: string;
    company: string;
    role: string;
    period: Period;
    employmentType?: ExperienceFact["employmentType"];
    workMode?: ExperienceFact["workMode"];
    location?: string;
    bullets: string[];
  }[];
  projects: {
    factId: string;
    name: string;
    role?: string;
    period?: Period;
    url?: string;
    repositoryUrl?: string;
    bullets: string[];
  }[];
  skills: {
    factId: string;
    name: string;
    category: SkillFact["category"];
    level?: SkillFact["level"];
  }[];
  education: {
    factId: string;
    institution: string;
    title: string;
    type: EducationFact["type"];
    status: EducationFact["status"];
    period?: Period;
  }[];
}

export function renderResume(bank: FactBank, draft: ResumeDraft, locale: "pt-BR" | "en"): RenderedResume {
  const facts = indexFacts(bank);
  return {
    locale,
    profile: bank.profile,
    headline: draft.headline?.text ?? bank.profile.headline,
    summary: draft.summary?.text,
    experiences: draft.experiences.flatMap(({ factId, bullets }) => {
      const fact = facts.get(factId);
      if (!fact || fact.archived || fact.kind !== "experience") return [];
      return [
        {
          factId,
          company: fact.company,
          role: fact.role,
          period: fact.period,
          employmentType: fact.employmentType,
          workMode: fact.workMode,
          location: fact.location,
          bullets: bullets.map((bullet) => bullet.text),
        },
      ];
    }),
    projects: draft.projects.flatMap(({ factId, bullets }) => {
      const fact = facts.get(factId);
      if (!fact || fact.archived || fact.kind !== "project") return [];
      return [
        {
          factId,
          name: fact.name,
          role: fact.role,
          period: fact.period,
          url: fact.url,
          repositoryUrl: fact.repositoryUrl,
          bullets: bullets.map((bullet) => bullet.text),
        },
      ];
    }),
    skills: draft.skillIds.flatMap((factId) => {
      const fact = facts.get(factId);
      if (!fact || fact.archived || fact.kind !== "skill") return [];
      return [
        {
          factId,
          name: fact.name,
          category: fact.category,
          level: fact.level,
        },
      ];
    }),
    education: draft.educationIds.flatMap((factId) => {
      const fact = facts.get(factId);
      if (!fact || fact.archived || fact.kind !== "education") return [];
      return [
        {
          factId,
          institution: fact.institution,
          title: fact.title,
          type: fact.type,
          status: fact.status,
          period: fact.period,
        },
      ];
    }),
  };
}
