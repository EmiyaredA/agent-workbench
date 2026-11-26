import fs from "node:fs";
import path from "node:path";
import { XMLBuilder } from "fast-xml-parser";
import { Acceptance } from "./acceptance.mjs";
import { atomic } from "./io.mjs";
export function seedAcceptance(store) {
  const marker = path.join(store.dataDir, "acceptance-demo-seeded");
  if (fs.existsSync(marker)) return;
  const project = store.registry.projects.find((p) => p.demo);
  if (!project) return;
  const service = new Acceptance(store),
    build = (model) => new XMLBuilder().build({ acceptance: model });
  const decision = store
    .catalog(project.id)
    .docs.find(
      (d) =>
        d.role === "decision" &&
        d.status === "implemented" &&
        d.file.includes("file-first"),
    );
  const file = "docs/需求/进行中/项目成员权限.md";
  const criteria = [
    { id: "member", text: "普通成员无法修改配置" },
    { id: "admin", text: "管理员可正常保存配置" },
    { id: "guest", text: "访客访问时提示登录" },
    { id: "session", text: "角色变更后原会话权限更新" },
  ];
  atomic(
    path.join(project.root, "docs/证据/权限请求.txt"),
    "虚构演示证据\nPOST /api/project/config\n身份 普通成员\n期望 403，实际 403\n",
  );
  atomic(
    path.join(project.root, "docs/需求/原型/成员权限.html"),
    '<!doctype html><html lang="zh"><meta charset="utf-8"><style>body{font-family:sans-serif;padding:32px;color:#453b36}button{padding:12px}</style><h1>项目配置</h1><p>虚构原型 · 管理员可保存，普通成员只读。</p><button disabled>保存配置</button></html>',
  );
  atomic(
    path.join(project.root, "docs/证据/权限首次请求.txt"),
    "虚构演示证据\nPOST /api/project/config\n身份 普通成员\n期望 403，实际 200\n",
  );
  atomic(
    path.join(project.root, "docs/证据/管理员保存.txt"),
    "虚构演示证据\nPOST /api/project/config\n身份 管理员\n期望 200，实际 200\n",
  );
  atomic(
    path.join(project.root, "docs/证据/配置读取.txt"),
    "虚构演示证据\n读取旧版配置\n期望读取成功，实际读取成功\n",
  );
  service.write(
    project.id,
    build({
      file,
      operationId: "demo-member",
      id: "member-permissions",
      title: "项目成员权限",
      description: "隔离示例。管理员维护配置，普通成员只读，访客先登录。",
      version: "8d2c6a1",
      status: "active",
      prototypeFile: "docs/需求/原型/成员权限.html",
      criteria: { criterion: criteria },
      review: { status: "pending" },
      delivery: "剩余 2 项待验证，尚未合并。",
      ...(decision
        ? { decisions: { decision: [{ file: decision.file }] } }
        : {}),
    }),
  );
  for (const [id, at, status] of [
    ["initial", "2026-11-25T10:00:00+08:00", "failed"],
    ["retest", "2026-11-26T09:00:00+08:00", "passed"],
  ]) {
    const current = service.read(project.id, "member-permissions");
    service.write(
      project.id,
      build({
        file,
        baseHash: current.hash,
        operationId: "demo-" + id,
        runs: {
          run: [
            {
              id,
              at,
              version: "8d2c6a1",
              results: {
                result: criteria.slice(0, 2).map((c, index) => ({
                  criterionId: c.id,
                  standard: c.text,
                  status: index ? "passed" : status,
                  evidenceList: {
                    evidence: [
                      {
                        title: "虚构请求记录",
                        file: index
                          ? "docs/证据/管理员保存.txt"
                          : status === "failed"
                            ? "docs/证据/权限首次请求.txt"
                            : "docs/证据/权限请求.txt",
                      },
                    ],
                  },
                })),
              },
            },
          ],
        },
      }),
      { append: true },
    );
  }
  service.write(
    project.id,
    build({
      file: "docs/需求/进行中/插件版本兼容.md",
      operationId: "demo-compat",
      id: "plugin-compat",
      title: "插件版本兼容",
      description: "虚构需求，等待执行兼容验证。",
      version: "8d2c6a1",
      status: "pending",
      criteria: {
        criterion: [{ id: "versions", text: "声明的插件组合可正常加载" }],
      },
      review: { status: "pending" },
    }),
  );
  service.write(
    project.id,
    build({
      file: "docs/需求/已完成/2026-11-24-配置迁移.md",
      operationId: "demo-migration",
      id: "config-migration",
      title: "配置迁移",
      description: "虚构演示，配置读取方式已经核对。",
      version: "demo-v1",
      status: "completed",
      criteria: {
        criterion: [{ id: "config-read", text: "已有配置可正常读取" }],
      },
      runs: {
        run: [
          {
            id: "migration-check",
            at: "2026-11-24T09:00:00+08:00",
            version: "demo-v1",
            results: {
              result: [
                {
                  criterionId: "config-read",
                  standard: "已有配置可正常读取",
                  status: "passed",
                  evidenceList: {
                    evidence: [
                      { title: "虚构读取记录", file: "docs/证据/配置读取.txt" },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
      review: {
        status: "passed",
        version: "demo-v1",
        reviewer: "演示审核者",
        summary: "虚构演示，已核对兼容读取路径。",
      },
      delivery: "示例已完成并合并。",
    }),
  );
  atomic(marker, "Acceptance fictional fixtures\n");
}
