export type LastSync = { bankJson: string; remoteUpdatedAt: string };
export type Remote = { bankJson: string; updatedAt: string } | undefined;
export type Decision = "same" | "push" | "pull" | "conflict";

export function decideSync(
  localJson: string | undefined,
  remote: Remote,
  last: LastSync | undefined,
): Decision {
  if (!remote) return localJson === undefined ? "same" : "push";
  if (localJson === undefined) return "pull";
  if (localJson === remote.bankJson) return "same";
  if (!last) return "conflict";
  if (localJson === last.bankJson) return "pull";
  if (remote.updatedAt === last.remoteUpdatedAt) return "push";
  return "conflict";
}
