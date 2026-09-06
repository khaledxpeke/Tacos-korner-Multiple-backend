export const parseArrayField = (field: unknown): unknown[] => {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  if (typeof field === "string") {
    try {
      return JSON.parse(field) as unknown[];
    } catch {
      return field.split(",").filter(Boolean);
    }
  }
  return [];
};
