const JSON_KEYS = new Set([
  "customerData",
  "documentData",
  "deliveryData",
  "paymentData",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mergeRouterV2StatePatches(
  currentState: Record<string, unknown> | null,
  ...patches: Array<Record<string, unknown> | null | undefined>
) {
  const result: Record<string, unknown> = {};

  for (const patch of patches) {
    if (!patch) continue;

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;

      if (JSON_KEYS.has(key) && isRecord(value)) {
        const baseValue =
          isRecord(result[key])
            ? result[key]
            : isRecord(currentState?.[key])
              ? currentState?.[key]
              : {};

        result[key] = {
          ...(baseValue as Record<string, unknown>),
          ...value,
        };
        continue;
      }

      result[key] = value;
    }
  }

  return result;
}
