# Mei · Mandarin Lessons

Password-gated (pattern lock) GitHub Pages site for Evan’s Mandarin lessons.
Lessons are public at the URL; the lock is only obfuscation.

- Repo: https://github.com/Atlas-Grok/mandarin-lessons
- Live: https://atlas-grok.github.io/mandarin-lessons/

No framework and no build step: plain HTML, CSS, and vanilla JS.

## Pages

| Path | Role |
|------|------|
| `index.html` | Lesson list, from `lessons/index.json` (newest first) |
| `lesson.html?id=l12` | One lesson: teach + interactive practice |
| `lessons/<id>/lesson.json` | Lesson content, answer key, and local audio filenames |
| `lessons/<id>/*.mp3` | Listen clips |
| `assets/style.css` | Patinated-copper theme with cream lesson cards |
| `assets/grade.js` | Port of `grade_practice.py` |
| `assets/report.js` | Renders published `grade.json` report cards |
| `lessons/<id>/grade.json` | Published scored report (optional; not in `index.json`) |
| `assets/lock.js` | 3×3 pattern lock |
| `assets/config.js` | `SUBMIT_URL` placeholder for the Apps Script endpoint |

## Default lock pattern

Dots are numbered 1–9 left to right, top to bottom:

```
1 2 3
4 5 6
7 8 9
```

The default is an **L-shape: 1-4-7-8-9** (top-left, mid-left, bottom-left,
bottom-center, bottom-right). Unlock is remembered in `localStorage` under
`mei-mandarin-unlock-hash`. Only the SHA-256 hash of the hyphenated sequence
is stored in `assets/lock.js`.

To change it:

```bash
python3 tools/hash_pattern.py 1-2-3-6-9
```

Paste the printed hex into `PATTERN_HASH` in `assets/lock.js` and push.
Anyone who already unlocked will be asked again, because the stored hash
will no longer match.

## Lesson JSON schema

Same fields as today’s `lesson.yaml`, saved as JSON, with the answer key
embedded. A live example is `lessons/l12/lesson.json`.

Top level:

- Required: `lesson_number`, `title_en`
- Optional: `title_py`, `category`, `hsk`, `date`, `auditory_note`, `banner`,
  `teach`, `practice`, `picture_note`, `closing`, `answer_key`

`teach.blocks[]` types: `heading`, `vocab_card`, `callout`, `paragraph`,
`example`, `review_table`.

`practice.sections[].items[]` types: `prompt`, `match`, `fill`, `unscramble`,
`about_you`, `picture`, `say`. Use `listen_url` as a filename in the same
lesson folder (for example `l12-mao.mp3`), not a Drive link.

Write `practice.how_to` for the website (type in the boxes, record 🎤 items,
tap Submit). Voice items are `type: say` with `n` like `S1`.

### Answer key

```json
"answer_key": {
  "items": [
    {
      "n": "1",
      "kind": "pinyin",
      "expected": ["zhī"],
      "words": ["zhī"]
    },
    {
      "n": "18",
      "kind": "sentence",
      "expected": ["Wǒ xǐhuan māo.", "Wǒ xǐhuan gǒu."],
      "regex": "wǒ\\s*xǐhuan\\s*(māo|gǒu)",
      "words": ["xǐhuan", "māo", "gǒu"]
    },
    { "n": "S1", "kind": "voice", "words": ["gǒu"] }
  ]
}
```

Fields used by the grader (`assets/grade.js`, same rules as
`grade_practice.py`):

- `n`: item id (`"1"` or `"S1"`)
- `kind`: `choice` · `pinyin` · `english` · `fill` · `unscramble` · `sentence` · `free` · `voice`
- `expected` (or `expected_any`): string or list of accepted answers
- `accept_any`: a list of extra variants, `"number"` (fill `___` in `expected`
  with a cardinal), or `{ "regex": "..." }`
- `regex` / `accept_regex`: a string or list; must **full-match** the
  normalized answer (not a substring)
- `words`: vocabulary ids for mastery `sheet_patches`
- `note`: if it contains “any true number”, treated like `accept_any: "number"`

Scoring: correct +15, partial (right syllables, missing or wrong tone marks)
+8, wrong −12, skipped (blank) −5. Spacing-only differences on pinyin /
sentence / fill items still get full credit. `choice` and `english` do not
take the tone-partial path. Voice items are not scored by the site.

Normalization: NFC, trim, collapse spaces, lowercase, strip trailing
`?!.。？！`, and `ü` ≡ `v` ≡ `u:`.

## Publishing a lesson

Mei publishes from the `bot-scripts` routine (branch / PR
`story/mandarin-site-publish`):

```bash
python3 routines/mandarin-lesson/publish_site.py /path/to/l13
python3 routines/mandarin-lesson/publish_site.py /path/to/l13 --dry-run
python3 routines/mandarin-lesson/publish_site.py /path/to/l13 --site-dir /workspace/mandarin-lessons
```

The script copies `lesson.json` and `*.mp3` into `lessons/<id>/`, updates
`lessons/index.json` (newest first), commits, pushes `main` as Atlas-Grok,
waits for the Pages build (up to 5 minutes), and prints

`https://atlas-grok.github.io/mandarin-lessons/lesson.html?id=<id>`

If the lesson dir still has `lesson.yaml` and no `lesson.json`, it converts
YAML → JSON first (stdlib + the repo’s YAML subset loader). You can also
convert a file in place:

```bash
python3 routines/mandarin-lesson/publish_site.py --convert-yaml path/to/lesson.yaml -o path/to/lesson.json
```

Embed `answer_key` in the JSON before publishing. `listen_url` values should
be the local MP3 filenames.

## Published grade report (`grade.json`)

After Mei grades a submission, `publish_site.py grade` (in
`evandcombs/bot-scripts`) writes `lessons/<id>/grade.json` and deploys it.
The site does **not** list this file in `lessons/index.json`; the lesson list
and lesson page each fetch it at runtime with `cache: "no-store"`. A **404**
means the lesson is not graded yet.

When the file exists:

- The home page shows a **Completed** badge on that lesson.
- The lesson page shows a **report card** at the top (Teach and Practice stay
  below; Practice inputs are read-only and Submit is hidden).

Schema (extra unknown fields are ignored):

| Field | Meaning |
|-------|---------|
| `lesson_id`, `lesson_number`, `title_en`, `title_py` | Lesson identity |
| `graded_at` | ISO date string shown on the report |
| `score`, `max` | Overall total |
| `written_score`, `written_max`, `voice_score`, `voice_max` | Section totals |
| `items[]` | One row per practice item (written + voice) |

Each `items[]` entry:

| Field | Meaning |
|-------|---------|
| `n` | Item id (`"1"`, `"S1"`, …) |
| `section` | Practice section title for grouping |
| `kind` | `english`, `pinyin`, `voice`, … |
| `prompt_en`, `prompt_py` | Prompt shown on the report |
| `answer` | Evan’s submission (`""` or null if blank; voice uses `null`) |
| `expected` | Accepted forms (informational; may be omitted on voice) |
| `status` | `correct` · `partial` · `wrong` · `skipped` · `voice_graded` |
| `points`, `max_points` | Points awarded for this item |
| `correction` | Expected form when not fully correct; omit or null when correct |
| `note` | Short grader note (tone, spelling, voice feedback) |

Point bands match live practice grading: +15 correct, +8 partial, −12 wrong,
−5 skipped. Voice rows use Mei’s note and the model sentence as `correction`.

A full example fixture lives at `tests/fixtures/grade-l11.json` (not deployed).

## Practice, voice, and submission

- Written items are real inputs. **Submit** runs `assets/grade.js` immediately
  and shows the total score plus per-item feedback.
- 🎤 items use `MediaRecorder` (record / play / re-record, ~20 s cap, prefers
  low-bitrate `webm/opus`). They are not auto-graded.
- If `assets/config.js` `SUBMIT_URL` is set, the page POSTs JSON as
  `text/plain` to the Apps Script web app. If it is empty, scoring still
  works and the page offers a `submission.json` download.
- The Apps Script (see `apps-script/DEPLOY.md`) writes
  `Mandarin/submissions/<lessonId>/<timestamp>/` in Drive, including
  `status.json` with `voice_pending`, and applies written-score mastery
  updates to the progress Sheet (same formulas as `tracker/update_tracker.py`,
  idempotent on `lessonId` + answers).

## Tests

```bash
# Rebuild vectors from the Python grader, then check the JS port.
python3 tests/gen_vectors.py
node tests/grade.test.js
node tests/report.test.js

# Existing Mandarin pipeline tests (from /workspace/mandarin):
python3 -m unittest tests.test_inline_reply
```

`tests/vectors.json` is generated by running `grade_practice.py` on many
cases, including the edge cases in the existing scoring tests.

## Changing the lock or the submit URL

Those are the only two values that routinely change after go-live:

1. Lock pattern — `tools/hash_pattern.py` → `assets/lock.js`
2. Apps Script URL — paste into `assets/config.js` after following
   `apps-script/DEPLOY.md` (Evan does this once in the browser)
