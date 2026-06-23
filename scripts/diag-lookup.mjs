import postgres from 'postgres';

const sql = postgres('postgres://fuchine:fuchine@localhost:5432/fuchine', { prepare: false });

async function testLookup(lemma) {
  const result = await sql`
    SELECT id, lemma, reading, pos
    FROM word_entries
    WHERE language = 'ja' AND (lemma = ${lemma} OR reading = ${lemma})
    ORDER BY frequency_rank NULLS LAST
    LIMIT 5
  `;
  console.log(`Lookup "${lemma}": ${result.length} results`);
  for (const r of result) {
    console.log(`  id=${r.id} lemma="${r.lemma}" reading="${r.reading}" pos="${r.pos}"`);
  }
}

async function main() {
  await testLookup('皆さん');
  await testLookup('はい');
  await testLookup('する');
  await testLookup('日本語');
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
