const names = {
  passed: "通过",
  failed: "失败",
  untested: "未执行",
  blocked: "阻塞",
  na: "不适用",
  stale: "待复核",
  "review-pending": "待审核",
  pending: "待验证",
  active: "验证中",
  completed: "已完成",
};
export function renderAcceptance(data, S, u) {
  const { esc, button, markdown, empty } = u;
  const attr = (name, value) => `data-${name}="${esc(value)}"`;
  const badge = (status, label) =>
    `<span class="acceptance-status ${esc(status)}">${esc(label ?? names[status] ?? status)}</span>`;
  const visible = data.items.filter(
    (i) =>
      (!S.acceptanceQuery || i.model.title.includes(S.acceptanceQuery)) &&
      (!S.acceptanceStatus || i.effectiveStatus === S.acceptanceStatus),
  );
  visible.sort(
    (a, b) =>
      (({ active: 0, pending: 1, completed: 2 })[a.effectiveStatus] ?? 3) -
      ({ active: 0, pending: 1, completed: 2 }[b.effectiveStatus] ?? 3),
  );
  const selected = S.acceptanceId
    ? data.items.find(
        (i) => i.model.id === S.acceptanceId || i.file === S.acceptanceId,
      )
    : visible[0];
  const panel = (name, label, file = "") =>
    button(
      label,
      "acceptance-panel",
      `${attr("panel", name)} ${attr("file", file)}`,
      "text small",
    );
  const evidence = (e) => panel("evidence", esc(e.title) + " ↗", e.file);
  const list = `<aside class="acceptance-list"><h2>需求与修复</h2><form id="acceptance-search"><input name="query" aria-label="搜索需求" placeholder="搜索需求…" value="${esc(S.acceptanceQuery)}"><button class="btn icon" type="submit" aria-label="搜索需求">${u.icon("magnifying-glass")}</button></form>${u.dropdown("acceptance-status", "需求状态", [{ value: "", label: "全部状态" }, ...["pending", "active", "completed"].map((value) => ({ value, label: names[value] }))], S.acceptanceStatus)}<nav aria-label="需求列表">${visible.map((i) => `<button class="requirement-row ${selected === i ? "active" : ""}" data-action="acceptance-go" ${attr("id", i.model.id)}><span><strong>${esc(i.model.title)}</strong>${badge(i.effectiveStatus)}</span><small>${i.passed}/${i.criteria.length} 项通过${i.legacy ? " · 旧格式" : ""}</small></button>`).join("") || '<p class="muted">暂无匹配的需求。</p>'}</nav></aside>`;
  let detail = empty(
    "尚无需求验收",
    "由 Agent／CLI 在项目需求文档中记录标准与验证结果。",
  );
  let overlay = "";
  if (selected) {
    const { model: m, criteria } = selected;
    const runs = m.runs?.run ?? [];
    const results = criteria
      .map(
        (c) =>
          `<tr><td>${esc(c.text)}</td><td>${badge(c.status, c.status === "passed" && c.retested ? "复测通过" : undefined)}${c.result?.reason ? `<small>${esc(c.result.reason)}</small>` : ""}</td><td>${(c.result?.evidenceList?.evidence ?? []).map(evidence).join(" ") || "—"}</td></tr>`,
      )
      .join("");
    const review = m.review?.status ?? "pending",
      reviewStale =
        m.review?.version &&
        (m.review.version !== m.version ||
          criteria.some((c) => c.status === "stale"));
    detail = `${button("← 需求列表", "acceptance-back", "", "text acceptance-mobile-back")}<header class="requirement-heading"><h1>${esc(m.title)}</h1>${badge(selected.effectiveStatus)}${panel("original", "查看需求原文 ↗")}</header><p>${esc(m.description ?? "")}</p><p class="muted small">${m.prototypeFile ? evidence({ file: m.prototypeFile, title: "原型预览" }) : ""}　代码版本 ${esc(m.version || "未记录")}</p>${selected.legacy ? '<p class="notice">当前文档沿用旧格式，结构化验证结果尚未记录。</p>' : ""}${selected.warnings.map((w) => `<p class="notice warning">${esc(w)}</p>`).join("")}<section><div class="section-heading"><h2>验收标准</h2><span>${selected.passed}/${criteria.length} 项通过</span></div><div class="acceptance-table"><table class="table"><thead><tr><th>标准</th><th>验证结果</th><th>证据</th></tr></thead><tbody>${results}</tbody></table></div>${panel("history", "查看验证历史 →")}</section><div class="acceptance-summary"><section><h2>代码审核</h2>${badge(reviewStale ? "stale" : review === "pending" ? "review-pending" : review)}<p>${esc(m.review?.summary ?? "尚未记录审核结论")}</p>${m.review?.reviewer ? `<small>${esc(m.review.reviewer)} · ${esc(m.review.version)}</small>` : ""}</section><section><h2>交付情况</h2><p>${esc(m.delivery ?? "尚未记录交付情况")}</p><small>${criteria.length - selected.passed} 项待处理</small></section></div><section><h2>相关决定</h2>${selected.decisionDetails.map((d) => (d.exists ? button(esc(d.title) + " ↗", "acceptance-decision", attr("file", d.file), "text doc-link") : `<p class="notice warning">关联决定未找到：${esc(d.file)}</p>`)).join("") || '<p class="muted">暂无关联决定。</p>'}</section>`;
    if (S.acceptancePanel) {
      let body = "",
        title = "";
      if (S.acceptancePanel === "original") {
        title = "需求原文";
        body = markdown(selected.content, selected.file, S.projectId);
      }
      if (S.acceptancePanel === "history") {
        title = "验证历史";
        body =
          runs
            .slice()
            .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
            .map(
              (r) =>
                `<section class="verification-round"><h2>${esc(r.id)}</h2><p class="muted small">${esc(r.at)} · 代码 ${esc(r.version)}</p>${(r.results?.result ?? []).map((v) => `<div class="verification-result"><strong>${esc(v.standard)}</strong>${badge(v.status)}${v.reason ? `<p>${esc(v.reason)}</p>` : ""}<div>${(v.evidenceList?.evidence ?? []).map(evidence).join(" ")}</div></div>`).join("")}</section>`,
            )
            .join("") || "<p>尚未记录验证。</p>";
      }
      if (S.acceptancePanel === "evidence") {
        title = "证据与原型";
        const url = `/api/projects/${encodeURIComponent(S.projectId)}/acceptance/evidence?id=${encodeURIComponent(m.id)}&file=${encodeURIComponent(S.acceptanceEvidence)}`;
        body = `<p class="path-line">${esc(S.acceptanceEvidence)}</p><p class="small muted">原始文件不可用时，预览会显示具体读取错误。</p><iframe class="acceptance-evidence" sandbox title="证据预览" src="${esc(url)}"></iframe><a href="${esc(url)}" target="_blank" rel="noopener">打开原始文件 ↗</a>`;
      }
      overlay = `<div class="maintenance-backdrop" data-action="acceptance-panel" data-panel=""></div><aside class="maintenance-detail acceptance-drawer" role="dialog" aria-modal="true" aria-label="${title}" tabindex="-1"><div class="decision-drawer-bar"><strong>${title}</strong>${button("关闭", "acceptance-panel", attr("panel", ""), "small")}</div><div class="decision-drawer-body">${body}</div></aside>`;
    }
  } else if (S.acceptanceId)
    detail = empty(
      "需求不可用",
      "文档可能已移动、标识重复或无法解析，请检查来源提示。",
    );
  return `<div class="acceptance-page ${S.acceptanceId ? "has-selection" : ""}">${data.warnings.map((w) => `<p class="notice warning">${esc(w.file)} · ${esc(w.message)}</p>`).join("")}<div class="acceptance-workspace">${list}<article class="acceptance-reader">${detail}</article></div>${overlay}</div>`;
}
