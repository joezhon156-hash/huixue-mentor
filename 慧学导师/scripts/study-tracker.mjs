#!/usr/bin/env node
/**
 * 慧学导师 · 自适应学习账本、贝叶斯掌握度评估与考前倒计时动态排期引擎
 * 蒸馏自慧学平台：learningEvidence.js + studyPlanner.js + personalization.js + studyStudio.js
 * 零外部依赖（仅用 Node.js 原生内置模块），支持人类可读 JSON 持久化与 --json 机器交互。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DAY_MS = 86_400_000;
const DEFAULT_LEDGER = path.resolve('.huixue-study', 'study-ledger.json');

function printHelp() {
  console.log(`慧学导师学习账本与考前排期 CLI (study-tracker.mjs)

用法:
  node study-tracker.mjs <command> [options]

全局选项:
  --file <path>      账本 JSON 文件路径（默认: ./.huixue-study/study-ledger.json）
  --json             以结构化 JSON 输出结果

子命令:
  init               初始化课程学习账本
    --course "<名>"  课程或专业名称
    --from-json <p>  从课程 JSON（含 stages/topics/flashcards）导入骨架
    --depth <mode>   comprehensive(6x4) | concise(3x3)

  diagnose           记录摸底诊断结果，自动计算讲解密度档位与薄弱考点
    --answers <v>    JSON 字符串或 JSON 文件路径，如 '[{"topicId":"t1","correct":false}]'

  practice           记录一次客观测验，更新 30 天半衰期掌握度、错题本与下次复习间隔
    --topic <id>     知识点 ID
    --score <0-100>  得分（整数）
    --total <n>      题数（整数，默认 1）
    --kind <k>       course-quiz | timed-exam | variant-practice（默认 course-quiz）
    --duration <min> 本次耗时分钟数（可选，用于校准未来排期预估）
    --wrong <json>   错题数组 JSON 或文件路径：[{"q":"","userAnswer":"","correctAnswer":"","explain":""}]

  resolve-wrong      标记指定错题为已攻克
    --index <n|id>   错题序号（从 1 开始）或错题 ID

  card-review        记录记忆闪卡自评（独立于客观测验掌握度）
    --card <id>      闪卡 ID
    --rating <r>     again | hard | good | easy

  plan               生成考前动态倒计时学习与间隔提取排期（1–90 天）
    --exam-date YYYY-MM-DD     目标考试日期
    --daily-minutes <15-480>   每日可用复习分钟数
    --start-date YYYY-MM-DD    开始日期（默认今天）
    --mode free|challenge      free=弱项优先 | challenge=严格按解锁顺序（默认 free）

  status             查看当前诊断档位、各知识点掌握度置信度、到期复习与未解错题

  export-cheatsheet  导出可打印《考前速记一页纸 / 复习手册》
    --out <path>     输出 Markdown 文件路径（省略则打印到 stdout）
`);
}

function parseCliArgs(argv) {
  const args = argv.slice(2);
  const command = args[0] && !args[0].startsWith('-') ? args[0] : '';
  const flags = new Map();
  const bools = new Set();
  for (let i = command ? 1 : 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq > 0) {
      flags.set(token.slice(2, eq), token.slice(eq + 1));
    } else if (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) {
      flags.set(token.slice(2), args[++i]);
    } else {
      bools.add(token.slice(2));
    }
  }
  return { command, flags, bools };
}

function readJsonArg(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if ((trimmed.startsWith('[') || trimmed.startsWith('{')) && !fs.existsSync(trimmed)) {
    return JSON.parse(trimmed);
  }
  if (fs.existsSync(trimmed)) {
    return JSON.parse(fs.readFileSync(trimmed, 'utf8'));
  }
  return JSON.parse(trimmed);
}

function parseIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function todayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function densityFromScore(score) {
  if (score < 60) return { key: 'foundation', label: '详细讲解与基础支架' };
  if (score < 85) return { key: 'standard', label: '标准讲解与巩固练习' };
  return { key: 'advanced', label: '精炼讲解与进阶练习' };
}

/**
 * 30 天半衰期贝叶斯中性先验掌握度估计（蒸馏自 server/learningEvidence.js）
 */
export function estimateMastery(attempts = [], now = Date.now()) {
  let correct = 0;
  let total = 0;
  for (const a of attempts.slice(-30)) {
    const ageDays = Math.max(0, (now - new Date(a.createdAt || now).getTime()) / DAY_MS);
    const weight = Math.pow(0.5, ageDays / 30);
    const n = Math.max(1, Math.min(50, Number(a.total) || 1));
    correct += ((Number(a.score) || 0) / 100) * n * weight;
    total += n * weight;
  }
  return {
    estimate: Math.round((100 * (correct + 1)) / (total + 2)),
    evidenceCount: attempts.length,
    confidence: total >= 15 ? '较充分' : total >= 5 ? '有限' : '不足',
    method: '最近练习加权估计（30天半衰期，中性先验），不等同于考试成绩预测',
  };
}

/**
 * 闪卡间隔复习调度（蒸馏自 server/learningEvidence.js）
 */
export function scheduleCard(previous, rating, now = Date.now()) {
  if (!['again', 'hard', 'good', 'easy'].includes(rating)) {
    throw new Error('复习反馈无效：须为 again | hard | good | easy');
  }
  const old = Math.max(1, Number(previous?.intervalDays) || 1);
  const intervalDays =
    rating === 'again'
      ? 0
      : rating === 'hard'
        ? Math.max(1, Math.round(old * 1.2))
        : rating === 'good'
          ? Math.max(3, Math.round(old * 2))
          : Math.max(7, Math.round(old * 3));
  const capped = Math.min(90, intervalDays);
  return {
    rating,
    intervalDays: capped,
    nextReviewAt: new Date(now + (rating === 'again' ? 600_000 : capped * DAY_MS)).toISOString(),
    reviews: (previous?.reviews || 0) + 1,
    evidenceType: 'self-reported-recall',
  };
}

/**
 * 自适应考前动态排期（蒸馏自 server/studyPlanner.js）
 */
export function buildStudyPlan(ledger, { startDate, examDate, dailyMinutes, mode = 'free' }) {
  const start = parseIsoDate(startDate);
  const exam = parseIsoDate(examDate);
  const days = start && exam ? Math.round((exam - start) / DAY_MS) : NaN;
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error('考试日期须在开始日期之后的 1 至 90 天内');
  }
  if (!Number.isInteger(dailyMinutes) || dailyMinutes < 15 || dailyMinutes > 480) {
    throw new Error('每天可用时间须为 15 至 480 分钟的整数');
  }

  const weak = new Set(ledger.recommendedTopicIds || []);
  const completed = new Set(ledger.completedTopics || []);
  const wrongSet = new Set((ledger.wrongBook || []).filter(w => !w.resolved).map(w => w.topicId));
  const dueSet = new Set(
    Object.values(ledger.reviewPlans || {})
      .filter(r => r.status !== 'done' && r.nextReviewAt && String(r.nextReviewAt).slice(0, 10) <= startDate)
      .map(r => r.topicId)
  );

  const topics = (ledger.stages || [])
    .flatMap(stage =>
      (stage.topics || []).map(topic => ({
        id: topic.id,
        title: topic.title,
        stage: stage.name,
        estimatedMinutes: topic.estimatedMinutes,
      }))
    )
    .filter(t => t.id);

  if (!topics.length) throw new Error('账本中没有可安排的知识点');

  const ordered = topics.map((topic, index) => {
    const reasons = [];
    if (weak.has(topic.id)) reasons.push('诊断建议补弱');
    if (wrongSet.has(topic.id)) reasons.push('有未解决错题');
    if (dueSet.has(topic.id)) reasons.push('复习已到期');
    if (!completed.has(topic.id)) reasons.push('尚未完成');
    if (!reasons.length) reasons.push('复习已学内容');
    const priority =
      (weak.has(topic.id) ? 4 : 0) +
      (wrongSet.has(topic.id) ? 3 : 0) +
      (dueSet.has(topic.id) ? 2 : 0) +
      (!completed.has(topic.id) ? 1 : 0);
    return { ...topic, reasons, priority, index };
  });

  if (mode !== 'challenge') {
    ordered.sort((a, b) => b.priority - a.priority || a.index - b.index);
  }

  const observed = new Map();
  for (const s of ledger.sessions || []) {
    if (s.durationMinutes >= 1 && s.durationMinutes < 240) {
      observed.set(s.topicId, [...(observed.get(s.topicId) || []), s.durationMinutes]);
    }
  }

  const budgets = Array.from({ length: days }, () => dailyMinutes);
  const calendar = Array.from({ length: days }, (_, i) => ({
    date: new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10),
    tasks: [],
  }));

  const omitted = [];
  const placed = [];
  let challengeDay = 0;
  let challengeBlocked = false;

  for (const item of ordered) {
    const history = (observed.get(item.id) || []).sort((a, b) => a - b);
    const raw = history.length ? history[Math.floor(history.length / 2)] : Number(item.estimatedMinutes) || 30;
    const minutes = Math.max(15, Math.min(480, Math.round(raw / 5) * 5));
    const { index, priority, estimatedMinutes, ...topic } = item;
    const available = [...budgets];
    const allocations = [];
    let remaining = minutes;
    let earliest = mode === 'challenge' ? challengeDay : 0;

    while (remaining > 0 && !challengeBlocked) {
      const day = available.findIndex((budget, dayIdx) => dayIdx >= earliest && budget >= Math.min(15, remaining));
      if (day < 0) break;
      const partMinutes = Math.min(60, remaining, available[day]);
      allocations.push({ day, minutes: partMinutes });
      available[day] -= partMinutes;
      remaining -= partMinutes;
      earliest = day;
    }

    if (remaining > 0) {
      omitted.push({
        ...topic,
        minutes,
        reason: challengeBlocked ? '前置单元尚未排入计划' : '可用时间不足以完成预计学习时长',
      });
      if (mode === 'challenge') challengeBlocked = true;
      continue;
    }

    const task = {
      ...topic,
      minutes,
      kind: 'learn',
      estimateSource: history.length ? '历史学习时长中位数' : '默认估时，完成后可校准',
    };

    allocations.forEach((part, partIdx) => {
      budgets[part.day] -= part.minutes;
      calendar[part.day].tasks.push({
        ...task,
        minutes: part.minutes,
        part: partIdx + 1,
        parts: allocations.length,
        totalEstimatedMinutes: minutes,
      });
    });

    const finalDay = allocations.at(-1).day;
    if (mode === 'challenge') challengeDay = finalDay;
    placed.push({ ...task, day: finalDay });
  }

  for (const task of placed) {
    const masteryEst = ledger.mastery?.[task.id]?.estimate;
    const offsets =
      weak.has(task.id) || wrongSet.has(task.id) || (masteryEst !== undefined && masteryEst < 65)
        ? [1, 3, 7]
        : [3, 7];
    for (const offset of offsets) {
      const day = task.day + offset;
      const minutes = Math.min(15, dailyMinutes);
      if (day >= days || budgets[day] < minutes) continue;
      calendar[day].tasks.push({
        id: task.id,
        title: task.title,
        stage: task.stage,
        kind: 'retrieval',
        minutes,
        reasons: ['间隔提取练习：先脱离资料作答，再核对；根据新结果重新排期'],
      });
      budgets[day] -= minutes;
    }
  }

  return {
    startDate,
    examDate,
    days,
    dailyMinutes,
    mode,
    calendar: calendar.filter(d => d.tasks.length > 0),
    omitted,
    totalTopics: topics.length,
    scheduledTopics: placed.length,
    note: '按诊断、错题、到期复习和实际学习时长安排，并插入间隔提取练习；时长为估计。完成新测验后重新生成可更新顺序，不预测考题或保证成绩。',
  };
}

function loadLedger(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`未找到学习账本 ${filePath}，请先执行 init 子命令`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveLedger(filePath, ledger) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  ledger.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
}

function normalizeImportedCourse(raw, courseNameOverride, depth) {
  const rawStages = Array.isArray(raw?.stages) ? raw.stages : [];
  const selectedStages =
    depth === 'concise' && rawStages.length >= 6
      ? [rawStages[0], rawStages[2], rawStages[5]]
      : rawStages;

  let idx = 1;
  const stages = selectedStages.map((st, si) => {
    const rawTopics = Array.isArray(st.topics) ? st.topics : [];
    const slicedTopics = depth === 'concise' ? rawTopics.slice(0, 3) : rawTopics;
    return {
      name: st.name || `第 ${si + 1} 阶段`,
      goal: st.goal || '',
      topics: slicedTopics.map(t => ({
        id: t.id || `t${idx++}`,
        title: t.title || `知识点 ${idx}`,
        estimatedMinutes: Number(t.estimatedMinutes) || 30,
        keyPoints: Array.isArray(t.keyPoints) ? t.keyPoints : [],
      })),
    };
  });

  const flashcards = Array.isArray(raw?.flashcards)
    ? raw.flashcards.map((c, ci) => ({
        id: c.id || `card-${ci + 1}`,
        topicId: c.topicId || stages[0]?.topics?.[0]?.id || 'general',
        front: c.front || '',
        back: c.back || '',
        sourceQuote: c.sourceQuote || '',
      }))
    : [];

  return {
    courseName: courseNameOverride || raw?.name || raw?.courseName || '未命名课程',
    depth: depth || raw?.depth || 'comprehensive',
    stages,
    flashcards,
  };
}

function buildDefaultCourse(courseName, depth) {
  const stageCount = depth === 'concise' ? 3 : 6;
  const topicCount = depth === 'concise' ? 3 : 4;
  const stageNames =
    depth === 'concise'
      ? ['一、核心基石与概念扫盲', '二、高频机制与必考题型', '三、综合真题与考前收口']
      : ['一、学科导论与基石', '二、底层核心机制', '三、关键分支深化', '四、方法工具链', '五、经典案例实务', '六、综合项目与考评'];

  let tid = 1;
  const stages = Array.from({ length: stageCount }, (_, si) => ({
    name: stageNames[si],
    goal: `完成${stageNames[si]}核心梳理与自测`,
    topics: Array.from({ length: topicCount }, (__, ti) => ({
      id: `t${tid++}`,
      title: `${courseName} · 核心单元 ${si + 1}.${ti + 1}`,
      estimatedMinutes: 30,
      keyPoints: [],
    })),
  }));
  return { courseName, depth, stages, flashcards: [] };
}

function renderStatusMarkdown(ledger) {
  const topics = ledger.stages.flatMap(s => s.topics || []);
  const nowIso = new Date().toISOString();
  const dueReviews = Object.values(ledger.reviewPlans || {}).filter(r => r.status !== 'done' && r.nextReviewAt <= nowIso);
  const dueCards = ledger.flashcards.filter(c => {
    const rev = ledger.cardReviews?.[c.id];
    return !rev || rev.nextReviewAt <= nowIso;
  });
  const openWrongs = (ledger.wrongBook || []).filter(w => !w.resolved);

  const lines = [
    `# 📊 学习账本全景：${ledger.courseName}`,
    '',
    `- **模式深度**：${ledger.depth === 'concise' ? '期末速成（3×3）' : '系统登顶（6×4）'} | **知识点总数**：${topics.length} | **已完成**：${ledger.completedTopics.length}`,
    `- **摸底诊断**：${ledger.diagnostic ? `${ledger.diagnostic.score} 分 → ${ledger.diagnostic.contentDensity}` : '尚未完成摸底诊断'}`,
    `- **到期复习**：${dueReviews.length} 个知识点 | **到期闪卡**：${dueCards.length} 张 | **未攻克错题**：${openWrongs.length} 道`,
    '',
    '## 各知识点掌握度（30天半衰期加权估计，非真实考试预测）',
    '',
    '| ID | 知识点 | 掌握度估计 | 证据置信度 | 练习次数 | 状态标记 |',
    '| :--- | :--- | :---: | :---: | :---: | :--- |',
  ];
  for (const t of topics) {
    const m = ledger.mastery?.[t.id];
    const tags = [];
    if (ledger.recommendedTopicIds.includes(t.id)) tags.push('建议补弱');
    if (openWrongs.some(w => w.topicId === t.id)) tags.push('有错题');
    if (ledger.completedTopics.includes(t.id)) tags.push('已完成');
    lines.push(`| \`${t.id}\` | ${t.title} | ${m ? `${m.estimate}%` : '未测'} | ${m ? m.confidence : '无'} | ${m ? m.evidenceCount : 0} | ${tags.join('、') || '待学习'} |`);
  }
  return lines.join('\n');
}

function renderPlanMarkdown(plan, courseName) {
  const lines = [
    `# 📅 考前动态复习计划：${courseName}`,
    '',
    `- **周期**：\`${plan.startDate}\` → \`${plan.examDate}\`（共 ${plan.days} 天） | **每日预算**：${plan.dailyMinutes} 分钟 | **模式**：${plan.mode === 'challenge' ? '闯关顺序' : '弱项优先'}`,
    `- **排入知识点**：${plan.scheduledTopics}/${plan.totalTopics}`,
    '',
  ];
  for (const day of plan.calendar) {
    lines.push(`### ${day.date}`);
    for (const t of day.tasks) {
      const badge = t.kind === 'retrieval' ? '🔁 [间隔提取]' : '📘 [主线攻克]';
      const partText = t.parts > 1 ? `（第 ${t.part}/${t.parts} 段）` : '';
      lines.push(`- ${badge} **${t.title}**${partText} · \`${t.minutes} 分钟\` — ${(t.reasons || []).join('、')}`);
    }
    lines.push('');
  }
  if (plan.omitted.length) {
    lines.push('## ⚠️ 超出当前时间预算未排入知识点', '');
    for (const o of plan.omitted) {
      lines.push(`- **${o.title}**（约需 ${o.minutes} 分钟）：${o.reason}`);
    }
    lines.push('');
  }
  lines.push(`> ℹ️ ${plan.note}`);
  return lines.join('\n');
}

function renderCheatsheetMarkdown(ledger) {
  const topicMap = new Map(ledger.stages.flatMap(s => s.topics || []).map(t => [t.id, t]));
  const openWrongs = (ledger.wrongBook || []).filter(w => !w.resolved);
  const weakIds = new Set(ledger.recommendedTopicIds || []);

  const lines = [
    `# 📄 《${ledger.courseName}》考前速记一页纸 & 错题复盘清单`,
    '',
    `> 生成时间：${new Date().toISOString().slice(0, 10)} | 覆盖阶段：${ledger.stages.length} | 核心知识点：${topicMap.size} | 未解错题：${openWrongs.length}`,
    '',
    '## 一、🚨 优先补弱高危考点',
    '',
  ];

  const weakTopics = [...weakIds].map(id => topicMap.get(id)).filter(Boolean);
  if (weakTopics.length) {
    for (const t of weakTopics) {
      const m = ledger.mastery?.[t.id];
      lines.push(`- **${t.title}**（当前掌握估计：${m ? `${m.estimate}%` : '待测'}）`);
      for (const kp of t.keyPoints || []) lines.push(`  - ${kp}`);
    }
  } else {
    lines.push('- 暂无高危薄弱项（建议先执行摸底诊断或记录测验）。');
  }

  lines.push('', '## 二、❌ 未攻克错题速览', '');
  if (openWrongs.length) {
    openWrongs.forEach((w, idx) => {
      const title = topicMap.get(w.topicId)?.title || w.topicId;
      lines.push(`${idx + 1}. **[${title}]** ${w.q}`);
      if (w.userAnswer) lines.push(`   - 我的误选：\`${w.userAnswer}\` → 正解：**${w.correctAnswer || '见解析'}**`);
      if (w.explain) lines.push(`   - 避坑点拨：${w.explain}`);
    });
  } else {
    lines.push('- 当前错题本已清空！');
  }

  lines.push('', '## 三、🗺️ 全课程核心要点总览', '');
  for (const st of ledger.stages) {
    lines.push(`### ${st.name}`);
    for (const t of st.topics || []) {
      lines.push(`- **${t.title}**`);
      for (const kp of t.keyPoints || []) lines.push(`  - ${kp}`);
    }
    lines.push('');
  }

  if (ledger.flashcards?.length) {
    lines.push('## 四、🃏 高频记忆闪卡（遮住答案先回忆）', '');
    for (const c of ledger.flashcards) {
      lines.push(`- **Q:** ${c.front}`);
      lines.push(`  - **A:** ${c.back}${c.sourceQuote ? ` *（原文据：${c.sourceQuote}）*` : ''}`);
    }
    lines.push('');
  }

  lines.push('> ⚠️ 提示：本速记单由当前学习账本客观汇总生成，不替代教材原文核对，也不预测实际考卷范围。');
  return lines.join('\n');
}

async function main() {
  const { command, flags, bools } = parseCliArgs(process.argv);
  if (!command || bools.has('help') || bools.has('h')) {
    printHelp();
    process.exit(command ? 0 : 1);
  }

  const filePath = path.resolve(flags.get('file') || DEFAULT_LEDGER);
  const asJson = bools.has('json');

  if (command === 'init') {
    const courseName = flags.get('course') || '';
    const fromJson = flags.get('from-json');
    const depth = flags.get('depth') === 'concise' ? 'concise' : 'comprehensive';
    const base = fromJson
      ? normalizeImportedCourse(JSON.parse(fs.readFileSync(path.resolve(fromJson), 'utf8')), courseName, flags.get('depth'))
      : buildDefaultCourse(courseName || '未命名学科', depth);

    const ledger = {
      schema: 'huixue-study-ledger-v1',
      ...base,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      diagnostic: null,
      recommendedTopicIds: [],
      completedTopics: [],
      practiceHistory: [],
      mastery: {},
      reviewPlans: {},
      wrongBook: [],
      cardReviews: {},
      sessions: [],
    };
    saveLedger(filePath, ledger);
    if (asJson) console.log(JSON.stringify({ ok: true, filePath, courseName: ledger.courseName, topicCount: ledger.stages.flatMap(s => s.topics).length }, null, 2));
    else console.log(`✅ 已初始化学习账本：${filePath}\n课程：「${ledger.courseName}」（${ledger.stages.length} 阶段，${ledger.stages.flatMap(s => s.topics).length} 知识点）`);
    return;
  }

  const ledger = loadLedger(filePath);

  if (command === 'diagnose') {
    const answers = readJsonArg(flags.get('answers'));
    if (!Array.isArray(answers) || !answers.length) {
      throw new Error('请传入非空 --answers 数组，例如 [{"topicId":"t1","correct":false}]');
    }
    const byTopic = {};
    for (const a of answers) {
      const tid = String(a?.topicId || '').trim();
      if (!tid) continue;
      byTopic[tid] ||= { topicId: tid, total: 0, correct: 0 };
      byTopic[tid].total++;
      if (a.correct) byTopic[tid].correct++;
    }
    const topics = Object.values(byTopic).map(t => ({ ...t, score: Math.round((t.correct / t.total) * 100) }));
    const totalCorrect = answers.filter(a => a?.correct).length;
    const score = Math.round((totalCorrect / answers.length) * 100);
    const density = densityFromScore(score);
    const recommendedTopicIds = topics.filter(t => t.score < 80).map(t => t.topicId);

    ledger.diagnostic = {
      score,
      contentDensity: density.label,
      densityKey: density.key,
      topics,
      diagnosedAt: new Date().toISOString(),
    };
    ledger.recommendedTopicIds = [...new Set([...(ledger.recommendedTopicIds || []), ...recommendedTopicIds])];
    saveLedger(filePath, ledger);

    if (asJson) console.log(JSON.stringify({ ok: true, ...ledger.diagnostic, recommendedTopicIds }, null, 2));
    else console.log(`🩺 摸底诊断完成：${score} 分\n建议教学密度：${density.label} (${density.key})\n薄弱知识点：${recommendedTopicIds.join(', ') || '无'}`);
    return;
  }

  if (command === 'practice') {
    const topicId = String(flags.get('topic') || '').trim();
    const score = Number(flags.get('score'));
    const total = Math.max(1, Number(flags.get('total') || 1));
    const kind = flags.get('kind') || 'course-quiz';
    const durationMinutes = flags.has('duration') ? Number(flags.get('duration')) : null;
    if (!topicId || !Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error('practice 需要有效的 --topic <id> 与 --score <0-100>');
    }
    const now = Date.now();
    const attempt = {
      id: `att-${crypto.randomUUID().slice(0, 8)}`,
      topicId,
      score,
      total,
      kind,
      createdAt: new Date(now).toISOString(),
    };
    ledger.practiceHistory.push(attempt);
    if (score >= 80 && !ledger.completedTopics.includes(topicId)) {
      ledger.completedTopics.push(topicId);
    }
    if (durationMinutes && durationMinutes >= 1 && durationMinutes < 240) {
      ledger.sessions.push({ topicId, durationMinutes, createdAt: attempt.createdAt });
    }

    const topicAttempts = ledger.practiceHistory.filter(a => a.topicId === topicId);
    ledger.mastery[topicId] = estimateMastery(topicAttempts, now);

    const oldReview = ledger.reviewPlans[topicId];
    const intervalDays =
      score < 60 ? 1 : score < 85 ? 3 : Math.min(30, Math.max(5, Math.round((oldReview?.intervalDays || 3) * 1.7)));
    ledger.reviewPlans[topicId] = {
      topicId,
      intervalDays,
      nextReviewAt: new Date(now + intervalDays * DAY_MS).toISOString(),
      lastScore: score,
      evidenceType: 'graded-practice',
      status: 'pending',
    };

    if (flags.has('wrong')) {
      const wrongs = readJsonArg(flags.get('wrong'));
      for (const w of Array.isArray(wrongs) ? wrongs : []) {
        if (!w?.q) continue;
        const dup = ledger.wrongBook.find(x => !x.resolved && x.topicId === topicId && x.q === w.q);
        if (!dup) {
          ledger.wrongBook.push({
            id: `w-${crypto.randomUUID().slice(0, 8)}`,
            topicId,
            q: String(w.q),
            userAnswer: String(w.userAnswer || ''),
            correctAnswer: String(w.correctAnswer || ''),
            explain: String(w.explain || ''),
            resolved: false,
            createdAt: attempt.createdAt,
          });
        }
      }
    }

    saveLedger(filePath, ledger);
    const out = { ok: true, topicId, mastery: ledger.mastery[topicId], reviewPlan: ledger.reviewPlans[topicId], unresolvedWrongCount: ledger.wrongBook.filter(w => !w.resolved).length };
    if (asJson) console.log(JSON.stringify(out, null, 2));
    else console.log(`📝 已记录 [${topicId}] 练习 (${score} 分 / ${total} 题)\n掌握度估计：${out.mastery.estimate}%（置信度：${out.mastery.confidence}）\n下次复习间隔：${intervalDays} 天后 | 未解错题总数：${out.unresolvedWrongCount}`);
    return;
  }

  if (command === 'resolve-wrong') {
    const key = String(flags.get('index') || '').trim();
    const open = ledger.wrongBook.filter(w => !w.resolved);
    let target = ledger.wrongBook.find(w => w.id === key);
    if (!target && /^\d+$/.test(key)) {
      const idx = Number(key) - 1;
      target = open[idx];
    }
    if (!target) throw new Error(`未找到可标记的未解错题：${key}`);
    target.resolved = true;
    target.resolvedAt = new Date().toISOString();
    saveLedger(filePath, ledger);
    if (asJson) console.log(JSON.stringify({ ok: true, resolvedId: target.id }, null, 2));
    else console.log(`✅ 已将错题「${target.q.slice(0, 36)}」标记为已攻克！`);
    return;
  }

  if (command === 'card-review') {
    const cardId = String(flags.get('card') || '').trim();
    const rating = String(flags.get('rating') || '').trim();
    if (!cardId) throw new Error('请提供 --card <cardId>');
    const prev = ledger.cardReviews?.[cardId] || null;
    const next = scheduleCard(prev, rating);
    ledger.cardReviews ||= {};
    ledger.cardReviews[cardId] = { cardId, ...next };
    saveLedger(filePath, ledger);
    if (asJson) console.log(JSON.stringify({ ok: true, ...ledger.cardReviews[cardId] }, null, 2));
    else console.log(`🃏 闪卡 [${cardId}] 自评为 ${rating}：下次复习间隔 ${next.intervalDays} 天（自评回忆不计入客观测验成绩）`);
    return;
  }

  if (command === 'plan') {
    const startDate = flags.get('start-date') || todayStr();
    const examDate = flags.get('exam-date') || '';
    const dailyMinutes = Number(flags.get('daily-minutes'));
    const mode = flags.get('mode') === 'challenge' ? 'challenge' : 'free';
    const plan = buildStudyPlan(ledger, { startDate, examDate, dailyMinutes, mode });
    if (asJson) console.log(JSON.stringify(plan, null, 2));
    else console.log(renderPlanMarkdown(plan, ledger.courseName));
    return;
  }

  if (command === 'status') {
    if (asJson) {
      console.log(JSON.stringify({
        courseName: ledger.courseName,
        depth: ledger.depth,
        diagnostic: ledger.diagnostic,
        completedCount: ledger.completedTopics.length,
        totalTopics: ledger.stages.flatMap(s => s.topics || []).length,
        mastery: ledger.mastery,
        unresolvedWrongCount: ledger.wrongBook.filter(w => !w.resolved).length,
        reviewPlans: ledger.reviewPlans,
      }, null, 2));
    } else {
      console.log(renderStatusMarkdown(ledger));
    }
    return;
  }

  if (command === 'export-cheatsheet') {
    const md = renderCheatsheetMarkdown(ledger);
    const outPath = flags.get('out');
    if (outPath) {
      const resolved = path.resolve(outPath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, md, 'utf8');
      if (asJson) console.log(JSON.stringify({ ok: true, outPath: resolved, bytes: Buffer.byteLength(md) }, null, 2));
      else console.log(`📄 已导出《考前速记一页纸》至：${resolved}`);
    } else {
      console.log(md);
    }
    return;
  }

  throw new Error(`未知子命令: ${command}`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  main().catch(err => {
    console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }));
    process.exit(1);
  });
}
