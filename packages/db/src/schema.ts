// Database schema — Fase 0. Postgres + Drizzle.
// Decisions encoded here trace back to ARQUITETURA.md (D1–D8) and CONTRATO_IA.md.

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  doublePrecision,
  timestamp,
  date,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { Token, Explanation, Definition, DailyGoals } from "./types";

/* ------------------------------------------------------------------ */
/* Enums — the genuine state machines only. Everything else is text.   */
/* ------------------------------------------------------------------ */

export const videoSource = pgEnum("video_source", ["youtube"]); // D1: YouTube only in MVP
export const videoStatus = pgEnum("video_status", [
  "pending",
  "processing",
  "done",
  "failed",
]);
export const contentLevel = pgEnum("content_level", [
  "beginner",
  "intermediate",
  "advanced",
]);
export const userPlan = pgEnum("user_plan", ["free", "pro"]); // only meaningful in cloud mode

/* ------------------------------------------------------------------ */
/* Users & settings                                                    */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  plan: userPlan("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Auth.js adapter fields (additive). emailVerified is required by the adapter;
  // name/image are optional OAuth profile data.
  name: text("name"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
});

/* ------------------------------------------------------------------ */
/* Auth.js (NextAuth) adapter tables                                   */
/* ------------------------------------------------------------------ */

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // oauth | oidc | email | webauthn
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // BYOK: provider null in cloud (house key); set in self-host.
  llmProvider: text("llm_provider"), // anthropic | openai | gemini | ollama
  // AES-GCM ciphertext only. Never plaintext, never logged (CONTRATO_IA §6.3 / 7).
  apiKeyEnc: text("api_key_enc"),
  // The three language axes (CONTRATO_IA §1). target_lang is intentionally gone.
  learningLanguage: text("learning_language").notNull().default("ja"),
  explanationLanguage: text("explanation_language").notNull().default("en"),
  dailyGoals: jsonb("daily_goals").$type<DailyGoals>(),
});

/* ------------------------------------------------------------------ */
/* Content: videos, subtitle lines, dictionary, examples              */
/* ------------------------------------------------------------------ */

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: videoSource("source").notNull().default("youtube"),
    sourceId: text("source_id").notNull(), // e.g. the YouTube video id
    url: text("url").notNull(),
    title: text("title").notNull(),
    channel: text("channel"),
    durationS: integer("duration_s"),
    language: text("language").notNull().default("ja"), // D4: multilingual by design
    status: videoStatus("status").notNull().default("pending"),
    levelEstimate: contentLevel("level_estimate"), // null until computed
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Shared-cache key (D1/D3): one row per source video, reused across users.
    uniqueIndex("videos_source_source_id_uq").on(t.source, t.sourceId),
    index("videos_status_idx").on(t.status), // worker picks up pending/processing
  ],
);

export const subtitleLines = pgTable(
  "subtitle_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(), // 0-based order within the video
    tStartMs: integer("t_start_ms").notNull(),
    tEndMs: integer("t_end_ms").notNull(),
    textOriginal: text("text_original").notNull(),
    // NULLABLE on purpose: null = show JP only (SFX / blank / failed). CONTRATO_IA §3.3, §3.5.
    textTranslation: text("text_translation"),
    // Tokens embedded as jsonb (D-data-model): avoids a tokens table with tens of millions of rows.
    tokens: jsonb("tokens").$type<Token[]>().notNull().default([]),
  },
  (t) => [
    uniqueIndex("subtitle_lines_video_idx_uq").on(t.videoId, t.idx), // ordered load
    index("subtitle_lines_video_id_idx").on(t.videoId),
  ],
);

export const wordEntries = pgTable(
  "word_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    language: text("language").notNull().default("ja"),
    lemma: text("lemma").notNull(),
    reading: text("reading"),
    pos: text("pos"),
    definitions: jsonb("definitions").$type<Definition[]>().notNull().default([]),
    frequencyRank: integer("frequency_rank"), // null: not every word is ranked
  },
  (t) => [
    index("word_entries_lemma_idx").on(t.language, t.lemma), // dictionary lookup
    index("word_entries_reading_idx").on(t.language, t.reading),
    index("word_entries_freq_idx").on(t.language, t.frequencyRank), // recommendation by frequency
    // Identity of a dictionary entry for the seed: lets re-seeding upsert
    // instead of duplicating, and powers exact (lemma, reading) lookups.
    uniqueIndex("word_entries_lemma_reading_uq").on(t.language, t.lemma, t.reading),
  ],
);

export const wordExamples = pgTable(
  "word_examples",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    wordEntryId: uuid("word_entry_id")
      .notNull()
      .references(() => wordEntries.id, { onDelete: "cascade" }),
    subtitleLineId: uuid("subtitle_line_id")
      .notNull()
      .references(() => subtitleLines.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("word_examples_word_idx").on(t.wordEntryId), // "see this word in videos"
    uniqueIndex("word_examples_uq").on(t.wordEntryId, t.subtitleLineId), // dedupe
  ],
);

/* ------------------------------------------------------------------ */
/* Study: sentence cards (FSRS) + review logs                          */
/* ------------------------------------------------------------------ */

export const sentenceCards = pgTable(
  "sentence_cards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subtitleLineId: uuid("subtitle_line_id")
      .notNull()
      .references(() => subtitleLines.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    // Reserved for cloze / production templates later; MVP creates "listening".
    cardType: text("card_type").notNull().default("listening"),
    notes: text("notes"),
    // --- FSRS state (D6): maps 1:1 to a ts-fsrs Card. ---
    stability: doublePrecision("stability").notNull().default(0),
    difficulty: doublePrecision("difficulty").notNull().default(0),
    due: timestamp("due", { withTimezone: true }).notNull().defaultNow(),
    lastReview: timestamp("last_review", { withTimezone: true }),
    state: integer("state").notNull().default(0), // 0 New 1 Learning 2 Review 3 Relearning
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    elapsedDays: integer("elapsed_days").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sentence_cards_user_due_idx").on(t.userId, t.due), // the review-queue query
    index("sentence_cards_user_idx").on(t.userId),
    // One card per (user, line, type): no duplicate mining of the same line.
    uniqueIndex("sentence_cards_user_line_type_uq").on(
      t.userId,
      t.subtitleLineId,
      t.cardType,
    ),
  ],
);

export const reviewLogs = pgTable(
  "review_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => sentenceCards.id, { onDelete: "cascade" }),
    // Denormalized for per-user analytics without a join.
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Full ts-fsrs ReviewLog — lets you re-optimize FSRS params per user later (D6).
    grade: integer("grade").notNull(), // 1 Again 2 Hard 3 Good 4 Easy
    state: integer("state").notNull(), // card state at review time
    due: timestamp("due", { withTimezone: true }).notNull(),
    stability: doublePrecision("stability").notNull(),
    difficulty: doublePrecision("difficulty").notNull(),
    elapsedDays: integer("elapsed_days").notNull(),
    lastElapsedDays: integer("last_elapsed_days").notNull(),
    scheduledDays: integer("scheduled_days").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("review_logs_card_idx").on(t.cardId),
    index("review_logs_user_time_idx").on(t.userId, t.reviewedAt),
  ],
);

/* ------------------------------------------------------------------ */
/* AI explanation cache (layer 2, D3)                                  */
/* ------------------------------------------------------------------ */

export const aiExplanations = pgTable(
  "ai_explanations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subtitleLineId: uuid("subtitle_line_id")
      .notNull()
      .references(() => subtitleLines.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("line"), // "line" in MVP; "word"/"grammar_drill" reserved
    explanationLanguage: text("explanation_language").notNull(),
    promptVersion: integer("prompt_version").notNull(),
    model: text("model"), // informational only — NOT part of cache identity (CONTRATO_IA §5.2)
    content: jsonb("content").$type<Explanation>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Cache key (D3): (line, kind, explanation_language, prompt_version).
    uniqueIndex("ai_explanations_cache_uq").on(
      t.subtitleLineId,
      t.kind,
      t.explanationLanguage,
      t.promptVersion,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* Albums                                                              */
/* ------------------------------------------------------------------ */

export const albums = pgTable(
  "albums",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("albums_user_idx").on(t.userId)],
);

export const albumVideos = pgTable(
  "album_videos",
  {
    albumId: uuid("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.albumId, t.videoId] }), // composite PK = no dup membership
    index("album_videos_video_idx").on(t.videoId),
  ],
);

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

export const userWordStats = pgTable(
  "user_word_stats",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wordEntryId: uuid("word_entry_id")
      .notNull()
      .references(() => wordEntries.id, { onDelete: "cascade" }),
    views: integer("views").notNull().default(0), // times the word appeared in seen lines
    clicks: integer("clicks").notNull().default(0), // times the user opened the popup
    reviewsOk: integer("reviews_ok").notNull().default(0),
    reviewsTotal: integer("reviews_total").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.wordEntryId] })],
);

export const userDailyStats = pgTable(
  "user_daily_stats",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    msWatched: integer("ms_watched").notNull().default(0),
    linesSeen: integer("lines_seen").notNull().default(0),
    cardsCreated: integer("cards_created").notNull().default(0),
    reviewsDone: integer("reviews_done").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })], // one row per user per day → streaks
);

/* ------------------------------------------------------------------ */
/* Relations (Drizzle query API)                                       */
/* ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ one, many }) => ({
  settings: one(userSettings, {
    fields: [users.id],
    references: [userSettings.userId],
  }),
  cards: many(sentenceCards),
  albums: many(albums),
  wordStats: many(userWordStats),
  dailyStats: many(userDailyStats),
  accounts: many(accounts),
  sessions: many(sessions),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, { fields: [userSettings.userId], references: [users.id] }),
}));

export const videosRelations = relations(videos, ({ many }) => ({
  lines: many(subtitleLines),
  cards: many(sentenceCards),
  albumVideos: many(albumVideos),
  wordExamples: many(wordExamples),
}));

export const subtitleLinesRelations = relations(subtitleLines, ({ one, many }) => ({
  video: one(videos, { fields: [subtitleLines.videoId], references: [videos.id] }),
  cards: many(sentenceCards),
  explanations: many(aiExplanations),
  wordExamples: many(wordExamples),
}));

export const wordEntriesRelations = relations(wordEntries, ({ many }) => ({
  examples: many(wordExamples),
  userStats: many(userWordStats),
}));

export const wordExamplesRelations = relations(wordExamples, ({ one }) => ({
  wordEntry: one(wordEntries, {
    fields: [wordExamples.wordEntryId],
    references: [wordEntries.id],
  }),
  subtitleLine: one(subtitleLines, {
    fields: [wordExamples.subtitleLineId],
    references: [subtitleLines.id],
  }),
  video: one(videos, { fields: [wordExamples.videoId], references: [videos.id] }),
}));

export const sentenceCardsRelations = relations(sentenceCards, ({ one, many }) => ({
  user: one(users, { fields: [sentenceCards.userId], references: [users.id] }),
  subtitleLine: one(subtitleLines, {
    fields: [sentenceCards.subtitleLineId],
    references: [subtitleLines.id],
  }),
  video: one(videos, { fields: [sentenceCards.videoId], references: [videos.id] }),
  reviews: many(reviewLogs),
}));

export const reviewLogsRelations = relations(reviewLogs, ({ one }) => ({
  card: one(sentenceCards, {
    fields: [reviewLogs.cardId],
    references: [sentenceCards.id],
  }),
  user: one(users, { fields: [reviewLogs.userId], references: [users.id] }),
}));

export const aiExplanationsRelations = relations(aiExplanations, ({ one }) => ({
  subtitleLine: one(subtitleLines, {
    fields: [aiExplanations.subtitleLineId],
    references: [subtitleLines.id],
  }),
}));

export const albumsRelations = relations(albums, ({ one, many }) => ({
  user: one(users, { fields: [albums.userId], references: [users.id] }),
  albumVideos: many(albumVideos),
}));

export const albumVideosRelations = relations(albumVideos, ({ one }) => ({
  album: one(albums, { fields: [albumVideos.albumId], references: [albums.id] }),
  video: one(videos, { fields: [albumVideos.videoId], references: [videos.id] }),
}));

export const userWordStatsRelations = relations(userWordStats, ({ one }) => ({
  user: one(users, { fields: [userWordStats.userId], references: [users.id] }),
  wordEntry: one(wordEntries, {
    fields: [userWordStats.wordEntryId],
    references: [wordEntries.id],
  }),
}));

export const userDailyStatsRelations = relations(userDailyStats, ({ one }) => ({
  user: one(users, { fields: [userDailyStats.userId], references: [users.id] }),
}));

/* ------------------------------------------------------------------ */
/* Inferred types (use these across the app)                           */
/* ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type SubtitleLine = typeof subtitleLines.$inferSelect;
export type NewSubtitleLine = typeof subtitleLines.$inferInsert;
export type WordEntry = typeof wordEntries.$inferSelect;
export type SentenceCard = typeof sentenceCards.$inferSelect;
export type NewSentenceCard = typeof sentenceCards.$inferInsert;
export type ReviewLog = typeof reviewLogs.$inferSelect;
export type AiExplanation = typeof aiExplanations.$inferSelect;
export type Album = typeof albums.$inferSelect;
