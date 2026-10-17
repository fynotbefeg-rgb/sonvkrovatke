"""Shared-body plans from manifest/evidence boundaries: fictional timings, real local Director via node, no media/render."""
import copy
import importlib.util
import math
import subprocess
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("shared_body_plans", Path(__file__).with_name("shared_body_plans.py"))
plans_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plans_module)

BODY = ("Сегодня разберём простой способ проверки заголовка страницы. Возьмём 12 клиентов за 30 дней и сравним показы. "
        "Сначала соберём заявки, звонки, письма и чаты в одну таблицу. Это только гипотеза, её нужно проверить. "
        "Затем сравним результат через 14 дней. Сохрани этот пример для своей страницы.")
HOOKS = {1: "Заголовок решает всё.",
         2: "Страница в выдаче, но кликов мало: проверим заголовок за 5 минут. Покажу на выдуманном примере.",
         3: ("Многие владельцы сайтов годами не трогают заголовки страниц, потому что не знают, с чего начать проверку, "
             "и каждый раз откладывают это на потом. Сегодня покажу простой выдуманный пример без сложных инструментов.")}
LEAD_SILENCE = 0.42


def timed(text, t0):
    words, t = [], t0
    for w in text.split():
        d = 0.34 + 0.045 * sum(ch.isalnum() for ch in w)
        words.append({"text": w, "start": round(t, 3), "end": round(t + d, 3)})
        t += d + (0.5 if w[-1] in ".!?" else 0.18 if w[-1] in ",:;" else 0.03)
    return words


def frames(seconds):
    return math.ceil(seconds * 25) / 25


def speech(name, words, duration):
    return {"sourceRelativePath": f"{name}.mp4", "sourceSha256": name[0] * 64, "wordTimings": words,
            "sourceMetadata": {"duration": duration}}


def fixture(body_text=BODY, hook_texts=HOOKS):
    """Shapes of assemble-source-set (manifest) and prepare-assembled-jobs (job, evidence) for a v1 source set."""
    body_words = timed(body_text, LEAD_SILENCE)
    body = speech("body", body_words, round(body_words[-1]["end"] + 0.35, 3))
    hooks = {n: speech(f"h{n}", timed(t, 0.1), 0) for n, t in hook_texts.items()}
    variants, results = [], []
    for n, hook in hooks.items():
        hook["sourceMetadata"]["duration"] = round(hook["wordTimings"][-1]["end"] + 0.25, 3)
        start = frames(hook["sourceMetadata"]["duration"])
        end = start + frames(body["sourceMetadata"]["duration"])
        reel = f"R-test-h{n}"
        variants.append({"reelId": reel, "hookNumber": n, "bodyStart": start, "duration": end, "parts": [
            {"role": "hook", "sha256": hook["sourceSha256"], "timelineStart": 0, "timelineEnd": start},
            {"role": "body", "sha256": body["sourceSha256"], "timelineStart": start, "timelineEnd": end}]})
        words = copy.deepcopy(hook["wordTimings"]) + [
            {**w, "start": round(w["start"] + start, 6), "end": round(w["end"] + start, 6)} for w in body_words]
        job = {"schemaVersion": "1.0.0", "reelId": reel, "hookNumber": n, "wordTimings": words,
               "sourceVideo": {"localPath": f"rr/incoming/test/{reel}.mp4", "sha256": "0" * 64,
                               "duration": round(end - 0.02, 2), "width": 1080, "height": 1920, "fps": 25}}
        evidence = {"reelId": reel, "bodyStart": start, "hookWordCount": len(hook["wordTimings"]),
                    "bodyWordCount": len(body_words)}
        results.append((job, evidence))
    manifest = {"assemblyVersion": "1.0.0", "variants": variants}
    return manifest, results, body, hooks


def body_events(plan, evidence):
    hw, start = evidence["hookWordCount"], evidence["bodyStart"]
    return [(e["id"], e["type"], e["wordStart"] - hw, e["wordEnd"] - hw, round(e["start"] - start, 5), round(e["end"] - start, 5))
            for e in plan["events"] if e["wordStart"] >= hw]


class SharedBodyPlanTests(unittest.TestCase):
    def test_runner_path_one_body_plan_shifted_into_three_variants(self):
        manifest, results, body, hooks = fixture()
        body_plan, plans = plans_module.build(manifest, results, body, hooks)
        # runner → renderer stub: the same plans montage.run would receive, each re-validated by the Director
        received = {}
        for job, _ in results:
            received[job["hookNumber"]] = plans[job["hookNumber"]]
            plans_module.validate(job, plans[job["hookNumber"]])
        reference = [(f"body-{e['id']}", e["type"], e["wordStart"], e["wordEnd"], round(e["start"], 5), round(e["end"], 5))
                     for e in body_plan["events"]]
        for job, evidence in results:
            self.assertEqual(body_events(received[job["hookNumber"]], evidence), reference)
        self.assertEqual(body_plan["events"][0]["start"], LEAD_SILENCE)  # leading silence stays in the shared timeline
        # a number in hook 2 keeps its card and does not take the single body zoom
        h2, ev2 = plans[2], results[1][1]
        self.assertTrue(any(e["type"] == "number" and e["wordEnd"] < ev2["hookWordCount"] for e in h2["events"]))
        zooms = [e for e in h2["events"] if e["type"] == "zoom"]
        self.assertEqual(len(zooms), 1); self.assertGreaterEqual(zooms[0]["wordStart"], ev2["hookWordCount"])

    def test_budget_near_six_second_boundary_is_the_body_budget(self):
        short_body = ("Возьмём 12 клиентов за 30 дней. Соберём заявки, звонки, письма и чаты в таблицу. Через 14 дней "
                      "сравним итог. Это учебный пример без настоящих данных клиента и без обещаний. Сохрани этот пример.")
        manifest, results, body, hooks = fixture(short_body)
        length = manifest["variants"][0]["parts"][1]["timelineEnd"] - manifest["variants"][0]["parts"][1]["timelineStart"]
        self.assertGreater(length % 6, 3.5)
        self.assertEqual(len({math.floor(job["sourceVideo"]["duration"] / 6) for job, _ in results}), 3)
        body_plan, plans = plans_module.build(manifest, results, body, hooks)
        accents = [e for e in body_plan["events"] if e["type"] not in ("caption", "zoom")]
        room = min([length] + [job["sourceVideo"]["duration"] - ev["bodyStart"] for job, ev in results])
        self.assertEqual(len(accents), math.floor(room / 6))
        for job, evidence in results:
            mine = [e for e in plans[job["hookNumber"]]["events"]
                    if e["type"] not in ("caption", "zoom") and e["wordStart"] >= evidence["hookWordCount"]]
            self.assertEqual([(e["type"], e["wordStart"] - evidence["hookWordCount"]) for e in mine],
                             [(e["type"], e["wordStart"]) for e in accents])

    def test_boundary_must_agree_between_manifest_evidence_and_part_timings(self):
        def broken(mutate):
            manifest, results, body, hooks = fixture()
            mutate(manifest, results, body, hooks)
            with self.assertRaises(ValueError):
                plans_module.build(manifest, results, body, hooks)
        broken(lambda m, r, b, h: r[0][1].update(bodyStart=r[0][1]["bodyStart"] + 0.04))
        broken(lambda m, r, b, h: m["variants"][1].update(bodyStart=m["variants"][1]["bodyStart"] + 0.04))
        broken(lambda m, r, b, h: r[2][1].update(hookWordCount=r[2][1]["hookWordCount"] - 1))
        broken(lambda m, r, b, h: m["variants"][0]["parts"][1].update(timelineEnd=m["variants"][0]["parts"][1]["timelineEnd"] + 0.04))
        broken(lambda m, r, b, h: m["variants"][0]["parts"].reverse())
        broken(lambda m, r, b, h: m.update(assemblyVersion="2.0.0"))

    def test_director_refuses_a_job_whose_body_is_not_the_shared_body(self):
        manifest, results, body, hooks = fixture()
        results[1][0]["wordTimings"][-3]["start"] += 0.01  # body words no longer equal shared body + bodyStart
        with self.assertRaises(subprocess.CalledProcessError):
            plans_module.build(manifest, results, body, hooks)

    def test_supplied_plan_must_pass_standard_validation(self):
        manifest, results, body, hooks = fixture()
        _, plans = plans_module.build(manifest, results, body, hooks)
        job = results[0][0]
        bad = copy.deepcopy(plans[1]); bad["events"][0]["end"] = job["sourceVideo"]["duration"] + 1
        with self.assertRaises(ValueError):
            plans_module.validate(job, bad)
        plans_module.validate(job, plans[1])


if __name__ == "__main__":
    unittest.main()
