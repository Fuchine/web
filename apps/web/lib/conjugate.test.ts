import { describe, it, expect } from "vitest";
import { conjugate, type ConjForm } from "./conjugate";

/** Helper: map a form list to "label: word/reading" strings for compact asserts. */
function fmt(forms: ConjForm[] | null): string[] | null {
  return forms && forms.map((f) => `${f.label}: ${f.word}/${f.reading}`);
}

describe("conjugate — godan", () => {
  it("v5k 歩く", () => {
    expect(fmt(conjugate("歩く", "あるく", "v5k,vi"))).toEqual([
      "Dictionary: 歩く/あるく",
      "Te-form: 歩いて/あるいて",
      "Past: 歩いた/あるいた",
      "Negative: 歩かない/あるかない",
      "Polite: 歩きます/あるきます",
      "Potential: 歩ける/あるける",
    ]);
  });
  it("v5g 泳ぐ", () => {
    const f = conjugate("泳ぐ", "およぐ", "v5g")!;
    expect(fmt([f[1]!, f[3]!])).toEqual(["Te-form: 泳いで/およいで", "Negative: 泳がない/およがない"]);
  });
  it("v5s 話す te+potential", () => {
    const f = conjugate("話す", "はなす", "v5s")!;
    expect(f[1]!.word).toBe("話して");
    expect(f[5]!.word).toBe("話せる");
  });
  it("v5t 待つ", () => { expect(conjugate("待つ", "まつ", "v5t")![1]!.word).toBe("待って"); });
  it("v5n 死ぬ", () => { expect(conjugate("死ぬ", "しぬ", "v5n")![1]!.word).toBe("死んで"); });
  it("v5b 遊ぶ", () => { expect(conjugate("遊ぶ", "あそぶ", "v5b")![2]!.word).toBe("遊んだ"); });
  it("v5m 飲む", () => { expect(conjugate("飲む", "のむ", "v5m")![1]!.word).toBe("飲んで"); });
  it("v5r 帰る (godan, not ichidan)", () => {
    const f = conjugate("帰る", "かえる", "v5r,vi")!;
    expect(f[1]!.word).toBe("帰って");
    expect(f[3]!.word).toBe("帰らない");
  });
  it("v5u 買う — negative is わない", () => {
    const f = conjugate("買う", "かう", "v5u,vt")!;
    expect(f[1]!.word).toBe("買って");
    expect(f[3]!.word).toBe("買わない");
    expect(f[4]!.word).toBe("買います");
  });
  it("v5k-s 行く — te is って", () => {
    expect(fmt(conjugate("行く", "いく", "v5k-s,vi,aux-v"))).toEqual([
      "Dictionary: 行く/いく",
      "Te-form: 行って/いって",
      "Past: 行った/いった",
      "Negative: 行かない/いかない",
      "Polite: 行きます/いきます",
      "Potential: 行ける/いける",
    ]);
  });
});

describe("conjugate — ichidan", () => {
  it("v1 食べる", () => {
    expect(fmt(conjugate("食べる", "たべる", "v1,vt"))).toEqual([
      "Dictionary: 食べる/たべる",
      "Te-form: 食べて/たべて",
      "Past: 食べた/たべた",
      "Negative: 食べない/たべない",
      "Polite: 食べます/たべます",
      "Potential: 食べられる/たべられる",
    ]);
  });
});

describe("conjugate — suru", () => {
  it("する", () => {
    expect(fmt(conjugate("する", "する", "vs-i"))).toEqual([
      "Dictionary: する/する",
      "Te-form: して/して",
      "Past: した/した",
      "Negative: しない/しない",
      "Polite: します/します",
      "Potential: できる/できる",
    ]);
  });
  it("noun+suru 勉強", () => {
    const f = conjugate("勉強", "べんきょう", "n,vs")!;
    expect(f[0]!.word).toBe("勉強する");
    expect(f[1]!.word).toBe("勉強して");
    expect(f[5]!.word).toBe("勉強できる");
    expect(f[5]!.reading).toBe("べんきょうできる");
  });
});

describe("conjugate — kuru", () => {
  it("来る reading changes stem", () => {
    expect(fmt(conjugate("来る", "くる", "vk,vi"))).toEqual([
      "Dictionary: 来る/くる",
      "Te-form: 来て/きて",
      "Past: 来た/きた",
      "Negative: 来ない/こない",
      "Polite: 来ます/きます",
      "Potential: 来られる/こられる",
    ]);
  });
});

describe("conjugate — i-adjective (4 forms)", () => {
  it("高い", () => {
    expect(fmt(conjugate("高い", "たかい", "adj-i"))).toEqual([
      "Dictionary: 高い/たかい",
      "Te-form: 高くて/たかくて",
      "Past: 高かった/たかかった",
      "Negative: 高くない/たかくない",
    ]);
  });
});

describe("conjugate — non-conjugating → null", () => {
  it("noun", () => { expect(conjugate("猫", "ねこ", "n")).toBeNull(); });
  it("na-adjective", () => { expect(conjugate("静か", "しずか", "adj-na")).toBeNull(); });
  it("missing reading", () => { expect(conjugate("猫", null, "v1")).toBeNull(); });
  it("missing pos", () => { expect(conjugate("猫", "ねこ", null)).toBeNull(); });
});
