import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { TZDate } from '@date-fns/tz';
import { addDays, endOfDay, startOfDay } from 'date-fns';
import ical from 'node-ical';
import { z } from 'zod';

function getCalendarTimezone() {
    return process.env.BOT_TIMEZONE ?? 'America/Chicago';
}

function createZonedDay(dateString, timeZone) {
    const [year, month, day] = dateString.split('-').map(Number);
    return TZDate.tz(timeZone, year, month - 1, day);
}

function getDefaultStartDate(now = new Date(), timeZone = getCalendarTimezone()) {
    return startOfDay(TZDate.tz(timeZone, now.getTime()));
}

/**
 * Fetch and parse events from a single iCal URL.
 * Returns raw parsed calendar data keyed by UID.
 */
async function fetchIcal(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const text = await response.text();
        return ical.sync.parseICS(text);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Normalize a single event (or recurring instance) into a flat object.
 */
function normalizeEvent(instance, calendarLabel) {
    const timeZone = getCalendarTimezone();
    const startRaw = instance.start instanceof Date ? instance.start : new Date(instance.start);
    const endRaw =
        instance.end instanceof Date
            ? instance.end
            : instance.start instanceof Date
              ? instance.start
              : new Date(instance.start);
    const isAllDay = instance.isFullDay ?? instance.event?.datetype === 'date' ?? false;
    const start = TZDate.tz(timeZone, startRaw.getTime());
    const end = TZDate.tz(timeZone, endRaw.getTime());

    return {
        uid: instance.event?.uid ?? instance.uid ?? '',
        title: instance.summary ?? instance.event?.summary ?? '',
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: isAllDay,
        location: instance.event?.location ?? instance.location ?? '',
        description: instance.event?.description ?? instance.description ?? '',
        calendar: calendarLabel,
        status: (instance.event?.status ?? instance.status ?? 'CONFIRMED').toUpperCase(),
    };
}

/**
 * Extract events from parsed iCal data within a date range.
 * Handles both single and recurring events via expandRecurringEvent.
 */
function extractEvents(parsed, from, to, calendarLabel) {
    const events = [];
    for (const [, entry] of Object.entries(parsed)) {
        if (entry.type !== 'VEVENT') continue;

        const instances = ical.expandRecurringEvent(entry, {
            from,
            to,
            expandOngoing: true,
        });

        for (const instance of instances) {
            events.push(normalizeEvent(instance, calendarLabel));
        }
    }
    return events;
}

/**
 * Fetch calendar events from multiple iCal URLs and return a merged, sorted list.
 *
 * @param {string[]} urls - iCal feed URLs
 * @param {string[]} labels - Human-readable labels for each URL
 * @param {object} options
 * @param {number} [options.daysAhead=14] - Days into the future to fetch
 * @param {string} [options.startDate] - ISO date string for range start (defaults to today)
 * @param {string} [options.endDate] - ISO date string for range end (overrides daysAhead)
 * @param {string} [options.search] - Case-insensitive text filter on title/description
 * @returns {Promise<{events: object[], warnings: string[]}>}
 */
async function fetchCalendarEvents(urls, labels, options = {}) {
    const { daysAhead = 14, startDate, endDate, search } = options;
    const timeZone = getCalendarTimezone();

    const from = startDate
        ? startOfDay(createZonedDay(startDate, timeZone))
        : getDefaultStartDate(new Date(), timeZone);
    const to = endDate ? endOfDay(createZonedDay(endDate, timeZone)) : addDays(from, daysAhead);

    const results = await Promise.allSettled(urls.map((url) => fetchIcal(url)));

    const allEvents = [];
    const warnings = [];

    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const label = labels[i] || `Calendar ${i + 1}`;
        if (result.status === 'fulfilled') {
            const events = extractEvents(result.value, from, to, label);
            allEvents.push(...events);
        } else {
            warnings.push(`Failed to fetch "${label}": ${result.reason?.message || 'Unknown error'}`);
        }
    }

    // Deduplicate by UID (keep first occurrence)
    const seen = new Set();
    const deduped = [];
    for (const event of allEvents) {
        const key = event.uid + '|' + event.start;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(event);
    }

    // Sort by start time
    deduped.sort((a, b) => new Date(a.start) - new Date(b.start));

    // Apply search filter
    let filtered = deduped;
    if (search) {
        const q = search.toLowerCase();
        filtered = deduped.filter((e) => e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));
    }

    return { events: filtered, warnings };
}

/**
 * Create an in-process MCP server that exposes a get_calendar_events tool.
 *
 * @param {string[]} urls - iCal feed URLs
 * @param {string[]} labels - Human-readable labels for each URL
 * @returns {McpSdkServerConfigWithInstance}
 */
function createCalendarServer(urls, labels) {
    return createSdkMcpServer({
        name: 'calendar',
        version: '1.0.0',
        tools: [
            tool(
                'get_calendar_events',
                'Fetch upcoming calendar events from all configured calendars. Returns a merged, sorted list of events.',
                {
                    days_ahead: z.number().optional().describe('Number of days into the future to fetch (default: 14)'),
                    start_date: z
                        .string()
                        .optional()
                        .describe('ISO date (YYYY-MM-DD) for range start. Defaults to today.'),
                    end_date: z
                        .string()
                        .optional()
                        .describe('ISO date (YYYY-MM-DD) for range end. Overrides days_ahead if provided.'),
                    search: z
                        .string()
                        .optional()
                        .describe('Case-insensitive text filter on event title and description'),
                },
                async (args) => {
                    const { events, warnings } = await fetchCalendarEvents(urls, labels, {
                        daysAhead: args.days_ahead,
                        startDate: args.start_date,
                        endDate: args.end_date,
                        search: args.search,
                    });

                    let text = JSON.stringify(events, null, 2);
                    if (warnings.length > 0) {
                        text += '\n\nWarnings:\n' + warnings.map((w) => `- ${w}`).join('\n');
                    }
                    if (events.length === 0 && warnings.length === 0) {
                        text = 'No events found in the requested date range.';
                    }

                    return { content: [{ type: 'text', text }] };
                },
            ),
        ],
    });
}

export {
    createCalendarServer,
    fetchCalendarEvents,
    fetchIcal,
    extractEvents,
    normalizeEvent,
};
