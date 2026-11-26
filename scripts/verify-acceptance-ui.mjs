import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { once } from "node:events";
import { chromium } from "playwright";
import { createApp } from "../src/server.mjs";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "awb-acceptance-ui-"));
const { server, store } = createApp({
  demo: true,
  dataDir: path.join(temp, "demo"),
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({ viewport: { width: 1584, height: 994 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
fs.mkdirSync(".local/acceptance-ui", { recursive: true });
const project = store.registry.projects[0];
try {
  await page.goto(
    base +
      `/#project=${project.id}&view=acceptance&acceptanceId=member-permissions`,
  );
  await page.locator(".requirement-heading h1").waitFor();
  assert.equal(await page.locator(".acceptance-table tbody tr").count(), 4);
  assert.equal(await page.locator(".acceptance-table .untested").count(), 2);
  await page.screenshot({
    path: ".local/acceptance-ui/acceptance-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "查看验证历史 →", exact: true })
    .click();
  await page.locator(".verification-round").first().waitFor();
  assert.equal(await page.locator(".verification-round").count(), 2);
  await page.screenshot({
    path: ".local/acceptance-ui/acceptance-history.png",
  });
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "虚构请求记录 ↗" }).first().click();
  await page.locator("iframe").waitFor();
  await page
    .frameLocator("iframe")
    .getByText("期望 403，实际 403", { exact: false })
    .waitFor();
  await page.keyboard.press("Escape");
  await page.locator("iframe").waitFor({ state: "hidden" });
  await page.locator("[data-action=acceptance-decision]").first().click();
  await page.locator(".maintenance-detail").waitFor();
  assert.equal(await page.locator(".maintenance-tabs button").count(), 4);
  assert.equal(await page.locator("[data-kind=history]").count(), 0);
  await page
    .locator("[data-action=acceptance-go]")
    .getByText("项目成员权限", { exact: true })
    .click();
  await page.locator(".requirement-heading h1").waitFor();
  await page.goBack();
  await page.locator(".maintenance-detail").waitFor();
  await page.goBack();
  await page.locator(".requirement-heading h1").waitFor();
  await page
    .getByRole("button", { name: "查看需求原文 ↗", exact: true })
    .click();
  await page.locator(".acceptance-drawer .markdown").waitFor();
  await page.keyboard.press("Escape");
  await page.locator("#acceptance-status .dropdown-trigger").click();
  await page.locator("#acceptance-status [data-value=completed]").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".requirement-row").length === 1,
  );
  await page
    .locator(".requirement-row")
    .getByText("配置迁移", { exact: true })
    .waitFor();
  await page.locator("#acceptance-status .dropdown-trigger").click();
  await page.locator('#acceptance-status [data-value=""]').click();
  await page.waitForFunction(
    () => document.querySelectorAll(".requirement-row").length === 3,
  );
  await page.locator("[name=query]").fill("插件");
  await page.locator("[name=query]").press("Enter");
  await page.waitForFunction(
    () => document.querySelectorAll(".requirement-row").length === 1,
  );
  await page.locator(".requirement-row").click();
  await page
    .locator(".requirement-heading h1")
    .getByText("插件版本兼容", { exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: ".local/acceptance-ui/acceptance-mobile.png" });
  await page.locator("[data-action=acceptance-back]").click();
  await page.locator(".acceptance-list").waitFor({ state: "visible" });
  assert.equal(await page.locator(".acceptance-reader").isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(
    "Acceptance UI passed: standards, history, evidence, decision roundtrip, browser history, original document, search, mobile.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
}
