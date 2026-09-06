export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

export function extractSettingRef(value: unknown): { id: string; label: string } {
  if (value == null) return { id: "", label: "" };
  if (typeof value === "string") {
    const trimmed = value.trim();
    return { id: trimmed, label: trimmed };
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const rawId = record._id ?? record.id;
    let id = "";
    if (typeof rawId === "string") {
      id = rawId.trim();
    } else if (rawId && typeof rawId === "object" && "$oid" in rawId) {
      id = String((rawId as { $oid: unknown }).$oid ?? "");
    } else if (rawId != null) {
      id = String(rawId);
    }
    const label = typeof record.label === "string" ? record.label.trim() : "";
    return { id, label };
  }
  return { id: String(value), label: "" };
}

export function findActiveSettingOption<
  T extends { _id?: { toString(): string }; label?: string; isActive?: boolean },
>(items: T[] | undefined, value: unknown): T | undefined {
  const { id, label } = extractSettingRef(value);
  const list = items ?? [];
  const isEnabled = (item: T) => item.isActive !== false;

  if (id) {
    const byId = list.find((item) => item._id?.toString() === id);
    if (byId && isEnabled(byId)) return byId;
  }

  const labelToMatch = label && !OBJECT_ID_RE.test(label) ? label : "";
  if (labelToMatch) {
    const normalized = labelToMatch.toLowerCase();
    const byLabel = list.find(
      (item) => (item.label || "").trim().toLowerCase() === normalized
    );
    if (byLabel && isEnabled(byLabel)) return byLabel;
  }

  return undefined;
}
