/**
 * Humanizer for anomaly explanation tokens and rule-based alert reasons.
 * Backend already emits English-ish labels (see backend/ml/feature_schema.py
 * FEATURE_LABELS and backend/services/risk_engine.py reasons), but a few
 * snake_case tokens leak through (e.g. anomaly_score=...). This module gives
 * us a single place to:
 *   1. clean any token into a readable sentence,
 *   2. compose a one-line narrative for an event (room-aware),
 *   3. keep the operator-facing copy free of jargon.
 */

const KNOWN_PATTERNS: Array<{ test: RegExp; render: (m: RegExpMatchArray) => string }> = [
  {
    test: /^anomaly_score\s*=\s*([\d.]+)$/i,
    render: (m) => `Contextual model flagged this event (score ${Number(m[1]).toFixed(2)}).`,
  },
  {
    test: /^gas[_-]?(high|elevated)[_-](no[_-])?(motion|occupancy)/i,
    render: () => "Gas rising while the room is unoccupied",
  },
  {
    test: /^motion[_-](during[_-])?(inactive[_-]period|night|sleep)/i,
    render: () => "Unexpected motion during a learned inactive period",
  },
  {
    test: /^smoke[_-](and[_-])?temp(erature)?[_-]?(escalation|rising)/i,
    render: () => "Smoke and temperature climbing together",
  },
  {
    test: /^humidity[_-]?off[_-]?profile/i,
    render: () => "Humidity outside expected room profile",
  },
];

const DEFAULT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/_/g, " "],
  [/\s{2,}/g, " "],
];

function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .map((w, i) => {
      if (i > 0 && ["of", "the", "a", "an", "in", "on", "at", "to"].includes(w))
        return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/** Convert a single explanation token to a human-readable label. */
export function humanizeToken(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";

  for (const pattern of KNOWN_PATTERNS) {
    const m = trimmed.match(pattern.test);
    if (m) return pattern.render(m);
  }

  // If the token already looks like a sentence (contains a space and a
  // lowercase letter after an uppercase one), leave it alone — backend
  // FEATURE_LABELS already humanizes most.
  if (/[a-z]\s/.test(trimmed) && trimmed.length > 6) {
    return trimmed;
  }

  let cleaned = trimmed;
  for (const [pattern, replacement] of DEFAULT_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return titleCase(cleaned.toLowerCase());
}

/** Pretty-print a room name like "living_room" to "Living Room". */
export function humanizeRoom(room: string | null | undefined): string {
  if (!room) return "Unknown room";
  return room
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function humanizeTokens(tokens: (string | null | undefined)[] | null | undefined): string[] {
  if (!tokens || tokens.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    const h = humanizeToken(t);
    if (!h) continue;
    const key = h.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

/**
 * Compose a single narrative sentence for an anomaly event.
 * Prefers the strongest (first) explanation token and adds room context.
 */
export function composeAnomalySentence(params: {
  room?: string | null;
  tokens?: (string | null)[] | null;
  score?: number | null;
  threshold?: number | null;
}): string {
  const { room, tokens, score, threshold } = params;
  const humanized = humanizeTokens(tokens ?? []);
  const roomLabel = humanizeRoom(room);
  if (humanized.length === 0) {
    if (score != null && threshold != null) {
      return `${roomLabel} reading deviates from the learned baseline (score ${score.toFixed(1)} / threshold ${threshold.toFixed(1)}).`;
    }
    return `${roomLabel} reading deviates from the learned baseline.`;
  }
  const primary = humanized[0];
  const trailing = humanized.slice(1, 3);
  const trailingPart =
    trailing.length > 0 ? ` Additional signals: ${trailing.join("; ")}.` : "";
  return `${roomLabel}: ${primary}.${trailingPart}`;
}

/**
 * Render the rule-based alert reasons that the risk engine produces.
 * These are already English; we only normalize formatting.
 */
export function humanizeAlertReasons(
  reasons: (string | null)[] | null | undefined
): string[] {
  if (!reasons) return [];
  return reasons
    .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
    .map((r) => {
      const m = r.match(/^anomaly_score\s*=\s*([\d.]+)$/i);
      if (m) return `Contextual anomaly score ${Number(m[1]).toFixed(2)}`;
      return r;
    });
}
