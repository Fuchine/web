const POS_LABELS: Record<string, string> = {
  n: "Noun",
  pn: "Pronoun",
  "adj-i": "I-adjective",
  "adj-na": "Na-adjective",
  "adj-no": "Adjective (の)",
  "adj-pn": "Pre-noun adjectival",
  adv: "Adverb",
  "adv-to": "Adverb (と)",
  aux: "Auxiliary",
  "aux-v": "Auxiliary verb",
  "aux-adj": "Auxiliary adjective",
  conj: "Conjunction",
  cop: "Copula",
  ctr: "Counter",
  exp: "Expression",
  int: "Interjection",
  num: "Numeric",
  pref: "Prefix",
  suf: "Suffix",
  prt: "Particle",
  v1: "Ichidan verb",
  "v1-s": "Ichidan verb",
  vk: "Kuru verb",
  vz: "Ichidan verb (zuru)",
  vs: "Suru verb",
  "vs-i": "Suru verb",
  "vs-s": "Suru verb",
  vi: "intransitive",
  vt: "transitive",
};

function labelFor(code: string): string {
  if (POS_LABELS[code]) return POS_LABELS[code];
  if (/^v5/.test(code)) return "Godan verb";
  return code;
}

export function posLabel(pos: string | null | undefined): string {
  if (!pos) return "";
  const labels = pos.split(",").map((c) => labelFor(c.trim())).filter(Boolean);
  return [...new Set(labels)].join(" · ");
}
