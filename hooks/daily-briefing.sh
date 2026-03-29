#!/bin/bash
# Daily briefing hook — parses action-tracker.yaml (YAML source of truth)
# Falls back to action-tracker.md if YAML doesn't exist yet
# Event: SessionStart

# UPDATE THESE PATHS to match your setup
TRACKER_YAML="$HOME/action-tracker.yaml"
TRACKER_MD="$HOME/action-tracker.md"
TODAY=$(date +%F)

# Prefer YAML, fall back to markdown
if [ -f "$TRACKER_YAML" ]; then
  # Parse YAML with Python
  BRIEFING=$(python -c "
import yaml, sys
from datetime import date, timedelta

sys.stdout.reconfigure(encoding='utf-8')
today = date.fromisoformat('$TODAY')
# Show next 7 days (so Friday shows Monday tasks)
week_end = today + timedelta(days=7)

try:
    with open(r'''$TRACKER_YAML''', 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)
except Exception as e:
    print(f'Error reading tracker: {e}')
    sys.exit(1)

tasks = data.get('tasks', [])
waiting = data.get('waiting', [])
backlog = data.get('backlog', [])

overdue = []
due_today = []
due_week = []

for t in tasks:
    status = t.get('status', '')
    if status == 'done':
        continue
    due = t.get('due')
    if due is None:
        due_week.append(t)
        continue
    if isinstance(due, str):
        try:
            due_date = date.fromisoformat(due)
        except ValueError:
            due_week.append(t)
            continue
    else:
        due_date = due

    if due_date < today:
        overdue.append(t)
    elif due_date == today:
        due_today.append(t)
    elif due_date <= week_end:
        due_week.append(t)

# --- Output ---
if overdue:
    print(f'OVERDUE ({len(overdue)}):')
    for t in overdue:
        print(f'  - [{t[\"title\"]}] ({t[\"project\"]}) -- was due {t.get(\"due\", \"TBD\")}, status: {t[\"status\"]}')
else:
    print('OVERDUE: None')
print()

if due_today:
    print(f'DUE TODAY ({len(due_today)}):')
    for t in due_today:
        print(f'  - [{t[\"title\"]}] ({t[\"project\"]}) -- status: {t[\"status\"]}')
else:
    print('DUE TODAY: None')
print()

print(f'DUE THIS WEEK ({len(due_week)}):')
for t in due_week:
    due_str = t.get('due') or 'TBD'
    print(f'  - [{t[\"title\"]}] ({t[\"project\"]}) -- due {due_str}, status: {t[\"status\"]}')
print()

if waiting:
    print(f'WAITING ON ({len(waiting)}):')
    for w in waiting:
        follow = w.get('follow_up') or 'TBD'
        days_waiting = (today - date.fromisoformat(str(w.get('since', today)))).days if w.get('since') else 0
        stale = ' [STALE - {}d]'.format(days_waiting) if days_waiting > 7 else ''
        print(f'  - [{w[\"title\"]}] -- waiting on {w[\"waiting_for\"]}, follow up {follow}{stale}')
else:
    print('WAITING ON: Nothing')
print()

if backlog:
    print(f'BACKLOG ({len(backlog)}):')
    for b in backlog:
        print(f'  - [{b[\"title\"]}] ({b[\"project\"]})')
    print()
" 2>&1)

  if [ $? -ne 0 ]; then
    BRIEFING="YAML parsing error. Run /plan-day for full briefing."
  fi

  echo "SessionStart: DAILY BRIEFING (${TODAY}):"
  echo ""
  echo "$BRIEFING"
  echo ""
  echo "SKILLS: /plan-day (full view + calendar) | /brain-dump | /wrap-up | /meeting-notes | /weekly-review"
  echo ""
  echo "INSTRUCTION: Display the briefing above to the user as your opening message. Do NOT make any tool calls to process this data. Just show it and ask what they want to work on."

else
  echo "SessionStart: DAILY BRIEFING ($TODAY):"
  echo ""
  echo "No action tracker found. Use /brain-dump to start capturing tasks."
fi
