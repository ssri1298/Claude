# 🩺 Scalpel — NEET SS (Surgical) Study Agent

A premium dark-mode study assistant that turns your video-lesson screenshots into a daily plan, a tickable to-do list and a spaced-repetition revision schedule — prioritised by how often each topic shows up in past NEET SS Surgical papers.

## Features
- **Screenshot import (offline OCR)** — drop/paste screenshots of your course video list; Tesseract.js reads topic titles and durations in the browser (dark-mode screenshots supported). Review/edit the table, then import.
- **Morning check-in** — "How much time do you have today?" → the planner splits it between **active recall** of due topics (default 30%) and **new videos** (video length × 1.25 for pauses/notes), with a break buffer.
- **Study Next** — topics ranked by past-exam frequency weight (built-in NEET SS Surgical model of 100 topic areas), then video length and course order. Missed topics are carried over to the top.
- **Low-yield skip — only with your OK** — rarely-asked topics appear in a "Suggested to skip" tray; nothing is skipped until you approve. Restore any time from the Library.
- **To-do list** — finalized plans become a checklist. Recall items open an active-recall card (write from memory → rate Blank/Hard/Good/Easy) that drives SM-2-style scheduling (1 → 3 → 7 → ×ease days). When everything is ticked, choose **Add more topics** or **Continue revision**.
- **Calendar** — time-blocked day timeline with breaks, monthly heat-map of study minutes, logged Pomodoro sessions.
- **Dashboard** — daily surgical motivational quote, study-time area chart (new vs recall, 14/30 days), topics-per-week chart, topic-status donut, per-subject progress, streak, exam countdown, agent activity feed.
- **Pomodoro timer** — floating dock on every page; link it to a to-do, focus minutes are logged to the calendar and the dashboard graph; offers to tick the to-do when the block ends.

## Agent architecture
`server/agents/` — deterministic, local, no external AI calls:

| Agent | Role |
|---|---|
| `orchestrator.js` (StudyAgent) | Receives intents (start day, finalize, complete task, extend day) and routes them over the message bus |
| `todoAgent.js` — **To-do subagent** | Creates the checklist from a finalized plan, handles tick/untick (with undo), schedules spaced-repetition reviews, rolls unfinished items over, emits `day.complete` |
| `calendarAgent.js` — **Calendar subagent** | Time-blocks the day (auto breaks), appends extension blocks, logs Pomodoro sessions, month/day views & study-minute aggregates |
| `plannerAgent.js` | Time split between recall and new videos |
| `yieldAgent.js` | Classifies topics against `server/data/neetss-surgical.json` and ranks Study Next |

Every bus message is logged to `agent_log` and shown in the dashboard's *Agent activity* feed.

> **Note on exam-frequency weights:** the built-in weights (1–10) are editorial estimates, not official counts. Override any topic with the slider in **Library**, or import your own past-paper analysis as CSV (`topic,count`).

## Run it
Requires **Node.js ≥ 22.5** (uses the built-in `node:sqlite`).

```bash
npm install          # also copies OCR engine + English language data into public/tesseract
npm run dev          # API on :5174 + Vite on http://localhost:5173
# or production:
npm run build && npm start   # http://localhost:5173
npm test             # unit tests (parser, planner, SRS, subagents, full day flow)
```

Data lives in `data/study.db` (SQLite). Export/restore a JSON backup from **Settings**.
