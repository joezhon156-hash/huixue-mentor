# 贡献指南 (Contributing to Huixue Mentor)

感谢你为全专业大学生与终生学习者贡献更权威、更通俗、更严谨的知识骨架！

## 你可以贡献什么？

1. **新增高校级 6×4 学科骨架**
   - 在 `scripts/research-syllabus.mjs` 的 `CURATED_6STAGE_SYLLABI` 与 `references/curated-syllabi-catalog.md` 中补充尚未覆盖的一级学科（如建筑学、化学、物理学、生物医学工程、历史学、社会学等）。
   - 必须包含 6 个渐进阶段 × 每阶段 4 个核心知识点 + 1 本公认中文/国际经典教材名（禁止杜撰书名）。
2. **扩充学科检索过滤词谱（`MAJOR_QUERY_BANK`）**
   - 若发现某专业检索常召回无关项目，可提 PR 精准补充 `mustMatch` 与 `excludeMatch` 正则。
3. **补充专业独立验算规则（`references/discipline-rubrics.md`）**
   - 例如增添口腔医学、航空航天、农林水产或特定小语种的专有核查清单。
4. **添加真实学习场景实战范例（`examples/`）**
   - 分享你在考研复试、期末突击、跨专业转行中的真实对话模板与最佳实践。

## 提交 PR 前的验收门槛

1. **严格零外部依赖**：`scripts/*.mjs` 只允许使用 Node.js 内置模块与全局 `fetch`。
2. **绝不泄露个人密钥或隐私**：不要提交 `.env`、个人学习账本 `.huixue-study/` 或任何 `GITHUB_TOKEN`。
3. **本地验收全绿**：提交前务必运行并确保通过：
   ```bash
   node ./scripts/validate-skill.mjs
   ```
