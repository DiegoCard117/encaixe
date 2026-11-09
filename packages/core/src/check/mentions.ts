const fold = (text: string) => text.toLocaleLowerCase("pt-BR");
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function createMentionFinder(
  names: Iterable<string>,
): (text: string) => { match: string; index: number; key: string }[] {
  const keys = [...new Set([...names].map(fold))];
  if (!keys.length) return () => [];
  const alternatives = keys.sort((a, b) => b.length - a.length).map(escapeRegex);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  return (text) =>
    [...text.matchAll(pattern)].map((match) => ({
      match: match[0],
      index: match.index,
      key: fold(match[0]),
    }));
}
