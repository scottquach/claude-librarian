# Heartbeat Agent Design

## Overview

A periodic heartbeat triggers the agent every few hours. The heartbeat is only a wakeup mechanism — it does not define behavior. Most cycles result in a no-op. The agent's decision layer determines whether anything is worth surfacing.

## Architecture

### Trigger

A cron job fires every few hours (e.g., every 2-3 hours during waking hours). The heartbeat's only job is to wake the system up.

### Decision Input (Context Snapshot)

When the heartbeat fires, the agent reads a minimal context snapshot:

1. **Current time + day shape** — time of day, morning/afternoon/evening, weekday vs weekend
2. **Today's task + calendar state** — what was planned, what's been checked off, what's coming up
3. **Last activity signal** — when the user last sent a message or logged something

This is the minimum surface area needed to make a holistic judgment without reading the entire vault.

### Decision Layer

With the context snapshot, the agent asks one question: **is anything worth surfacing right now?**

This is a holistic judgment, not a checklist. The agent should reason about:

- **Gaps**: expected activity that hasn't happened (no log by noon, rollover not done by 10am)
- **Proximity**: something relevant coming up soon (event in 90 minutes, task due today)
- **Momentum**: patterns that suggest something needs attention (tasks piling up, long silence)

The default answer is no. Most cycles should be silent.

### Action Set

When the agent decides something is worth surfacing, it can take exactly one of:

| Action | Description |
|---|---|
| **Notify** | Send a Telegram message to the user |
| **Schedule follow-up** | Silently schedule a follow-up heartbeat check at a specific time |
| **No-op** | Do nothing (the common case) |

Follow-up scheduling is silent — the agent does not narrate that it's scheduling one. Autonomous job execution (e.g., triggering `daily-rollover`) is out of scope; the agent surfaces and waits for the user to act.

## Design Principles

- **Heartbeat = trigger only.** Behavior lives in the decision layer, not the schedule.
- **Most cycles are no-ops.** Organic feel comes from acting rarely and relevantly, not on every tick.
- **Bounded action set.** The agent observes and informs — it never writes to the vault autonomously.
- **Silent follow-ups.** Scheduling is an internal mechanism, not something the user sees.
- **Minimal context snapshot.** Read just enough to reason about gaps, proximity, and momentum.
