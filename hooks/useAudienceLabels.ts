import { useEffect, useState } from "react";

export const AUDIENCE_DEFAULTS: Record<string, string> = {
  CHILDREN:    "Children",
  YOUTH:       "Youth",
  ADULTS:      "Adults",
  UNSPECIFIED: "Unspecified",
};

export const AUDIENCE_VALUES = ["CHILDREN", "YOUTH", "ADULTS", "UNSPECIFIED"] as const;

/**
 * Loads audience level display labels from the AUDIENCE_LEVEL_LABELS settings key.
 * Falls back to defaults if the setting is missing or unparseable.
 */
export function useAudienceLabels() {
  const [labels, setLabels] = useState<Record<string, string>>(AUDIENCE_DEFAULTS);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        try {
          const parsed = JSON.parse(data.AUDIENCE_LEVEL_LABELS ?? "{}");
          setLabels({ ...AUDIENCE_DEFAULTS, ...parsed });
        } catch { /* use defaults */ }
      })
      .catch(() => { /* use defaults */ });
  }, []);

  return labels;
}
