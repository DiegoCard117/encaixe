export const VALIDATION_CODES = [
  "required",
  "invalid_year_month",
  "period_end_before_start",
  "duplicate_tags",
  "invalid_fact_id",
  "fact_id_wrong_kind",
  "source_required",
  "duplicate_id",
  "missing_reference",
  "wrong_reference_kind",
  "ambiguous_skill_name",
] as const;
export type ValidationCode = (typeof VALIDATION_CODES)[number];
