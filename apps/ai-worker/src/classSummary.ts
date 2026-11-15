import type { Pool } from "pg";

/** Plain-text summary of a session's results for the teaching assistant. All numbers come from SQL. */
export async function classSummary(pool: Pool, sessionId: string): Promise<string> {
  const { rows: polls } = await pool.query<{
    seq: number;
    question: string;
    options: string[];
    correct_options: number[];
    total: string;
    correct: string;
    top_wrong: number | null;
    top_wrong_n: string | null;
  }>(
    `SELECT p.seq, p.question, p.options, p.correct_options,
            count(r.*) AS total,
            count(r.*) FILTER (WHERE r.option_index = ANY(p.correct_options)) AS correct,
            (SELECT r2.option_index FROM responses r2 WHERE r2.poll_id = p.id AND NOT r2.option_index = ANY(p.correct_options)
             GROUP BY r2.option_index ORDER BY count(*) DESC LIMIT 1) AS top_wrong,
            (SELECT count(*) FROM responses r2 WHERE r2.poll_id = p.id AND NOT r2.option_index = ANY(p.correct_options)
             GROUP BY r2.option_index ORDER BY count(*) DESC LIMIT 1) AS top_wrong_n
     FROM polls p LEFT JOIN responses r ON r.poll_id = p.id
     WHERE p.session_id = $1 AND p.ended_at IS NOT NULL
     GROUP BY p.id ORDER BY p.seq`,
    [sessionId],
  );
  const { rows: students } = await pool.query<{ name: string; answered: string; correct: string }>(
    `SELECT pa.name, count(r.poll_id) AS answered,
            count(r.poll_id) FILTER (WHERE r.option_index = ANY(p.correct_options)) AS correct
     FROM participants pa LEFT JOIN responses r ON r.participant_id = pa.id LEFT JOIN polls p ON p.id = r.poll_id
     WHERE pa.session_id = $1 AND pa.kicked_at IS NULL GROUP BY pa.id ORDER BY pa.name`,
    [sessionId],
  );
  if (!polls.length) return `No questions have been asked yet. ${students.length} students have joined.`;

  const lines = polls.map((p) => {
    const total = Number(p.total);
    const acc = total ? Math.round((Number(p.correct) / total) * 100) : 0;
    const wrong =
      p.top_wrong !== null ? `; most common wrong answer "${p.options[p.top_wrong]}" (${p.top_wrong_n} students)` : "";
    return `Q${p.seq}: "${p.question}" correct answer "${p.correct_options.map((i) => p.options[i]).join(" / ")}": ${acc}% correct (${p.correct}/${total})${wrong}`;
  });
  const studentLines = students.map(
    (s) => `${s.name}: ${s.correct}/${polls.length} correct${Number(s.answered) < polls.length ? `, skipped ${polls.length - Number(s.answered)}` : ""}`,
  );
  return `Questions asked (${polls.length}):\n${lines.join("\n")}\n\nStudents (${students.length}):\n${studentLines.join("\n")}`;
}
