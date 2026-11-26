import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createHash } from "node:crypto";
import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";
import { atomic, exclusive } from "./io.mjs";
import { markdownLinks } from "./maintenance.mjs";

const digest = (text) => createHash("sha256").update(text).digest("hex");
const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
const arrayTags = new Set([
  "criterion",
  "run",
  "result",
  "evidence",
  "decision",
  "operation",
  "source",
]);
const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  isArray: (name) => arrayTags.has(name),
});
const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
const begin = "<!-- awb-acceptance:start -->",
  end = "<!-- awb-acceptance:end -->";
const managed =
  /<!-- awb-acceptance:start -->[\s\S]*?<!-- awb-acceptance:end -->/g;
const list = (value) => value ?? [];
const cell = (value) =>
  String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
export const resultLabels = {
  passed: "通过",
  failed: "失败",
  untested: "未执行",
  blocked: "阻塞",
  na: "不适用",
  stale: "待复核",
};
export function parseAcceptanceXML(xml) {
  if (
    typeof xml !== "string" ||
    Buffer.byteLength(xml) > 1_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    fail("验收 XML 无效或超过 1 MB");
  const parsed = parser.parse(xml);
  if (
    !parsed.acceptance ||
    Object.keys(parsed).some((key) => key !== "acceptance" && key !== "?xml")
  )
    fail("根标签须为 acceptance");
  const fields = new Set([
    "file",
    "baseHash",
    "operationId",
    "id",
    "title",
    "description",
    "version",
    "status",
    "criteria",
    "runs",
    "review",
    "delivery",
    "prototypeFile",
    "decisions",
    "operations",
  ]);
  for (const key of Object.keys(parsed.acceptance))
    if (!fields.has(key)) fail("不支持的验收字段 " + key);
  return parsed.acceptance;
}
const validId = (value) =>
  typeof value === "string" && /^[\w-]{1,100}$/.test(value);
const text = (value, label, required = true) => {
  if ((required && !value) || typeof value !== "string" || value.length > 10000)
    fail(label + "须为有效文本");
};
const relative = (value) => {
  text(value, "路径");
  if (
    path.posix.isAbsolute(value) ||
    value.includes("\\") ||
    value.split("/").some((p) => !p || p === "." || p === "..") ||
    /[\r\n<>]/.test(value)
  )
    fail("路径必须相对项目根目录");
  return value;
};
function validate(model) {
  if (JSON.stringify(model).includes("awb-acceptance:"))
    fail("内容包含保留的验收管理标记");
  if (!validId(model.id)) fail("需求 id 无效");
  text(model.title, "标题");
  text(model.version, "代码版本");
  if (!["pending", "active", "completed"].includes(model.status))
    fail("需求状态无效");
  const criteria = list(model.criteria?.criterion);
  if (!criteria.length || criteria.length > 100) fail("需要 1–100 项验收标准");
  const ids = new Set();
  for (const c of criteria) {
    if (!validId(c.id) || ids.has(c.id)) fail("标准 id 重复或无效");
    ids.add(c.id);
    text(c.text, "验收标准");
  }
  const runs = new Set();
  for (const run of list(model.runs?.run)) {
    if (!validId(run.id) || runs.has(run.id)) fail("验证轮次 id 重复或无效");
    runs.add(run.id);
    text(run.version, "被测版本");
    if (
      !/^\d{4}-\d{2}-\d{2}T/.test(run.at) ||
      !Number.isFinite(Date.parse(run.at))
    )
      fail("验证时间须为 ISO 日期时间");
    const seen = new Set();
    for (const r of list(run.results?.result)) {
      if (!validId(r.criterionId) || seen.has(r.criterionId))
        fail("验证标准 id 无效或重复");
      seen.add(r.criterionId);
      if (!Object.hasOwn(resultLabels, r.status) || r.status === "stale")
        fail("验证结果无效");
      text(r.standard, "该轮标准原文");
      if (["blocked", "na"].includes(r.status))
        text(r.reason, "阻塞或不适用原因");
      for (const e of list(r.evidenceList?.evidence)) {
        relative(e.file);
        text(e.title, "证据标题");
      }
    }
    for (const source of list(run.sources?.source)) {
      relative(source.file);
      if (!/^[a-f0-9]{64}$/.test(source.hash)) fail("源码快照 hash 无效");
    }
  }
  for (const d of list(model.decisions?.decision))
    if (!relative(d.file).startsWith(".agents/notes/"))
      fail("决定链接须指向 .agents/notes");
  if (model.prototypeFile) relative(model.prototypeFile);
  if (
    model.review &&
    !["pending", "passed", "failed"].includes(model.review.status)
  )
    fail("审核状态无效");
  if (model.review?.status && model.review.status !== "pending") {
    text(model.review.version, "审核代码版本");
    text(model.review.summary, "审核结论");
    text(model.review.reviewer, "审核者");
  }
  if (
    model.status === "completed" &&
    (model.review?.status !== "passed" ||
      model.review.version !== model.version)
  )
    fail("完成需求前须有对应版本的审核结论");
  return model;
}
function body(model) {
  const rows = list(model.criteria?.criterion)
    .map((c) => `| ${cell(c.id)} | ${cell(c.text)} |`)
    .join("\n");
  const rounds = list(model.runs?.run)
    .map(
      (run) =>
        `### ${run.at} · ${run.id}\n\n代码版本 ${run.version}\n\n` +
        list(run.results?.result)
          .map(
            (r) =>
              `- ${r.standard} · ${resultLabels[r.status]}${r.reason ? " · " + r.reason : ""}`,
          )
          .join("\n"),
    )
    .join("\n\n");
  return `${begin}\n## 验收标准\n\n| 标识 | 标准 |\n| --- | --- |\n${rows}\n\n## 验证记录\n\n${rounds || "尚未记录验证。"}\n\n## 代码审核\n\n${model.review?.summary || "待审核"}\n\n## 交付与后续\n\n${model.delivery || "尚未记录"}\n\n<details>\n<summary>验收结构数据</summary>\n\n\`\`\`xml\n${builder.build({ acceptance: model }).trim()}\n\`\`\`\n</details>\n${end}`;
}
export class Acceptance {
  constructor(store) {
    this.store = store;
  }
  project(id) {
    if (id === "global") fail("验收仅用于项目");
    return this.store.project(id);
  }
  target(id, file) {
    if (!/^docs\/需求\/(进行中|已完成)\/.+\.md$/.test(relative(file)))
      fail("需求文件须在 docs/需求/进行中 或 已完成");
    return this.store.safe(this.project(id), file, false);
  }
  snapshot(id) {
    const project = this.project(id);
    const git = spawnSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: project.root, encoding: "utf8", maxBuffer: 2_000_000 },
    );
    if (git.status !== 0) return "";
    const files = [
      ...new Set(
        git.stdout
          .split("\0")
          .filter(
            (file) =>
              /\.(?:[cm]?js|jsx|tsx?|py|go|rs|java|vue|svelte|css|html|sql|toml|ya?ml|json)$/.test(
                file,
              ) &&
              !file.startsWith("docs/") &&
              !file.startsWith(".agent-workbench/") &&
              !file.includes("node_modules/"),
          ),
      ),
    ].sort();
    if (files.length > 1000) return "";
    return digest(
      files
        .map((file) => {
          try {
            return (
              file +
              ":" +
              digest(fs.readFileSync(this.store.safe(project, file, false)))
            );
          } catch {
            return file + ":missing";
          }
        })
        .join("\n"),
    );
  }
  readFile(id, file) {
    const content = this.store.text(this.target(id, file));
    if (content === null) fail("需求文件不存在", 404);
    const blocks = [...content.matchAll(managed)];
    if (blocks.length > 1) fail("需求包含重复验收区段");
    if (
      (content.includes(begin) || content.includes(end)) &&
      (!blocks.length ||
        content.split(begin).length !== 2 ||
        content.split(end).length !== 2)
    )
      fail("验收管理区段不完整，请修复后读取");
    let model;
    if (blocks.length) {
      const xml = blocks[0][0].match(/```xml\n([\s\S]*)\n```\n<\/details>/);
      if (!xml) fail("验收结构数据缺失");
      model = validate(parseAcceptanceXML(xml[1]));
    } else {
      const standards =
        content.match(
          /##\s*(?:[五5][、. ]*)?验收标准\s*\n([\s\S]*?)(?=\n##\s|$)/,
        )?.[1] ?? "";
      model = {
        id: "legacy-" + digest(file).slice(0, 16),
        title: content.match(/^# (.+)$/m)?.[1] ?? path.basename(file),
        version: "",
        status: "pending",
        criteria: {
          criterion: standards
            .split("\n")
            .filter((l) => /^\s*[-*]\s+/.test(l))
            .map((l, i) => ({
              id: "legacy-" + i,
              text: l.replace(/^\s*[-*]\s+(?:\[[ x]\]\s*)?/, ""),
            })),
        },
      };
    }
    const currentSnapshot = this.snapshot(id);
    const latest = new Map();
    for (const run of list(model.runs?.run)
      .slice()
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)))
      for (const r of list(run.results?.result))
        latest.set(r.criterionId, {
          ...r,
          runId: run.id,
          at: run.at,
          version: run.version,
          sources: list(run.sources?.source),
        });
    const criteria = list(model.criteria?.criterion).map((c) => {
      const r = latest.get(c.id);
      let stale =
        !!r &&
        (r.standard !== c.text ||
          r.version !== model.version ||
          (!!list(model.runs?.run).find((run) => run.id === r.runId)
            ?.snapshot &&
            list(model.runs?.run).find((run) => run.id === r.runId).snapshot !==
              currentSnapshot));
      for (const s of r?.sources ?? []) {
        try {
          if (
            digest(
              this.store.text(
                this.store.safe(this.project(id), s.file, false),
              ) ?? "",
            ) !== s.hash
          )
            stale = true;
        } catch {
          stale = true;
        }
      }
      return {
        ...c,
        retested:
          list(model.runs?.run).filter((run) =>
            list(run.results?.result).some(
              (result) => result.criterionId === c.id,
            ),
          ).length > 1,
        result: r ?? null,
        status: stale ? "stale" : (r?.status ?? "untested"),
      };
    });
    const decisions = [
      ...list(model.decisions?.decision).map((d) => d.file),
      ...markdownLinks(content, file).filter((f) =>
        f.startsWith(".agents/notes/"),
      ),
    ];
    const catalog = this.store.catalog(id);
    return {
      file,
      content,
      hash: digest(content),
      model,
      effectiveStatus:
        model.status === "completed" &&
        criteria.some((c) => !["passed", "na"].includes(c.status))
          ? "active"
          : model.status,
      decisionDetails: [...new Set(decisions)].map((file) => ({
        file,
        title: catalog.docs.find((d) => d.file === file)?.title ?? file,
        exists: catalog.docs.some((d) => d.file === file),
      })),
      legacy: !blocks.length,
      criteria,
      decisions: [...new Set(decisions)],
      warnings: [
        ...list(model.runs?.run).flatMap((run) =>
          list(run.results?.result).flatMap((result) =>
            list(result.evidenceList?.evidence).flatMap((evidence) => {
              try {
                const target = this.store.safe(
                  this.project(id),
                  evidence.file,
                  false,
                );
                const stat = fs.statSync(target);
                if (stat.size > 5_000_000)
                  return ["证据超过预览上限：" + evidence.file];
                return evidence.hash &&
                  digest(fs.readFileSync(target)) !== evidence.hash
                  ? ["历史证据已变化：" + evidence.file]
                  : [];
              } catch {
                return ["证据未找到：" + evidence.file];
              }
            }),
          ),
        ),
        ...(list(model.runs?.run).some(
          (r) => !r.snapshot && !list(r.sources?.source).length,
        )
          ? ["验证记录缺少源码快照，请核对被测版本。"]
          : []),
        ...criteria.flatMap((c) =>
          c.result?.status === "passed" &&
          !list(c.result.evidenceList?.evidence).length
            ? ["“" + c.text + "”缺少证据"]
            : [],
        ),
      ],
      passed: criteria.filter((c) => ["passed", "na"].includes(c.status))
        .length,
    };
  }
  list(id) {
    this.project(id);
    const items = [],
      warnings = [];
    for (const doc of this.store
      .catalog(id)
      .docs.filter((d) => d.role === "requirement"))
      try {
        items.push(this.readFile(id, doc.file));
      } catch (e) {
        warnings.push({ file: doc.file, message: e.message });
      }
    const counts = new Map();
    for (const item of items)
      counts.set(item.model.id, (counts.get(item.model.id) ?? 0) + 1);
    for (const item of items)
      if (counts.get(item.model.id) > 1) {
        item.warnings.push("需求 id 重复，请修复后写入");
        warnings.push({ file: item.file, message: "需求 id 重复" });
      }
    for (const warning of this.store.catalog(id).warnings)
      warnings.push(warning);
    return { items, warnings };
  }
  read(id, key) {
    const matches = this.list(id).items.filter(
      (i) => i.model.id === key || i.file === key,
    );
    if (matches.length !== 1) fail("需求不存在或标识重复", 404);
    return matches[0];
  }
  write(id, xml, { dryRun = false, append = false } = {}) {
    const input = parseAcceptanceXML(xml);
    const { file, baseHash, operationId } = input;
    this.target(id, file);
    if (!validId(operationId)) fail("operationId 无效");
    return exclusive(this.store.dataDir, () => {
      const current = this.store.text(this.target(id, file));
      const previous = current === null ? null : this.readFile(id, file);
      const old = previous?.model;
      const payload = digest(xml);
      const operations = list(old?.operations?.operation);
      const replay = operations.find((o) => o.id === operationId);
      if (replay) {
        if (replay.digest !== payload) fail("operationId 已用于其他内容", 409);
        return { file, replayed: true };
      }
      if ((current === null ? "" : digest(current)) !== (baseHash ?? ""))
        fail("需求文件已变化，请重读后更新", 409);
      let model;
      if (append) {
        if (!old || previous.legacy) fail("请先创建结构化验收标准");
        model = structuredClone(old);
        model.runs = {
          run: [...list(old.runs?.run), ...list(input.runs?.run)],
        };
      } else {
        model = structuredClone(input);
        for (const key of ["file", "baseHash", "operationId"])
          delete model[key];
        model.runs = { run: list(old?.runs?.run) };
        if (
          input.runs &&
          list(input.runs.run).some((r) =>
            list(old?.runs?.run).some(
              (o) => o.id === r.id && JSON.stringify(o) !== JSON.stringify(r),
            ),
          )
        )
          fail("历史验证记录不可改写，请追加新轮次");
        if (input.runs)
          model.runs = {
            run: [
              ...list(old?.runs?.run),
              ...list(input.runs.run).filter(
                (r) => !list(old?.runs?.run).some((o) => o.id === r.id),
              ),
            ],
          };
        if (old && !previous.legacy && old.id !== model.id)
          fail("需求 id 不可修改");
      }
      for (const run of list(model.runs?.run))
        if (!list(old?.runs?.run).some((r) => r.id === run.id)) {
          for (const result of list(run.results?.result))
            if (
              !list(model.criteria?.criterion).some(
                (c) =>
                  c.id === result.criterionId && c.text === result.standard,
              )
            )
              fail("新增结果必须引用当前标准和原文");
          run.snapshot = this.snapshot(id);
          for (const result of list(run.results?.result))
            for (const evidence of list(result.evidenceList?.evidence)) {
              const target = this.store.safe(
                this.project(id),
                relative(evidence.file),
                false,
              );
              let stat;
              try {
                stat = fs.statSync(target);
              } catch {
                fail("证据文件不存在：" + evidence.file);
              }
              if (!stat.isFile() || stat.size > 5_000_000)
                fail("证据须为 5 MB 内文件");
              evidence.hash = digest(fs.readFileSync(target));
            }
          for (const source of list(run.sources?.source))
            source.hash = digest(
              this.store.text(
                this.store.safe(this.project(id), relative(source.file), false),
              ) ?? fail("源码文件不存在"),
            );
        }
      validate(model);
      const all = this.list(id);
      if (
        all.warnings.some((w) => w.file !== file) ||
        all.items.some((i) => i.file !== file && i.model.id === model.id)
      )
        fail("需求扫描存在错误或重复 id，先修复后写入");
      model.operations = {
        operation: [...operations, { id: operationId, digest: payload }],
      };
      const original =
        current ?? `# ${model.title}\n\n${model.description ?? ""}\n\n`;
      const updated =
        previous && !previous.legacy
          ? original.replace(managed, () => body(model))
          : original.trimEnd() + "\n\n" + body(model) + "\n";
      if (Buffer.byteLength(updated) > 1_000_000) fail("需求文档超过 1 MB");
      if (model.status === "completed") {
        const statuses = list(model.criteria.criterion).map((c) =>
          list(model.runs.run)
            .slice()
            .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
            .flatMap((r) =>
              list(r.results?.result).map((result) => ({
                ...result,
                version: r.version,
                snapshot: r.snapshot,
                sources: list(r.sources?.source),
              })),
            )
            .filter((r) => r.criterionId === c.id)
            .at(-1),
        );
        if (
          statuses.some(
            (result) =>
              result &&
              ((result.snapshot && result.snapshot !== this.snapshot(id)) ||
                result.sources.some(
                  (source) =>
                    digest(
                      this.store.text(
                        this.store.safe(this.project(id), source.file, false),
                      ) ?? "",
                    ) !== source.hash,
                )),
          )
        )
          fail("源码已变化，请复测后再标记完成");
        if (
          statuses.some(
            (r, i) =>
              !r ||
              !["passed", "na"].includes(r.status) ||
              r.version !== model.version ||
              r.standard !== model.criteria.criterion[i].text,
          )
        )
          fail("仍有未通过或待复核的验收标准");
      }
      if (!dryRun) atomic(this.target(id, file), updated);
      return { file, hash: digest(updated), ok: true, dryRun };
    });
  }
  evidence(id, key, file) {
    const item = this.read(id, key);
    const known = new Set([
      item.model.prototypeFile,
      ...list(item.model.runs?.run).flatMap((r) =>
        list(r.results?.result).flatMap((v) =>
          list(v.evidenceList?.evidence).map((e) => e.file),
        ),
      ),
    ]);
    if (!known.has(file)) fail("证据未被当前需求引用", 404);
    const target = this.store.safe(this.project(id), relative(file), false);
    let stat;
    try {
      stat = fs.statSync(target);
    } catch {
      fail("证据文件不存在", 404);
    }
    if (!stat.isFile() || stat.size > 5_000_000) fail("证据不可读或超过 5 MB");
    return {
      data: fs.readFileSync(target),
      type:
        {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          webp: "image/webp",
          html: "text/html; charset=utf-8",
          txt: "text/plain; charset=utf-8",
          md: "text/plain; charset=utf-8",
          json: "text/plain; charset=utf-8",
        }[file.split(".").pop()] ?? "application/octet-stream",
    };
  }
}
