import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Workbench } from "../src/store.mjs";
import { Acceptance } from "../src/acceptance.mjs";
import { XMLBuilder } from "fast-xml-parser";
const xml = (m) => new XMLBuilder().build({ acceptance: m });
function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "awb-acceptance-"));
  const root = path.join(tmp, "project");
  fs.mkdirSync(root);
  const store = new Workbench(path.join(tmp, "data"));
  const p = store.register({ root });
  return { tmp, root, store, id: p.id, service: new Acceptance(store) };
}
const file = "docs/需求/进行中/test.md";
const model = {
  id: "test",
  title: "权限",
  version: "v1",
  status: "active",
  criteria: { criterion: [{ id: "a", text: "只读" }] },
  review: { status: "pending" },
};
test("acceptance XML writes preserve prose, retry safely and detect conflicts", () => {
  const f = fixture();
  try {
    const initial = xml({
      ...model,
      file,
      baseHash: "",
      operationId: "create",
    });
    f.service.write(f.id, initial);
    assert.equal(f.service.write(f.id, initial).replayed, true);
    let item = f.service.read(f.id, "test");
    assert.equal(item.criteria[0].status, "untested");
    fs.appendFileSync(path.join(f.root, file), "\n用户补充\n");
    assert.throws(
      () =>
        f.service.write(
          f.id,
          xml({ ...model, file, baseHash: item.hash, operationId: "conflict" }),
        ),
      /已变化/,
    );
    item = f.service.read(f.id, "test");
    f.service.write(
      f.id,
      xml({ ...model, file, baseHash: item.hash, operationId: "update" }),
    );
    assert.ok(f.service.read(f.id, "test").content.endsWith("用户补充\n"));
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});
test("acceptance preserves failures, detects standard and source changes and validates evidence boundary", () => {
  const f = fixture();
  try {
    f.service.write(f.id, xml({ ...model, file, operationId: "create" }));
    fs.writeFileSync(path.join(f.root, "code.js"), "const a=1;");
    const run = {
      id: "round1",
      at: "2026-11-26T08:00:00Z",
      version: "v1",
      sources: { source: [{ file: "code.js" }] },
      results: {
        result: [{ criterionId: "a", standard: "只读", status: "failed" }],
      },
    };
    let item = f.service.read(f.id, "test");
    f.service.write(
      f.id,
      xml({
        file,
        baseHash: item.hash,
        operationId: "r1",
        runs: { run: [run] },
      }),
      { append: true },
    );
    item = f.service.read(f.id, "test");
    assert.equal(item.criteria[0].status, "failed");
    run.id = "round2";
    run.at = "2026-11-26T09:00:00Z";
    run.results.result[0].status = "passed";
    f.service.write(
      f.id,
      xml({
        file,
        baseHash: item.hash,
        operationId: "r2",
        runs: { run: [run] },
      }),
      { append: true },
    );
    item = f.service.read(f.id, "test");
    assert.equal(item.criteria[0].status, "passed");
    assert.equal(item.model.runs.run.length, 2);
    assert.ok(item.warnings.length);
    fs.writeFileSync(path.join(f.root, "code.js"), "const a=2;");
    assert.equal(f.service.read(f.id, "test").criteria[0].status, "stale");
    assert.throws(
      () => f.service.evidence(f.id, "test", "../../secret"),
      /未被/,
    );
    assert.throws(
      () =>
        f.service.write(
          f.id,
          xml({
            ...model,
            status: "completed",
            file,
            baseHash: item.hash,
            operationId: "complete",
          }),
        ),
      /审核/,
    );
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});
test("legacy requirement, malformed XML and dry run", () => {
  const f = fixture();
  try {
    fs.mkdirSync(path.dirname(path.join(f.root, file)), { recursive: true });
    fs.writeFileSync(
      path.join(f.root, file),
      "# 旧需求\n\n## 五、验收标准\n\n- [ ] 只读\n",
    );
    const item = f.service.list(f.id).items[0];
    assert.equal(item.legacy, true);
    assert.equal(item.criteria.length, 1);
    f.service.write(
      f.id,
      xml({ ...model, file, baseHash: item.hash, operationId: "convert" }),
      { dryRun: true },
    );
    assert.equal(f.service.read(f.id, file).legacy, true);
    assert.throws(
      () => f.service.write(f.id, "<!DOCTYPE a><acceptance/>"),
      /XML/,
    );
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});

test("completion uses latest verification while preserving older source snapshots", () => {
  const f = fixture();
  try {
    f.service.write(f.id, xml({ ...model, file, operationId: "create" }));
    fs.writeFileSync(path.join(f.root, "code.js"), "old");
    const append = (id) => {
      const item = f.service.read(f.id, "test");
      return f.service.write(
        f.id,
        xml({
          file,
          baseHash: item.hash,
          operationId: id,
          runs: {
            run: [
              {
                id,
                at:
                  id === "first"
                    ? "2026-11-25T08:00:00Z"
                    : "2026-11-26T08:00:00Z",
                version: "v1",
                sources: { source: [{ file: "code.js" }] },
                results: {
                  result: [
                    { criterionId: "a", standard: "只读", status: "passed" },
                  ],
                },
              },
            ],
          },
        }),
        { append: true },
      );
    };
    append("first");
    fs.writeFileSync(path.join(f.root, "code.js"), "new");
    append("second");
    const item = f.service.read(f.id, "test");
    f.service.write(
      f.id,
      xml({
        ...model,
        status: "completed",
        review: {
          status: "passed",
          version: "v1",
          reviewer: "reviewer",
          summary: "已审查实际变更",
        },
        file,
        baseHash: item.hash,
        operationId: "complete",
      }),
    );
    assert.equal(f.service.read(f.id, "test").effectiveStatus, "completed");
    fs.writeFileSync(path.join(f.root, "code.js"), "later");
    assert.equal(f.service.read(f.id, "test").effectiveStatus, "active");
  } finally {
    fs.rmSync(f.tmp, { recursive: true, force: true });
  }
});
