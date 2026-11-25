#!/usr/bin/env node
/**
 * 慧学导师 · 技能完整性、隐私安全与 CLI 端到端自动化验收脚本
 * 零外部依赖（仅用 Node.js 原生内置模块 + node:assert/strict）。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SKILL_ROOT = path.resolve(path.dirname(__filename), '..');
const TEXT_EXTS = new Set(['.md', '.mjs', '.js', '.json', '.ps1', '.sh', '.txt', '.yml', '.yaml']);

const SECRET_PATTERNS = [
  { name: 'GitHub classic token', re: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: 'OpenAI/DeepSeek style key', re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'Hardcoded private server IP', re: /\b43\.138\.195\.160\b/ },
  { name: 'Known operator password', re: /Zz8131733/ },
];

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.huixue-study') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function checkFrontmatter() {
  const skillPath = path.join(SKILL_ROOT, 'SKILL.md');
  assert.ok(fs.existsSync(skillPath), '缺少核心文件 SKILL.md');
  const raw = fs.readFileSync(skillPath, 'utf8');
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(fmMatch, 'SKILL.md 缺少合法 YAML frontmatter');
  assert.match(fmMatch[1], /^name:\s*huixue-mentor\s*$/m, 'SKILL.md frontmatter name 必须为 huixue-mentor');
  assert.match(fmMatch[1], /^description:\s*\S+/m, 'SKILL.md frontmatter 必须包含非空 description');
  return raw;
}

function checkRelativeLinks(mdFile) {
  if (!fs.existsSync(mdFile)) return 0;
  const content = fs.readFileSync(mdFile, 'utf8');
  const baseDir = path.dirname(mdFile);
  let checked = 0;
  for (const m of content.matchAll(/\[[^\]]+\]\((\.\/[^)#\s]+(?:#[^)\s]*)?)\)/g)) {
    const rel = m[1].split('#')[0];
    const target = path.resolve(baseDir, rel);
    assert.ok(fs.existsSync(target), `${path.basename(mdFile)} 中的相对链接目标不存在: ${rel}`);
    checked++;
  }
  return checked;
}

function scanSecrets() {
  const files = walkFiles(SKILL_ROOT);
  for (const file of files) {
    if (!TEXT_EXTS.has(path.extname(file).toLowerCase())) continue;
    const content = fs.readFileSync(file, 'utf8');
    // 跳过脚本自身正则字面量定义行
    if (path.resolve(file) === path.resolve(__filename)) continue;
    for (const pat of SECRET_PATTERNS) {
      assert.equal(pat.re.test(content), false, `检测到疑似敏感信息 (${pat.name}) 存在于: ${path.relative(SKILL_ROOT, file)}`);
    }
  }
  return files.length;
}

function runCli(scriptName, args) {
  const scriptPath = path.join(SKILL_ROOT, 'scripts', scriptName);
  const out = execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: SKILL_ROOT,
    encoding: 'utf8',
    timeout: 15_000,
  });
  return out;
}

function testResearchSyllabusCli() {
  const listOut = JSON.parse(runCli('research-syllabus.mjs', ['--list-disciplines', '--json']));
  assert.equal(listOut.canonicalDisciplines.length, 26, '应包含 26 个规范学科词条');
  assert.equal(listOut.curatedSyllabi.length, 12, '应包含 12 门内置 6x4 课程大纲');

  const psych = JSON.parse(runCli('research-syllabus.mjs', ['--major', '心理学', '--offline', '--depth', 'comprehensive', '--json']));
  assert.equal(psych.stages.length, 6, '系统模式心理学应返回 6 阶段');
  assert.equal(psych.stages.reduce((s, st) => s + st.topics.length, 0), 24, '系统模式心理学应返回 24 个知识点');

  const lawConcise = JSON.parse(runCli('research-syllabus.mjs', ['--major', '法学', '--offline', '--depth', 'concise', '--json']));
  assert.equal(lawConcise.stages.length, 3, '速成模式法学应返回 3 阶段');
  assert.equal(lawConcise.stages.reduce((s, st) => s + st.topics.length, 0), 9, '速成模式法学应返回 9 个知识点');

  const custom = JSON.parse(runCli('research-syllabus.mjs', ['--major', '量子密码学', '--offline', '--json']));
  assert.equal(custom.stages.length, 6, '冷门交叉专业离线兜底也应生成完整 6 阶段骨架');
}

function testStudyTrackerCli() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'huixue-mentor-test-'));
  const ledgerPath = path.join(tmpDir, 'ledger.json');
  const sampleCourse = path.join(SKILL_ROOT, 'examples', 'sample-course.json');
  const cheatOut = path.join(tmpDir, 'cheatsheet.md');

  try {
    const initRes = JSON.parse(runCli('study-tracker.mjs', ['init', '--file', ledgerPath, '--from-json', sampleCourse, '--json']));
    assert.equal(initRes.ok, true);
    assert.ok(initRes.topicCount >= 3);

    const diagRes = JSON.parse(runCli('study-tracker.mjs', [
      'diagnose', '--file', ledgerPath,
      '--answers', JSON.stringify([{ topicId: 't1', correct: false }, { topicId: 't2', correct: true }, { topicId: 't3', correct: false }]),
      '--json',
    ]));
    assert.equal(diagRes.score, 33);
    assert.equal(diagRes.densityKey, 'foundation', '33分应触发 foundation 基础支架档位');
    assert.ok(diagRes.recommendedTopicIds.includes('t1'));

    const pracRes = JSON.parse(runCli('study-tracker.mjs', [
      'practice', '--file', ledgerPath,
      '--topic', 't1', '--score', '50', '--total', '4', '--duration', '35',
      '--wrong', JSON.stringify([{ q: '测试错题', userAnswer: 'A', correctAnswer: 'B', explain: '核心前提判别错误' }]),
      '--json',
    ]));
    assert.equal(pracRes.ok, true);
    // Bayesian neutral prior: (2 + 1) / (4 + 2) = 50%
    assert.equal(pracRes.mastery.estimate, 50);
    assert.equal(pracRes.reviewPlan.intervalDays, 1);
    assert.equal(pracRes.unresolvedWrongCount, 1);

    const cardRes = JSON.parse(runCli('study-tracker.mjs', [
      'card-review', '--file', ledgerPath, '--card', 'c1', '--rating', 'good', '--json',
    ]));
    assert.equal(cardRes.evidenceType, 'self-reported-recall');
    assert.equal(cardRes.intervalDays, 3);

    const planRes = JSON.parse(runCli('study-tracker.mjs', [
      'plan', '--file', ledgerPath,
      '--start-date', '2026-12-01', '--exam-date', '2026-12-10', '--daily-minutes', '90', '--mode', 'free', '--json',
    ]));
    assert.equal(planRes.days, 9);
    assert.ok(planRes.calendar.length > 0, '排期日历不能为空');
    assert.ok(planRes.calendar.some(d => d.tasks.some(t => t.kind === 'retrieval')), '排期应自动插入间隔提取练习');

    const statusRes = JSON.parse(runCli('study-tracker.mjs', ['status', '--file', ledgerPath, '--json']));
    assert.equal(statusRes.unresolvedWrongCount, 1);

    const cheatRes = JSON.parse(runCli('study-tracker.mjs', ['export-cheatsheet', '--file', ledgerPath, '--out', cheatOut, '--json']));
    assert.equal(cheatRes.ok, true);
    const cheatMd = fs.readFileSync(cheatOut, 'utf8');
    assert.match(cheatMd, /测试错题/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

checkFrontmatter();
const skillLinks = checkRelativeLinks(path.join(SKILL_ROOT, 'SKILL.md'));
const readmeLinks = checkRelativeLinks(path.join(SKILL_ROOT, 'README.md'));
const scannedFiles = scanSecrets();
testResearchSyllabusCli();
testStudyTrackerCli();

console.log(JSON.stringify({
  ok: true,
  skillRoot: SKILL_ROOT,
  scannedFiles,
  checkedLinks: { skillMd: skillLinks, readmeMd: readmeLinks },
  tests: ['frontmatter', 'relative-links', 'secret-scan', 'research-syllabus-cli', 'study-tracker-e2e'],
}, null, 2));
