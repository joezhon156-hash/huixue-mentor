# 🎓 Huixue Mentor (慧学导师)

**All-Discipline University Mastery, Final-Exam Crash Engine, and Lifelong AI Learning Mentor**

[中文说明](./README.md) · [SKILL.md](./SKILL.md) · [Discipline Rubrics](./references/discipline-rubrics.md)

---

## 🌟 Origin & Philosophy

Built for two moments every ambitious learner faces:
1. **Final-Exam Crunch Week**: Turning scattered lecture slides, messy PDFs, and past exam papers into a verified high-yield roadmap, faithful step-by-step walkthroughs, printable cheat sheets, and a realistic countdown plan.
2. **Lifelong Cross-Disciplinary Mastery**: Guiding anyone—regardless of background—from absolute beginner to university-grade mastery in any domain (Psychology, Law, Medicine, Economics, CS, Engineering, Humanities, Languages, etc.).

Distilled from the core pedagogical, verification, and spaced-scheduling engines of **Huixue (慧学)** into a **zero-dependency, cross-agent Skill** compatible with **Antigravity, Claude Code, Cursor, and Codex**.

---

## 🚀 Key Features

- **6-Stage Mastery & 3-Stage Crash Syllabus Research ([`scripts/research-syllabus.mjs`](./scripts/research-syllabus.mjs))**:
  - Canonical normalization across **26 academic disciplines** + **12 built-in 6×4 university-grade syllabi**.
  - Live GitHub open-course search with strict relevance/blacklist filtering, multi-token rotation (`GITHUB_TOKENS`), and **ETag 304 zero-quota caching** (plus full `--offline` mode).
- **11+1 Discipline-Specific Double-Check Rubrics ([`references/discipline-rubrics.md`](./references/discipline-rubrics.md))**:
  - Dedicated verification checklists for Math (7-step + A–K 11-dimension checks), CS (complexity + Dry-Run edge cases), Physics/Engineering (SI dimensional & limit checks), Chemistry/Biology, Clinical Medicine (SOAP + Red Flags + disclaimer), Finance/Accounting (double-entry balance), Law (IRAC + strict anti-hallucination rule against fabricated statute numbers), Architecture/Design (GB 550xx & WCAG >= 4.5:1), Humanities, and Foreign Languages.
- **Feynman Zero-Barrier Scaffolding ([`references/feynman-and-density.md`](./references/feynman-and-density.md))**:
  - *Mechanism Before Name* → *12 Cross-Domain Life Analogies + Explicit Analogy Limits* → *Jargon Translator* → *3-Step Ladder* → *Self-Check Prompt*.
- **Adaptive Learning Ledger & Countdown Scheduler ([`scripts/study-tracker.mjs`](./scripts/study-tracker.mjs))**:
  - Local JSON persistence, diagnostic density calibration (`foundation` / `standard` / `advanced`), **30-day half-life Bayesian mastery estimation**, wrong-question book, separated self-reported flashcard SRS, `+1/+3/+7`-day spaced retrieval scheduling, and one-command printable cheatsheet export.

---

## ⚡ Quick Install

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Target antigravity-global
```

**macOS / Linux:**
```bash
bash ./scripts/install.sh antigravity-global   # or claude / cursor / codex / all
```

Run end-to-end self-validation anytime (zero external packages required, Node.js 18+):
```bash
node ./scripts/validate-skill.mjs
```

---

## 📄 License

Released under the [MIT License](./LICENSE).
