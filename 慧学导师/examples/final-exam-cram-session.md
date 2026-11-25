# 场景实战 1：大学生期末周 7 天极限速成（真题 + 课件 → 一页救命纸 + 动态排期）

> **典型痛点**：平时上课划水或只记了零散 PPT，距离期末考试只剩 7 天，手里只有两份往年真题和几百页课件，需要立刻救火。

---

## 一、在对话中直接这样唤醒「慧学导师」

```text
请开启 huixue-mentor 的【期末速成模式 + 资料溯源模式】：
我距离《信号与系统》期末考还剩 7 天，每天最多能投入 90 分钟。
随消息我贴出了往年真题（含部分答案）和老师最后三章的 PPT 文字。
请帮我：
1. 调用 research-syllabus.mjs（--depth concise）补齐核心 3×3 考点骨架；
2. 逐题解析真题（严格保留原选项，没给听力/附图的题标注自评，不要编答案），并提炼出 5 道摸底自测题；
3. 根据我的作答初始化学习账本（study-tracker.mjs），生成未来 7 天带间隔复习的精确倒计时排期；
4. 用大白话+生活类比给我讲透我最懵的「收敛域 ROC 与系统稳定性」，并附 Mermaid 图解和可打印《考前速记一页纸》。
```

---

## 二、背后自动触发的确定性脚本链路

```bash
# Step 1：快速生成 3×3 期末精简骨架
node ./scripts/research-syllabus.mjs --major "电子信息" --depth concise --offline

# Step 2：初始化课程账本并导入考点
node ./scripts/study-tracker.mjs init --course "信号与系统" --from-json ./examples/sample-course.json

# Step 3：记录摸底或错题（自动激活 30 天半衰期掌握度 + 错题本）
node ./scripts/study-tracker.mjs diagnose --answers '[{"topicId":"t1","correct":false},{"topicId":"t3","correct":false},{"topicId":"t4","correct":true}]'
node ./scripts/study-tracker.mjs practice --topic t1 --score 50 --total 4 --wrong '[{"q":"卷积积分因果界限","userAnswer":"0到+∞","correctAnswer":"当x,h均因果时为0到t","explain":"注意因果信号要求 τ>=0 且 t-τ>=0"}]'

# Step 4：生成 7 天动态排期（每天 90 分钟，自动插入 +1/+3/+7 天间隔提取）
node ./scripts/study-tracker.mjs plan --exam-date 2026-12-08 --daily-minutes 90

# Step 5：导出一页救命速记纸
node ./scripts/study-tracker.mjs export-cheatsheet --out ./cheatsheet.md
```

---

## 三、你能得到的确定性交付物
1. **绝对不胡编的真题精讲**：选项与原卷一致、无答案原图诚实标为自评、公式标准 LaTeX。
2. **零门槛费曼拆解**：先把抽象频域/ROC 翻译成生活中看得见的机制，再落回积分公式计算。
3. **不自欺欺人的时间表**：若时间确实排不下所有章节，脚本会在 `⚠️ 超出预算未排入` 里诚实报警，帮助你做战略取舍。
