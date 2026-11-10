import { indexFacts, type FactBank, type Profile } from "../schema/bank";
import type { Period } from "../schema/common";
import type { EducationFact, ExperienceFact, SkillCategory, SkillFact } from "../schema/facts";
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
  skillGroups: {
    category: SkillCategory;
    skills: { factId: string; name: string; level?: SkillFact["level"] }[];
  }[];
  education: {
    factId: string;
    institution: string;
    title: string;
    type: EducationFact["type"];
    status: EducationFact["status"];
    period?: Period;
  }[];
  certifications: RenderedResume["education"];
  languages: RenderedResume["skills"];
}

function reverseChronological(a: { period?: Period }, b: { period?: Period }): number {
  if (!a.period) return b.period ? 1 : 0;
  if (!b.period) return -1;
  const aCurrent = a.period.end === null;
  const bCurrent = b.period.end === null;
  if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
  return (
    (b.period.end ?? "").localeCompare(a.period.end ?? "") || b.period.start.localeCompare(a.period.start)
  );
}

export function renderResume(
  bank: FactBank,
  draft: ResumeDraft,
  locale: "pt-BR" | "en",
  jobSkillIds: string[] = [],
): RenderedResume {
  const facts = indexFacts(bank);
  const skills = draft.skillIds.flatMap((factId) => {
    const fact = facts.get(factId);
    if (!fact || fact.archived || fact.kind !== "skill") return [];
    return [{ factId, name: fact.name, category: fact.category, level: fact.level }];
  });
  const education = draft.educationIds
    .flatMap((factId) => {
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
    })
    .sort(reverseChronological);
  const isCertification = (item: RenderedResume["education"][number]) =>
    ["course", "certification", "bootcamp"].includes(item.type);
  const priority = new Map([...new Set(jobSkillIds)].map((id, index) => [id, index]));
  const displayedSkills = skills
    .filter((skill) => skill.category !== "spoken_language")
    .sort(
      (a, b) =>
        (priority.get(a.factId) ?? jobSkillIds.length) - (priority.get(b.factId) ?? jobSkillIds.length),
    )
    .slice(0, 20);
  const skillGroups: RenderedResume["skillGroups"] = [];
  for (const { category, ...skill } of displayedSkills) {
    const group = skillGroups.find((group) => group.category === category);
    if (group) group.skills.push(skill);
    else skillGroups.push({ category, skills: [skill] });
  }
  return {
    locale,
    profile: bank.profile,
    headline: draft.headline?.text ?? bank.profile.headline,
    summary: draft.summary?.text,
    experiences: draft.experiences
      .flatMap(({ factId, bullets }) => {
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
      })
      .sort(reverseChronological),
    projects: draft.projects
      .flatMap(({ factId, bullets }) => {
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
      })
      .sort(reverseChronological),
    skills: displayedSkills,
    skillGroups,
    languages: skills.filter((skill) => skill.category === "spoken_language"),
    education: education.filter((item) => !isCertification(item)),
    certifications: education.filter(isCertification),
  };
}
