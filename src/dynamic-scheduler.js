const nodeCron = require('node-cron');
const { mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const { markdownToTelegramHtml } = require('./telegram-format');

function slugify(str) {
    return String(str)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'schedule';
}

function generateId(label, existingIds) {
    const base = `${slugify(label)}-${Math.floor(Date.now() / 1000)}`;
    if (!existingIds.has(base)) return base;
    let counter = 2;
    while (existingIds.has(`${base}-${counter}`)) counter++;
    return `${base}-${counter}`;
}

function parseSchedule(schedule) {
    if (nodeCron.validate(schedule)) {
        return { cronExpr: schedule, isOneShot: false };
    }
    const dt = new Date(schedule);
    if (!isNaN(dt.getTime())) {
        if (dt <= new Date()) {
            throw new Error(`Scheduled datetime is in the past: ${schedule}`);
        }
        const m = dt.getMinutes();
        const h = dt.getHours();
        const d = dt.getDate();
        const mo = dt.getMonth() + 1;
        return { cronExpr: `${m} ${h} ${d} ${mo} *`, isOneShot: true };
    }
    throw new Error(`Invalid schedule: must be a cron expression or ISO 8601 datetime, got: "${schedule}"`);
}

function createDynamicScheduler(deps) {
    // deps.runParentAgent may be null at construction time — injected later
    const tasks = new Map(); // id -> { record, cronTask }

    function _persist() {
        const records = [...tasks.values()].map((t) => t.record);
        const dir = dirname(deps.persistPath);
        mkdirSync(dir, { recursive: true });
        const tmp = `${deps.persistPath}.tmp`;
        writeFileSync(tmp, JSON.stringify(records, null, 2), 'utf8');
        renameSync(tmp, deps.persistPath);
    }

    function _activate(record) {
        const cronTask = deps.cron
            ? deps.cron.schedule(record.cronExpr, _makeCallback(record), { timezone: deps.timezone })
            : nodeCron.schedule(record.cronExpr, _makeCallback(record), { timezone: deps.timezone });
        tasks.set(record.id, { record, cronTask });
    }

    function _makeCallback(record) {
        return async () => {
            console.log(`[scheduler] firing: ${record.id} (${record.mode})`);
            const chatId = record.chatId ?? deps.defaultChatId;
            try {
                if (record.mode === 'message') {
                    if (chatId) {
                        await deps.bot.telegram
                            .sendMessage(chatId, markdownToTelegramHtml(record.message), { parse_mode: 'HTML' })
                            .catch((err) => console.error(`[scheduler] telegram send failed: ${err.message}`));
                    }
                } else {
                    if (!deps.runParentAgent) {
                        throw new Error('runParentAgent not yet available');
                    }
                    const { output } = await deps.runParentAgent({
                        chatId: chatId ?? 'global',
                        jobName: record.id,
                        prompt: record.prompt,
                        source: 'scheduler',
                    });
                    if (chatId) {
                        await deps.bot.telegram
                            .sendMessage(chatId, markdownToTelegramHtml(output), { parse_mode: 'HTML' })
                            .catch((err) => console.error(`[scheduler] telegram send failed: ${err.message}`));
                    }
                }
            } catch (err) {
                console.error(`[scheduler] failed: ${record.id} — ${err.message}`);
                if (chatId) {
                    await deps.bot.telegram
                        .sendMessage(chatId, `Scheduled task "${record.label ?? record.id}" failed: ${err.message}`)
                        .catch((e) => console.error(`[scheduler] telegram error send failed: ${e.message}`));
                }
            } finally {
                if (record.isOneShot) {
                    const entry = tasks.get(record.id);
                    if (entry) entry.cronTask.stop();
                    tasks.delete(record.id);
                    _persist();
                }
            }
        };
    }

    function _createRecord(input, mode) {
        const { cronExpr, isOneShot } = parseSchedule(input.schedule);
        const existingIds = new Set(tasks.keys());
        const id = generateId(input.label ?? (mode === 'llm' ? 'task' : 'message'), existingIds);
        return {
            id,
            mode,
            schedule: input.schedule,
            cronExpr,
            isOneShot,
            label: input.label ?? null,
            prompt: mode === 'llm' ? input.prompt : null,
            message: mode === 'message' ? input.message : null,
            chatId: input.chatId ?? null,
            createdAt: new Date().toISOString(),
        };
    }

    function scheduleTask(input) {
        const record = _createRecord(input, 'llm');
        _activate(record);
        _persist();
        console.log(`[scheduler] scheduled task: ${record.id} (${record.schedule})`);
        return record.id;
    }

    function scheduleMessage(input) {
        const record = _createRecord(input, 'message');
        _activate(record);
        _persist();
        console.log(`[scheduler] scheduled message: ${record.id} (${record.schedule})`);
        return record.id;
    }

    function cancelSchedule(id) {
        const entry = tasks.get(id);
        if (!entry) return false;
        entry.cronTask.stop();
        tasks.delete(id);
        _persist();
        console.log(`[scheduler] cancelled: ${id}`);
        return true;
    }

    function listSchedules() {
        return [...tasks.values()].map((t) => t.record);
    }

    function reloadFromDisk() {
        let records;
        try {
            const raw = readFileSync(deps.persistPath, 'utf8');
            records = JSON.parse(raw);
        } catch (err) {
            if (err.code === 'ENOENT') return;
            console.error(`[scheduler] failed to read persisted schedules: ${err.message}`);
            return;
        }

        const now = new Date();
        const active = records.filter((r) => {
            if (r.isOneShot) {
                // Reconstruct target datetime from the cron expression fields
                const match = r.cronExpr.match(/^(\d+) (\d+) (\d+) (\d+) \*$/);
                if (!match) return false;
                const [, min, hour, day, month] = match.map(Number);
                const year = now.getFullYear();
                const target = new Date(year, month - 1, day, hour, min, 0);
                if (target <= now) return false;
            }
            return true;
        });

        for (const record of active) {
            _activate(record);
        }

        if (active.length !== records.length) {
            _persist();
        }

        console.log(`[scheduler] reloaded ${active.length} schedule(s)`);
    }

    return { scheduleTask, scheduleMessage, cancelSchedule, listSchedules, reloadFromDisk };
}

module.exports = { createDynamicScheduler, slugify, parseSchedule };
