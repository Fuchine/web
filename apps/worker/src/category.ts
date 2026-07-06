// Coarse content classification (backlog: library-categories). Heuristic v1:
// keyword match over title + channel (JP and EN). No API key, no LLM cost. It's
// deliberately conservative — returns null when nothing matches, so the library
// "All" tab always works and a wrong guess never hides a video. The category
// labels mirror the library tabs. A YouTube-category or LLM upgrade can replace
// this behind the same call site later.

// First match wins, so order more specific buckets before broad ones.
const RULES: { category: string; keywords: string[] }[] = [
  { category: "VTuber", keywords: ["vtuber", "hololive", "ホロライブ", "にじさんじ", "vの", "切り抜き"] },
  { category: "Gaming", keywords: ["game", "gaming", "gameplay", "ゲーム", "実況", "プレイ", "minecraft", "マイクラ", "apex", "フォートナイト", "ポケモン"] },
  { category: "Music", keywords: ["music", "mv", "official video", "歌ってみた", "歌", "カバー", "cover", "弾いてみた", "ライブ", "song", "楽曲"] },
  { category: "Anime/Manga", keywords: ["anime", "アニメ", "manga", "漫画", "マンガ", "pv", "予告"] },
  { category: "Food", keywords: ["food", "料理", "レシピ", "recipe", "cooking", "グルメ", "mukbang", "モッパン", "食べ", "飯"] },
  { category: "Beauty/Fashion", keywords: ["beauty", "makeup", "メイク", "コスメ", "cosme", "fashion", "ファッション", "コーデ", "skincare", "スキンケア"] },
  { category: "News", keywords: ["news", "ニュース", "報道", "速報"] },
  { category: "Education", keywords: ["lesson", "講座", "授業", "勉強", "文法", "grammar", "learn japanese", "tutorial", "教室", "解説"] },
  { category: "How-to/DIY", keywords: ["diy", "how to", "how-to", "ハウツー", "作り方", "自作", "修理"] },
  { category: "Movies/Dramas", keywords: ["ドラマ", "映画", "drama", "movie", "予告編", "film"] },
  { category: "Vlog", keywords: ["vlog", "ブログ", "日常", "routine", "ルーティン", "daily"] },
  { category: "Variety", keywords: ["バラエティ", "variety", "トーク", "雑談", "talk show"] },
];

/** Best-guess category from a video's title + channel, or null if unsure. */
export function classifyCategory(title: string, channel: string | null): string | null {
  const hay = `${title} ${channel ?? ""}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => hay.includes(k))) return rule.category;
  }
  return null;
}
