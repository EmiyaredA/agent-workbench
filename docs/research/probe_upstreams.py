#!/usr/bin/env python3
"""Isolated source probes. Pass a directory containing the four pinned upstream clones."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstreams", type=Path, required=True)
    args = parser.parse_args()
    upstreams = args.upstreams.resolve()
    compound = upstreams / "compound"
    ecc = upstreams / "ecc"
    mini = upstreams / "mini-trellis"
    resolver = compound / "skills/ce-compound/scripts/packs-resolve.py"
    checks = []

    def check(name, condition):
        if not condition:
            raise AssertionError(name)
        checks.append({"name": name, "passed": True})

    with tempfile.TemporaryDirectory(prefix="awb-source-probe-") as temporary:
        scratch = Path(temporary)

        def rule(path):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("---\ntitle: Use one convention\napplies_when:\n  - editing code\n---\nKeep it short.\n")

        def project(name, config, local=""):
            root = scratch / name
            root.mkdir()
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            directory = root / ".compound-engineering"
            directory.mkdir()
            (directory / "config.yaml").write_text(config)
            (directory / "config.local.yaml").write_text(local)
            return root

        def resolve(root):
            env = dict(os.environ, CE_PACKS_CACHE_ROOT=str(scratch / "cache"))
            result = subprocess.run([sys.executable, str(resolver)], cwd=root,
                                    env=env, text=True, capture_output=True, check=True)
            return json.loads(result.stdout), result.returncode

        global_pack = scratch / "personal-global"
        rule(global_pack / "style.md")
        root = project("combined", "packs:\n  - source: packs/team\n",
                       f"packs:\n  - source: {global_pack}\n")
        rule(root / "packs/team/team.md")
        rule(root / "packs/team/evidence/old.md")
        output, _ = resolve(root)
        check("CE combines project and local absolute sources", not output["errors"] and
              {r["id"] for r in output["roots"]} == {"team", "personal-global"})
        check("CE counts nested rules without publishing them as packs",
              next(r for r in output["roots"] if r["id"] == "team")["nested_rule_shaped"] == 1)

        root = project("duplicate", "packs:\n  - source: a\n    id: same\n",
                       "packs:\n  - source: b\n    id: same\n")
        rule(root / "a/a.md")
        rule(root / "b/b.md")
        output, code = resolve(root)
        check("CE duplicate ids yield errors despite exit zero", code == 0 and
              len(output["roots"]) == 1 and any("duplicate pack id" in e for e in output["errors"]))

        root = project("unversioned", "packs:\n  - source: https://github.com/example/rules\n")
        output, _ = resolve(root)
        check("CE rejects a remote source without ref", bool(output["errors"]) and not output["roots"])

        root = project("escape", "packs:\n  - source: rules\n")
        rule(root / "rules/rule.md")
        (root / "rules/outside").symlink_to(global_pack, target_is_directory=True)
        output, _ = resolve(root)
        check("CE rejects a pack with an escaping symlink", bool(output["errors"]) and not output["roots"])

        isolated_data = scratch / "ecc-data"
        prior = os.environ.get("CLV2_HOMUNCULUS_DIR")
        os.environ["CLV2_HOMUNCULUS_DIR"] = str(isolated_data)
        try:
            source = ecc / "skills/continuous-learning-v2/scripts/instinct-cli.py"
            spec = importlib.util.spec_from_file_location("awb_ecc_probe", source)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            parsed = module.parse_instinct_file(
                '---\nid: sample\nconfidence: 2\n---\nPrefer a short instruction.\n')
            check("ECC parser falls back to 0.5 for out-of-range confidence",
                  len(parsed) == 1 and parsed[0]["confidence"] == 0.5)
            check("ECC import and parsing create no persistent data", not isolated_data.exists())
        finally:
            if prior is None:
                del os.environ["CLV2_HOMUNCULUS_DIR"]
            else:
                os.environ["CLV2_HOMUNCULUS_DIR"] = prior

        journal_root = scratch / "mini-journal"
        journal_root.mkdir()
        subprocess.run(["git", "init", "-q", "-b", "main", str(journal_root)], check=True)
        shutil.copytree(mini / "packages/cli/src/templates/trellis/scripts",
                        journal_root / ".trellis/scripts", ignore=shutil.ignore_patterns("__pycache__"))
        (journal_root / ".trellis/config.yaml").write_text("session_auto_commit: true\n")
        (journal_root / "docs").mkdir()
        (journal_root / "docs/decision.md").write_text("# Decision\nA confirmed future preference.\n")

        def record(arguments):
            return subprocess.run([sys.executable, *arguments], cwd=journal_root,
                                  capture_output=True, text=True, check=True)

        record([".trellis/scripts/init_developer.py", "reviewer"])
        arguments = [".trellis/scripts/add_session.py", "--title", "Review design",
                     "--summary", "Design only", "--topic", "docs/decision.md",
                     "--idempotency-key", "awb-design", "--no-commit"]
        record(arguments)
        def journal_snapshot():
            return {str(p.relative_to(journal_root)): p.read_bytes()
                    for p in (journal_root / ".trellis/workspace").rglob("*.md")}
        before = journal_snapshot()
        record(arguments)
        check("mini-trellis records a topic link", any(b"docs/decision.md" in v for v in before.values()))
        check("mini-trellis same-key retry preserves journal and index", before == journal_snapshot())
        commits = subprocess.check_output(["git", "rev-list", "--all", "--count"],
                                          cwd=journal_root, text=True).strip()
        check("mini-trellis no-commit defeats auto-commit configuration", commits == "0")

    ranking = subprocess.run(["node", "tests/lib/instinct-relevance.test.js"],
                             cwd=ecc, capture_output=True, text=True, check=True)
    check("ECC relevance upstream suite: 20 passed, 0 failed",
          "20 passed, 0 failed" in ranking.stdout)
    mini_tests = subprocess.run(["pnpm", "--filter", "mini-trellis-core", "exec", "vitest", "run",
                                "test/mem/recall.test.ts", "test/mem/api.test.ts"],
                               cwd=mini, capture_output=True, text=True, check=True)
    check("mini-trellis core upstream suites: 123 passed",
          "123 passed" in mini_tests.stdout)
    versions = {name: subprocess.check_output(["git", "rev-parse", "HEAD"],
                 cwd=upstreams / name, text=True).strip() for name in ("compound", "ecc", "cloudcli", "mini-trellis")}
    print(json.dumps({"versions": versions, "checks": checks,
                      "scope": "Source probes only; no application or full upstream suite tested."},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
