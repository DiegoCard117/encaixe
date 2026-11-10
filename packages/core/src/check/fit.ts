import type { FactBank } from "../schema/bank";
import type { SkillFact } from "../schema/facts";
import { IMPLIED_SKILLS, KNOWN_SKILLS } from "./known-skills";
import { createMentionFinder } from "./mentions";

export interface FitAnalysis {
  /** Skills do banco mencionadas na vaga, na ordem da 1ª menção. */
  matchedSkills: { skillId: string; term: string; factIds: string[] }[];
  /** Tecnologias da vaga que o banco não tem, mas que uma skill do banco implica (ex.: SQL via MySQL). */
  impliedSkills: { term: string; via: string[] }[];
  /** Tecnologias conhecidas mencionadas na vaga que não existem no banco (nem como nome nem como apelido) nem são implicadas. Só informativo. */
  gaps: string[];
  /** Fatos relevantes, maior score primeiro; score 0 fica de fora. */
  rankedFacts: { factId: string; score: number; skillIds: string[]; tags: string[] }[];
}

const fold = (text: string) => text.toLocaleLowerCase("pt-BR");
const foldTag = (text: string) => fold(text.normalize("NFD").replace(/\p{M}/gu, ""));

export function analyzeFit(bank: FactBank, jobText: string): FitAnalysis {
  const facts = bank.facts.filter((fact) => !fact.archived);
  const relatedFacts = facts.filter((fact) => fact.kind !== "skill");
  const names = new Map<string, SkillFact>();
  for (const fact of facts) {
    if (fact.kind === "skill") {
      for (const name of [fact.name, ...fact.aliases]) names.set(fold(name), fact);
    }
  }

  const mentions = createMentionFinder(names.keys())(jobText);
  const matchedSkills: FitAnalysis["matchedSkills"] = [];
  const matchedIds = new Set<string>();
  for (const mention of mentions) {
    const skill = names.get(mention.key);
    if (!skill || matchedIds.has(skill.id)) continue;
    matchedIds.add(skill.id);
    matchedSkills.push({
      skillId: skill.id,
      term: mention.match,
      factIds: [
        ...new Set(relatedFacts.filter((fact) => fact.skillIds.includes(skill.id)).map((fact) => fact.id)),
      ],
    });
  }

  const knownNames = new Map(KNOWN_SKILLS.map((name) => [fold(name), name]));
  const implied = new Map<string, string[]>();
  for (const [skill, implying] of Object.entries(IMPLIED_SKILLS)) {
    const via = [...new Set(implying.flatMap((name) => names.get(fold(name))?.name ?? []))];
    if (via.length) implied.set(fold(skill), via);
  }
  const gaps = new Set<string>();
  const impliedSkills: FitAnalysis["impliedSkills"] = [];
  for (const mention of createMentionFinder(knownNames.keys())(jobText)) {
    if (names.has(mention.key)) continue;
    const overlaps = mentions.some(
      (matched) =>
        mention.index < matched.index + matched.match.length &&
        matched.index < mention.index + mention.match.length,
    );
    const name = knownNames.get(mention.key);
    if (overlaps || !name) continue;
    const via = implied.get(mention.key);
    if (!via) gaps.add(name);
    else if (!impliedSkills.some((item) => item.term === name)) impliedSkills.push({ term: name, via });
  }

  const normalizedJob = foldTag(jobText);
  const rankedFacts: FitAnalysis["rankedFacts"] = [];
  for (const fact of relatedFacts) {
    const skillIds = [...new Set(fact.skillIds.filter((id) => matchedIds.has(id)))];
    const tags = [...new Set(fact.tags)].filter(
      (tag) => createMentionFinder([foldTag(tag)])(normalizedJob).length > 0,
    );
    const score = 2 * skillIds.length + tags.length;
    if (score) rankedFacts.push({ factId: fact.id, score, skillIds, tags });
  }
  rankedFacts.sort((a, b) => b.score - a.score);
  return { matchedSkills, impliedSkills, gaps: [...gaps], rankedFacts };
}
