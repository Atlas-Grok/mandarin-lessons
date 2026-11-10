#!/usr/bin/env python3
"""Regenerate tests/vectors.json from the Python grader.

Run from the repo root (or any cwd):

    python3 tests/gen_vectors.py

The vectors are the source of truth for tests/grade.test.js: every case is
produced by grade_practice.py so the JS port can be checked against Python.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANDARIN = Path("/workspace/mandarin")
sys.path.insert(0, str(MANDARIN / "grader"))
sys.path.insert(0, str(MANDARIN / "email-renderer"))

from grade_practice import (  # noqa: E402
    InputError,
    grade,
    grade_item,
    load_voice,
    summary,
)

HERE = Path(__file__).resolve().parent


def result_of(fn):
    try:
        value = fn()
        return {"ok": True, "value": value}
    except InputError as exc:
        return {"ok": False, "error": str(exc)}
    except Exception as exc:  # unexpected — still record it
        return {"ok": False, "error": type(exc).__name__ + ": " + str(exc)}


def item_case(name, item, ans, voice=None):
    out = {"name": name, "item": item, "answer": ans, "voice": voice}
    out.update(result_of(lambda: grade_item(item, ans, voice)))
    return out


def grade_case(name, key, sub, vres=None):
    def run():
        voice = load_voice(vres) if vres is not None else None
        res, patches, needs, score, mx = grade(key, sub, voice)
        md = summary(sub.get("lesson_number", key.get("lesson_number")), score, mx, res, needs)
        return {
            "items": res,
            "sheet_patches": patches,
            "needs_voice": needs,
            "score": score,
            "max": mx,
            "summary_md": md,
        }

    out = {"name": name, "key": key, "sub": sub, "vres": vres}
    out.update(result_of(run))
    return out


def build():
    items = []
    # --- cases from tests/test_inline_reply.py ScoringTests ---
    base = {"n": 1, "kind": "pinyin", "expected": ["wǔ gè"]}
    items += [
        item_case("spacing", base, "wǔgè"),
        item_case("missing_tones", base, "wu ge"),
        item_case("partially_missing_tones", base, "wǔ ge"),
        item_case("wrong_tone", base, "wúgè"),
        item_case("misplaced_tone", {"n": 1, "kind": "pinyin", "expected": ["jiějie"]}, "Jíejie"),
        item_case("number_tones", base, "wu3ge4"),
        item_case("blank_skipped", base, ""),
        item_case("none_skipped", base, None),
        item_case("whitespace_skipped", base, "   "),
    ]
    number_item = {"n": 1, "kind": "pinyin", "expected": ["Wǒ jiā yǒu ___ gè rén."], "accept_any": "number"}
    for n in ("yí", "liǎng", "sān", "sì", "wǔ", "liù", "shí yī", "èr shí sān", "yī bǎi líng sì"):
        items.append(item_case("any_number_" + n.replace(" ", "_"), number_item, "Wǒ jiā yǒu " + n + "gè rén"))
    items += [
        item_case("any_number_tone_error", number_item, "Wǒ jiā yǒu sígè rén"),
        item_case("any_number_wrong", number_item, "Wǒ jiā yǒu banana gè rén"),
        item_case("any_number_yi_ge_bare_rejected", number_item, "Wǒ jiā yǒu yī gè rén"),
        item_case("any_number_er_ge_bare_rejected", number_item, "Wǒ jiā yǒu èr gè rén"),
        item_case("any_number_liang_ok", number_item, "Wǒ jiā yǒu liǎng gè rén"),
        item_case("any_number_yi_ge_ok_sandhi", number_item, "Wǒ jiā yǒu yí gè rén"),
    ]
    regex_item = {"n": 1, "kind": "english", "accept_any": {"regex": r"(?:red|blue)"}}
    items += [
        item_case("regex_fullmatch", regex_item, "red"),
        item_case("regex_substring_rejected", regex_item, "a red car"),
        item_case("regex_case", regex_item, "BLUE"),
        item_case("enum", {"n": 1, "kind": "pinyin", "expected": "___", "accept_any": ["wǔ", "liù"]}, "liù"),
        item_case("enum_wrong", {"n": 1, "kind": "pinyin", "expected": "___", "accept_any": ["wǔ", "liù"]}, "sān"),
        item_case(
            "english_spacing_not_removed",
            {"n": 1, "kind": "english", "expected": ["a bit"]},
            "abit",
        ),
        item_case(
            "english_exact",
            {"n": 1, "kind": "english", "expected": ["a bit"]},
            "A bit",
        ),
        item_case("bad_regex", {"n": 1, "kind": "pinyin", "expected": "hi", "regex": "["}, "hi"),
        item_case("accept_any_true", {"n": 1, "kind": "pinyin", "expected": "hi", "accept_any": True}, "hi"),
        item_case("no_expected", {"n": 7, "kind": "pinyin"}, "hi"),
        item_case("number_without_blank", {"n": 1, "kind": "pinyin", "expected": "wǔ gè", "accept_any": "number"}, "wǔ gè"),
    ]

    # punctuation, case, ü/v/u:, apostrophes, hyphens
    items += [
        item_case("trailing_punct", {"n": 1, "kind": "pinyin", "expected": ["gēge"]}, "Gēge!"),
        item_case("trailing_cjk_punct", {"n": 1, "kind": "pinyin", "expected": ["gēge"]}, "gēge。？"),
        item_case("v_equals_u_umlaut", {"n": 1, "kind": "pinyin", "expected": ["nǚ"]}, "nv"),
        item_case("u_colon", {"n": 1, "kind": "pinyin", "expected": ["nǚ"]}, "nu:"),
        item_case("umlaut_direct", {"n": 1, "kind": "pinyin", "expected": ["nǚ"]}, "nǚ"),
        item_case("luse_v", {"n": 1, "kind": "pinyin", "expected": ["lǜsè"]}, "lvse"),
        item_case("apostrophe_spacing", {"n": 1, "kind": "pinyin", "expected": ["Xī'ān"]}, "xī ān"),
        item_case("hyphen_spacing", {"n": 1, "kind": "pinyin", "expected": ["yè-lǐ"]}, "yèlǐ"),
        item_case("nfc_composed", {"n": 1, "kind": "pinyin", "expected": ["wǒ"]}, "wǒ"),
        item_case("nfd_decomposed", {"n": 1, "kind": "pinyin", "expected": ["wǒ"]}, "wǒ"),
    ]

    # choice / english / sentence / fill
    items += [
        item_case("choice_plain", {"n": 1, "kind": "choice", "expected": "b"}, "b"),
        item_case("choice_parens", {"n": 1, "kind": "choice", "expected": "b"}, "(b)"),
        item_case("choice_expected_parens", {"n": 1, "kind": "choice", "expected": "(B)"}, "b"),
        item_case("choice_wrong", {"n": 1, "kind": "choice", "expected": "b"}, "c"),
        item_case("choice_no_partial_tones", {"n": 1, "kind": "choice", "expected": ["wǔ"]}, "wu"),
        item_case("english_no_partial_tones", {"n": 1, "kind": "english", "expected": ["café"]}, "cafe"),
        item_case("sentence_punct", {"n": 1, "kind": "sentence", "expected": ["Wǒ yǒu gǒu."]}, "wǒ yǒu gǒu"),
        item_case("sentence_spacing", {"n": 1, "kind": "sentence", "expected": ["Wǒ yǒu gǒu."]}, "wǒyǒugǒu"),
        item_case("fill_partial", {"n": 1, "kind": "fill", "expected": ["zhī"]}, "zhi"),
        item_case("free_kind_default", {"n": 1, "expected": ["māo"]}, "māo"),
        item_case("expected_any_alias", {"n": 1, "kind": "pinyin", "expected_any": ["māo", "māo māo"]}, "māo"),
        item_case("accept_regex_alias", {"n": 1, "kind": "english", "accept_regex": r"cat|dog"}, "dog"),
        item_case("regex_list", {"n": 1, "kind": "english", "regex": [r"cat", r"dog"]}, "dog"),
        item_case("note_any_true_number", {"n": 1, "kind": "pinyin", "expected": "___ gè", "note": "Any true number is fine"}, "sān gè"),
    ]

    # voice items
    items += [
        item_case("voice_ungraded", {"n": "S1", "kind": "voice", "words": ["gǒu"]}, None),
        item_case("voice_graded", {"n": "S1", "kind": "voice", "words": ["gǒu"]}, None, {"S1": {"points": 15, "note": "clear"}}),
        item_case("voice_partial", {"n": "S1", "kind": "voice"}, None, {"S1": {"points": 8}}),
    ]

    # l12-like open sentences
    l18 = {
        "n": "18",
        "kind": "sentence",
        "expected": ["Wǒ xǐhuan māo.", "Wǒ xǐhuan gǒu.", "Wǒ xǐhuan māo hé gǒu.", "Wǒ xǐhuan gǒu hé māo."],
        "regex": r"wǒ\s*xǐhuan\s*(māo|gǒu)(\s*hé\s*(māo|gǒu))?(\s*ma)?",
    }
    items += [
        item_case("l18_mao", l18, "Wǒ xǐhuan māo."),
        item_case("l18_gou", l18, "wǒ xǐhuan gǒu"),
        item_case("l18_missing_tones", l18, "wo xihuan mao"),
        item_case("l18_wrong", l18, "nǐ hǎo"),
    ]

    grades = []
    example_key = {
        "items": [
            {"n": 1, "kind": "pinyin", "expected": "gēge"},
            {"n": 2, "kind": "pinyin", "expected": ["mèimei", "mèi mei"]},
            {"n": 3, "kind": "english", "expected": ["older brother", "big brother"], "words": ["gēge"]},
            {"n": 4, "kind": "choice", "expected": "b"},
            {"n": 5, "kind": "sentence", "expected": "Wǒ méiyǒu gēge", "words": ["méiyǒu", "gēge"]},
            {"n": 6, "kind": "fill", "expected": "yǒu"},
            {"n": "S1", "kind": "voice", "words": ["gēge"]},
            {"n": "S2", "kind": "voice", "words": ["shì"]},
        ]
    }
    grades.append(grade_case(
        "example_written_only",
        example_key,
        {"lesson_number": 6, "answers": {"1": "gēge", "2": "meimei", "3": "older brother", "4": "(b)", "5": "Wǒ méiyǒu gēge", "6": ""}},
    ))
    grades.append(grade_case(
        "example_with_voice",
        example_key,
        {"lesson_number": 6, "answers": {"1": "gēge", "2": "mèimei", "3": "sis", "4": "a", "5": "Wǒ méiyǒu gēge", "6": "yǒu"}},
        {"S1": {"points": 15, "note": "clear tones"}, "S2": {"points": 8, "note": "soft"}},
    ))
    grades.append(grade_case(
        "voice_list_form",
        example_key,
        {"lesson_number": 6, "answers": {"1": "gēge"}},
        {"items": [{"n": "S1", "points": 15, "note": "ok"}]},
    ))
    grades.append(grade_case(
        "all_skipped",
        example_key,
        {"lesson_number": 6, "answers": {}},
    ))
    grades.append(grade_case(
        "pinyin_words_default",
        {"items": [{"n": 1, "kind": "pinyin", "expected": ["gēge", "gē ge"]}]},
        {"lesson_number": 1, "answers": {"1": "gēge"}},
    ))
    grades.append(grade_case(
        "bad_voice_points",
        example_key,
        {"lesson_number": 6, "answers": {"1": "gēge"}},
        {"S1": {"points": "fifteen"}},
    ))

    # A compact l12 subset
    l12_path = ROOT / "lessons" / "l12" / "lesson.json"
    if l12_path.is_file():
        lesson = json.loads(l12_path.read_text(encoding="utf-8"))
        grades.append(grade_case(
            "l12_mixed",
            lesson["answer_key"],
            {
                "lesson_number": 12,
                "answers": {
                    "1": "animal", "2": "cat", "3": "dog", "4": "people", "5": "two", "6": "not",
                    "7": "zhi", "8": "māo", "9": "bu", "10": "gǒu",
                    "11": "Wǒ yǒu liǎng zhī gǒu.", "12": "ni xihuan gou ma",
                    "13": "Wǒ de háizi xǐhuan māo.",
                    "14": "black", "15": "yellow", "16": "green", "17": "blue",
                    "18": "Wǒ xǐhuan gǒu.", "19": "",
                },
            },
        ))

    return {"grade_item": items, "grade": grades}


def main():
    data = build()
    out = HERE / "vectors.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    n_ok = sum(1 for x in data["grade_item"] if x["ok"]) + sum(1 for x in data["grade"] if x["ok"])
    n_err = sum(1 for x in data["grade_item"] if not x["ok"]) + sum(1 for x in data["grade"] if not x["ok"])
    print(f"wrote {out} ({len(data['grade_item'])} grade_item, {len(data['grade'])} grade; {n_ok} ok, {n_err} error cases)")


if __name__ == "__main__":
    main()
