// dsh-dailyboard - host half.
//
// The browser half (client.js) owns every pixel. This module owns durable state
// and AI extraction, exposed over three same-origin, loopback-only POST routes
// under `/task-board`:
//
//   POST /task-board/load     {}                -> { data: Store, warning }
//   POST /task-board/save     { data: Store }   -> { savedAt }
//   POST /task-board/extract  { text, today }   -> { source, tasks, warning }
//
// State is one JSON document under `<DSH_HOME>/task-board/data.json`, written
// atomically (temp file + rename). Extraction asks the profile's default model
// for a strict JSON array and degrades to a deterministic local parser whenever
// the model is absent, slow, or malformed; the extract route never answers 500
// because of the model.
//
// The plugin imports nothing from the DSH SDK: every service is resolved from
// the cordis context at call time, and only Node builtins are imported here.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import tls from 'node:tls'
import { randomUUID } from 'node:crypto'

export const name = 'dsh-dailyboard'

const ROUTE_PREFIX = '/task-board'
const STORE_VERSION = 1

/** Hard request-body ceiling, matching the contract. */
const MAX_BODY_BYTES = 2 * 1024 * 1024
const MAX_TITLE_CHARS = 200
const MAX_NOTE_CHARS = 500
const MAX_EXTRACTED_TASKS = 20
const MAX_EXTRACTED_SUBTASKS = 50
const MAX_EXTRACT_INPUT_CHARS = 4000

// Defensive bounds for hostile or corrupt storage files. They are far beyond a
// human working set (ten years of plans, thousands of projects) and exist only
// so a hand-edited or malicious data.json cannot exhaust memory.
const MAX_PROJECTS = 2000
const MAX_DAILY_TASKS = 2000
const MAX_WEEKLY_TASKS = 500
const MAX_DONE_DATES = 3660
const MAX_PLAN_DAYS = 3660
const MAX_PLAN_ENTRIES_PER_DAY = 500

/** Abort the model stream after 40 s, and hard-settle the route a little later.
 *  A structured outline can make reasoning models spend most of a small token
 *  budget before the answer starts, so the old 25 s / 1200-token limits turned
 *  valid inputs into "empty reply" fallbacks. */
const AI_TIMEOUT_MS = 40000
const AI_HARD_TIMEOUT_MS = 45000
const AI_MAX_TOKENS = 4000

/** Colors offered to the model and used by the local fallback parser. */
const COLOR_PALETTE = Object.freeze([
  '#4C8DFF',
  '#F2994A',
  '#27AE60',
  '#9B51E0',
  '#EB5757',
  '#F2C94C',
  '#56CCF2',
  '#BB6BD9',
])

const COLOR_RE = /^#[0-9a-fA-F]{6}$/

class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

// --- small helpers -----------------------------------------------------------

function pad2(value) {
  return String(value).padStart(2, '0')
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function collapseText(value) {
  return String(value === undefined || value === null ? '' : value)
    // eslint-disable-next-line no-control-regex -- control characters never belong in a title
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanTitle(value) {
  if (typeof value !== 'string') return ''
  return collapseText(value).slice(0, MAX_TITLE_CHARS)
}

function cleanNote(value) {
  if (typeof value !== 'string') return ''
  return collapseText(value).slice(0, MAX_NOTE_CHARS)
}

/** Audience for "给他人": the id of an extra email recipient (legacy: partner/relative/other). */
const AUDIENCE_LABELS = { partner: '合作伙伴', relative: '亲属', other: '其他' }

function cleanAudience(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.length > 200) return ''
  // eslint-disable-next-line no-control-regex -- ids must stay JSON-key safe
  return /[\u0000-\u001f\u007f]/.test(trimmed) ? '' : trimmed
}

/** Accept an id only when it is a sane opaque string; otherwise mint one. */
function sanitizeId(value, prefix) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    // eslint-disable-next-line no-control-regex -- ids must stay JSON-key safe
    if (trimmed !== '' && trimmed.length <= 200 && !/[\u0000-\u001f\u007f]/.test(trimmed)) return trimmed
  }
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`
}

function describeError(error) {
  if (error && typeof error === 'object') {
    if (typeof error.code === 'string' && error.code !== '') return error.code
    if (typeof error.message === 'string' && error.message !== '') return error.message
  }
  return String(error)
}

// --- dates and times ---------------------------------------------------------

/** Build a local-midnight Date only when the three numbers are a real calendar day. */
function buildDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (year < 1970 || year > 3000 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Canonical `YYYY-MM-DD` for a valid date input, else null. */
function normalizeDateText(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text === '') return null
  let match = /^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})$/.exec(text)
  if (match === null) match = /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?$/.exec(text)
  if (match === null) return null
  const date = buildDate(Number(match[1]), Number(match[2]), Number(match[3]))
  return date === null ? null : formatDate(date)
}

function toDateFromNormalized(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Monday of the week containing `date` (Chinese calendar weeks start Monday). */
function mondayOfWeek(date) {
  return addDays(date, -((date.getDay() + 6) % 7))
}

/** Canonical `HH:mm` for a valid clock input, else null. */
function normalizeTimeText(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text === '') return null
  let hour
  let minute
  let match = /^(\d{1,2})\s*[:：]\s*(\d{1,2})$/.exec(text)
  if (match !== null) {
    hour = Number(match[1])
    minute = Number(match[2])
  } else {
    match = /^(\d{1,2})\s*(?:点|时|点钟)\s*(?:(半)|(\d{1,2})\s*分?)?$/.exec(text)
    if (match === null) return null
    hour = Number(match[1])
    if (match[2] !== undefined) minute = 30
    else if (match[3] !== undefined) minute = Number(match[3])
    else minute = 0
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
  return `${pad2(hour)}:${pad2(minute)}`
}

function timeToMinutes(value) {
  const normalized = normalizeTimeText(value)
  if (normalized === null) return null
  const [hour, minute] = normalized.split(':').map(Number)
  return hour * 60 + minute
}

function minutesToTimeText(minutes) {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`
}

/** Integer minutes from midnight in `0..1440`, else null. */
function normalizeMinutes(value) {
  let number = NaN
  if (typeof value === 'number') number = value
  else if (typeof value === 'string' && value.trim() !== '') number = Number(value.trim())
  if (!Number.isFinite(number) || !Number.isInteger(number)) return null
  if (number < 0 || number > 1440) return null
  return number
}

function normalizeColor(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return COLOR_RE.test(text) ? text : null
}

// --- store sanitizer ---------------------------------------------------------

function emptyStore() {
  return { version: STORE_VERSION, projects: [], dailyTasks: [], dayPlans: {}, recurringTasks: [] }
}

/** Canonicalize one task's subtasks; accepts strings or {title, done} objects. */
function sanitizeSubtasks(raw) {
  if (!Array.isArray(raw)) return []
  const items = []
  for (const entry of raw) {
    if (items.length >= MAX_EXTRACTED_SUBTASKS) break
    if (typeof entry === 'string') {
      const title = cleanTitle(entry)
      if (title !== '') items.push({ id: sanitizeId(null, 'st'), title, done: false })
      continue
    }
    if (!isPlainObject(entry)) continue
    const title = cleanTitle(entry.title)
    if (title === '') continue
    items.push({ id: sanitizeId(entry.id, 'st'), title, done: entry.done === true })
  }
  return items
}

/**
 * Canonicalize a long-term task's subtasks. Every entry is scoped to one date
 * (`date`), because a subtask added on a given day belongs to that day only;
 * legacy entries without a date fall back to the project start date.
 */
function sanitizeProjectSubtasks(raw, fallbackDate) {
  if (!Array.isArray(raw)) return []
  const items = []
  for (const entry of raw) {
    if (items.length >= MAX_EXTRACTED_SUBTASKS) break
    if (typeof entry === 'string') {
      const title = cleanTitle(entry)
      if (title !== '') items.push({ id: sanitizeId(null, 'st'), title, done: false, date: fallbackDate })
      continue
    }
    if (!isPlainObject(entry)) continue
    const title = cleanTitle(entry.title)
    if (title === '') continue
    const entryDate = normalizeDateText(entry.date)
    items.push({
      id: sanitizeId(entry.id, 'st'),
      title,
      done: entry.done === true,
      date: entryDate === null ? fallbackDate : entryDate,
    })
  }
  return items
}

/** Sorted, de-duplicated `YYYY-MM-DD` list, capped by MAX_DONE_DATES. */
function sanitizeDoneDates(raw) {
  const doneDates = []
  const seen = new Set()
  if (Array.isArray(raw)) {
    for (const value of raw) {
      if (doneDates.length >= MAX_DONE_DATES) break
      const date = normalizeDateText(value)
      if (date === null || seen.has(date)) continue
      seen.add(date)
      doneDates.push(date)
    }
  }
  doneDates.sort()
  return doneDates
}

function sanitizeProject(raw) {
  if (!isPlainObject(raw)) return null
  const title = cleanTitle(raw.title)
  if (title === '') return null
  const start = normalizeDateText(raw.start)
  const end = normalizeDateText(raw.end)
  if (start === null || end === null) return null
  let from = start
  let to = end
  if (toDateFromNormalized(from).getTime() > toDateFromNormalized(to).getTime()) {
    from = end
    to = start
  }
  return {
    id: sanitizeId(raw.id, 'p'),
    title,
    color: normalizeColor(raw.color),
    start: from,
    end: to,
    note: cleanNote(raw.note),
    audience: cleanAudience(raw.audience),
    done: raw.done === true,
    doneDates: sanitizeDoneDates(raw.doneDates),
    subtasks: sanitizeProjectSubtasks(raw.subtasks, from),
  }
}

function sanitizeDailyTask(raw) {
  if (!isPlainObject(raw)) return null
  const title = cleanTitle(raw.title)
  if (title === '') return null
  return { id: sanitizeId(raw.id, 'd'), title, audience: cleanAudience(raw.audience), doneDates: sanitizeDoneDates(raw.doneDates) }
}

/** Canonicalize a recurring task.
 *  mode "weekly": weekdays use 1 = Monday ... 7 = Sunday.
 *  mode "interval": every `intervalDays` days (1..365); weekdays are optional.
 *  `weeks` (1..52) is the number of calendar weeks from the start week. */
function sanitizeRecurringTask(raw) {
  if (!isPlainObject(raw)) return null
  const title = cleanTitle(raw.title)
  if (title === '') return null
  const startDate = normalizeDateText(raw.startDate)
  if (startDate === null) return null
  const mode = raw.mode === 'interval' ? 'interval' : 'weekly'
  const weekdays = []
  if (Array.isArray(raw.weekdays)) {
    for (const value of raw.weekdays) {
      if (!Number.isInteger(value) || value < 1 || value > 7) continue
      if (!weekdays.includes(value)) weekdays.push(value)
    }
  }
  weekdays.sort((left, right) => left - right)
  if (mode === 'weekly' && weekdays.length === 0) return null
  const rawWeeks = Math.round(Number(raw.weeks))
  const weeks = Number.isFinite(rawWeeks) ? Math.min(Math.max(rawWeeks, 1), 52) : 1
  const rawInterval = Math.round(Number(raw.intervalDays))
  const intervalDays = Number.isFinite(rawInterval) ? Math.min(Math.max(rawInterval, 1), 365) : 1
  return {
    id: sanitizeId(raw.id, 'r'),
    title,
    color: normalizeColor(raw.color),
    mode,
    startDate,
    weekdays,
    intervalDays,
    weeks,
    note: cleanNote(raw.note),
    audience: cleanAudience(raw.audience),
    doneDates: sanitizeDoneDates(raw.doneDates),
    subtasks: sanitizeProjectSubtasks(raw.subtasks, startDate),
  }
}

function sanitizePlanEntry(raw) {
  if (!isPlainObject(raw)) return null
  const title = cleanTitle(raw.title)
  if (title === '') return null
  const start = normalizeMinutes(raw.start)
  const end = normalizeMinutes(raw.end)
  if (start === null || end === null || start >= end) return null
  return {
    id: sanitizeId(raw.id, 's'),
    title,
    start,
    end,
    color: normalizeColor(raw.color),
    done: Boolean(raw.done),
    audience: cleanAudience(raw.audience),
    subtasks: sanitizeSubtasks(raw.subtasks),
  }
}

/**
 * Canonicalize an arbitrary value into the storage schema. Unknown fields are
 * dropped, invalid entries are dropped, and nothing here can throw.
 */
function sanitizeStore(raw) {
  const store = emptyStore()
  if (!isPlainObject(raw)) return store
  if (Array.isArray(raw.projects)) {
    for (const entry of raw.projects) {
      if (store.projects.length >= MAX_PROJECTS) break
      const project = sanitizeProject(entry)
      if (project !== null) store.projects.push(project)
    }
  }
  if (Array.isArray(raw.dailyTasks)) {
    for (const entry of raw.dailyTasks) {
      if (store.dailyTasks.length >= MAX_DAILY_TASKS) break
      const task = sanitizeDailyTask(entry)
      if (task !== null) store.dailyTasks.push(task)
    }
  }
  if (Array.isArray(raw.recurringTasks)) {
    for (const entry of raw.recurringTasks) {
      if (store.recurringTasks.length >= MAX_WEEKLY_TASKS) break
      const task = sanitizeRecurringTask(entry)
      if (task !== null) store.recurringTasks.push(task)
    }
  }
  if (isPlainObject(raw.dayPlans)) {
    // Canonicalize first: two differently written keys ("2026-1-5" and
    // "2026-01-05") are the same day, and their entries must merge instead of
    // one overwriting the other. Days are then emitted chronologically.
    const plans = new Map()
    for (const key of Object.keys(raw.dayPlans)) {
      const date = normalizeDateText(key)
      if (date === null) continue
      const rawEntries = raw.dayPlans[key]
      if (!Array.isArray(rawEntries)) continue
      const entries = plans.get(date) === undefined ? [] : plans.get(date)
      for (const entry of rawEntries) {
        if (entries.length >= MAX_PLAN_ENTRIES_PER_DAY) break
        const slot = sanitizePlanEntry(entry)
        if (slot !== null) entries.push(slot)
      }
      if (entries.length > 0) plans.set(date, entries)
    }
    for (const date of [...plans.keys()].sort()) {
      if (Object.keys(store.dayPlans).length >= MAX_PLAN_DAYS) break
      store.dayPlans[date] = plans.get(date)
    }
  }
  return store
}

// --- storage -----------------------------------------------------------------

function dshHomeDir() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

function dataFilePath() {
  return path.join(dshHomeDir(), 'task-board', 'data.json')
}

/** Read the store; a missing file is not a warning, corruption is. */
async function loadStoreData() {
  const file = dataFilePath()
  let raw
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return { data: emptyStore(), warning: null }
    return {
      data: emptyStore(),
      warning: `无法读取任务数据（${describeError(error)}），已返回空数据。`,
    }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      data: emptyStore(),
      warning: '任务数据文件已损坏，已返回空数据；原文件保持不变。',
    }
  }
  if (!isPlainObject(parsed)) {
    return { data: emptyStore(), warning: '任务数据格式无法识别，已返回空数据。' }
  }
  return { data: sanitizeStore(parsed), warning: null }
}

/** Sanitize and write atomically (temp file in the same directory + rename). */
async function saveStoreData(rawData) {
  const store = sanitizeStore(rawData)
  const file = dataFilePath()
  const dir = path.dirname(file)
  const temp = path.join(dir, `.data-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}.tmp`)
  const payload = `${JSON.stringify(store, null, 2)}\n`
  try {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(temp, payload, { encoding: 'utf8', mode: 0o600 })
    try {
      await fs.rename(temp, file)
    } catch {
      // Some Windows filesystems refuse to replace an open target; retry once
      // after removing the old file. The temp write already finished, so the
      // window where no data file exists is as small as this platform allows.
      try {
        await fs.rm(file, { force: true })
      } catch {
        // the rename below reports the real failure
      }
      await fs.rename(temp, file)
    }
  } catch (error) {
    try {
      await fs.rm(temp, { force: true })
    } catch {
      // best effort cleanup only
    }
    throw new HttpError(500, 'write-failed', `保存任务数据失败：${describeError(error)}`)
  }
  return { savedAt: new Date().toISOString() }
}

// --- http helpers ------------------------------------------------------------

function isLoopbackAddress(address) {
  if (typeof address !== 'string' || address === '') return false
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address.startsWith('127.')
}

function isLocalHostHeader(host) {
  if (typeof host !== 'string' || host === '') return false
  let name = host.trim().toLowerCase()
  if (name.startsWith('[')) {
    const end = name.indexOf(']')
    name = end === -1 ? name : name.slice(1, end)
  } else {
    const colon = name.indexOf(':')
    if (colon !== -1) name = name.slice(0, colon)
  }
  return name === 'localhost' || name === '127.0.0.1' || name === '::1'
}

function sendJson(res, status, body) {
  if (res.headersSent) {
    try {
      res.end()
    } catch {
      // the socket is already gone
    }
    return
  }
  let payload
  try {
    payload = JSON.stringify(body)
  } catch {
    payload = JSON.stringify({ ok: false, code: 'internal', error: 'response could not be serialized' })
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** Read the whole request body, rejecting anything over the contract limit. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        settled = true
        reject(new HttpError(413, 'too-large', 'request body is larger than 2 MB'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
    req.on('aborted', () => {
      if (settled) return
      settled = true
      reject(new Error('request aborted'))
    })
  })
}

async function readJsonBody(req) {
  const raw = await readBody(req)
  if (raw.trim() === '') return {}
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'invalid', 'malformed JSON body')
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new HttpError(400, 'invalid', 'JSON body must be an object')
  }
  return parsed
}

// Local-only endpoint: loopback socket, loopback Host header, and a same-origin
// check whenever the browser sends an Origin header.
function guard(req, res) {
  if (!isLoopbackAddress(req.socket && req.socket.remoteAddress)) {
    sendJson(res, 403, { ok: false, code: 'forbidden', error: 'loopback only' })
    return false
  }
  const host = req.headers.host
  if (!isLocalHostHeader(host)) {
    sendJson(res, 403, { ok: false, code: 'forbidden', error: 'unexpected host' })
    return false
  }
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== '') {
    let originHost = null
    try {
      originHost = new URL(origin).host
    } catch {
      originHost = null
    }
    const expected = String(host).trim().toLowerCase()
    if (originHost === null || originHost.toLowerCase() !== expected) {
      sendJson(res, 403, { ok: false, code: 'forbidden', error: 'cross-origin request' })
      return false
    }
  }
  return true
}

function routeHandler(run) {
  return async (req, res) => {
    if (!guard(req, res)) return
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, code: 'method', error: 'POST only' })
      return
    }
    try {
      const body = await readJsonBody(req)
      const value = await run(body)
      sendJson(res, 200, { ok: true, ...value })
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      const code = error instanceof HttpError ? error.code : 'internal'
      const message = error instanceof HttpError
        ? error.message
        : `internal error: ${describeError(error)}`
      sendJson(res, status, { ok: false, code, error: message })
    }
  }
}

// --- AI extraction -----------------------------------------------------------

const EXTRACT_SYSTEM_PROMPT = [
  '你是一个严格的任务信息提取器。把用户输入的中文文本转换为任务数组。',
  '只输出一个严格的 JSON 数组，不要输出 Markdown 代码围栏、解释、前后缀或任何其他文字。',
  '数组元素字段（不适用或未知的字段一律写 null）：',
  '{"kind":"project"|"daily"|"slot","title":string,"startDate":"YYYY-MM-DD"|null,"endDate":"YYYY-MM-DD"|null,"date":"YYYY-MM-DD"|null,"startTime":"HH:mm"|null,"endTime":"HH:mm"|null,"color":"#RRGGBB"|null,"note":string|null}',
  '规则：',
  '- 任务类别必须按以下顺序判定，命中即停：',
  '  1) 出现“每天/每日/天天”等重复线索 → daily，所有日期与时间字段为 null。',
  '  2) 出现明确的起止日期或日期范围（如“10月12日到10月23日”“下周一至周五”“10月20日—25日”）→ project，startDate/endDate 为该范围。',
  '  3) 出现开始与结束钟点（如“14:00-15:30”“下午3点到4点”）→ slot，date 取文中日期，没有就用 today。',
  '  4) 只出现一个日期、没有钟点 → project，startDate=endDate=该日期（当天任务）。',
  '  5) 完全没有日期、时间或“每天”线索 → project，startDate=endDate=today（当天任务）；不要丢弃，也不要输出空数组。',
  '- project：必须给出 startDate 与 endDate（end >= start）；单日任务用 startDate=endDate。',
  '- daily：每天重复的日常任务。',
  '- slot：某一天的定时安排，必须给出 date、startTime、endTime（start < end）。',
  '- title 用简洁中文，去掉日期、时间与连接词，最多 200 字，不能为空。',
  '- 以用户消息中给出的 today（YYYY-MM-DD）为基准解析相对日期：今天/明天/后天、星期X、下周一、本月底、下周等；文中已带年份的日期保持不变。',
  '- 如果输入是一份缩进清单（第一行常是“周一 / 明天 / 10月20日”这类日期标题，后面是缩进或带 - / 序号 的条目）：先解析标题里的日期，再把清单中每条**顶层**子项各自生成一个 project（startDate=endDate=该日期）；父级链路写入 note；标题行本身不生成任务。',
  '- 缩进的行是“上一条任务”的子任务：不要为它单独生成任务，把它放进上一条任务（或最近的上级任务）的 subtasks 数组（元素 {"title":string,"done":boolean}），保持原始顺序；最多 50 条。没有子任务时 subtasks 为 null。',
  '- 清单里没有日期标题也没有具体日期时，用 today 作为这些任务的日期。',
  '- 不要漏掉清单里的任何一条子项；清单内任务保持输入顺序。',
  `- color 只能从调色板中选择：${COLOR_PALETTE.join(' ')}；不确定时用 null。`,
  `- 最多输出 ${MAX_EXTRACTED_TASKS} 个任务；若文本中没有任何任务，输出 []。`,
].join('\n')

function buildExtractUserText(text, today) {
  return `today: ${today}\n\n用户文本：\n${text}`
}

/**
 * Consume one model stream, collecting text deltas. The soft 40 s timer aborts
 * the call; the hard timer settles the promise even if the provider ignores the
 * abort, so the route always answers.
 */
function collectModelReply(llm, request) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController()
    let settled = false
    let text = ''
    let finishKind = null
    let softTimer
    let hardTimer
    const settle = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(softTimer)
      clearTimeout(hardTimer)
      try {
        controller.abort()
      } catch {
        // already aborted
      }
      if (error) reject(error)
      else resolve(value)
    }
    softTimer = setTimeout(() => {
      try {
        controller.abort()
      } catch {
        // already aborted
      }
    }, AI_TIMEOUT_MS)
    hardTimer = setTimeout(() => settle(new Error('AI 提取超时')), AI_HARD_TIMEOUT_MS)
    const consume = async () => {
      try {
        const stream = llm.stream({ ...request, signal: controller.signal })
        for await (const chunk of stream) {
          if (chunk === null || typeof chunk !== 'object') continue
          if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
            text += chunk.text
          } else if (chunk.type === 'finish') {
            const kind = chunk.reason && chunk.reason.kind
            if (kind === 'error' || kind === 'aborted') {
              throw new Error(`model stream finished with ${String(kind)}`)
            }
            finishKind = kind
          }
        }
        if (finishKind === 'max-tokens') {
          throw new Error('模型输出达到 token 上限被截断，请重试或把输入拆短')
        }
        if (text.trim() === '') throw new Error('模型返回了空内容')
        settle(null, text)
      } catch (error) {
        settle(new Error(`AI 提取失败：${describeError(error)}`))
      }
    }
    consume()
  })
}

function tryJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** First balanced `[...]` slice of the reply text, string-aware. */
function extractBalancedArray(text) {
  const start = text.indexOf('[')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '[') depth += 1
    else if (char === ']') {
      depth -= 1
      if (depth === 0) return text.slice(start, index + 1)
    }
  }
  return null
}

/** Parse the model reply as a JSON array, tolerating code fences and prose. */
function parseJsonArray(reply) {
  let text = typeof reply === 'string' ? reply : ''
  if (text.trim() === '') return null
  text = text.replace(/```[a-zA-Z]*\s*/g, ' ').replace(/```/g, ' ')
  const direct = tryJson(text.trim())
  if (Array.isArray(direct)) return direct
  const slice = extractBalancedArray(text)
  if (slice === null) return null
  const parsed = tryJson(slice)
  if (Array.isArray(parsed)) return parsed
  if (isPlainObject(parsed) && Array.isArray(parsed.tasks)) return parsed.tasks
  return null
}

/** Map a model-supplied kind string onto the three contract kinds. */
function normalizeKind(value) {
  if (typeof value !== 'string') return null
  const text = value.trim().toLowerCase()
  if (text === 'project' || text === 'long-term' || text === 'longterm' || text === '项目' || text === '长期' || text === '长期项目') return 'project'
  if (text === 'daily' || text === 'everyday' || text === 'habit' || text === '日常' || text === '每日' || text === '每天') return 'daily'
  if (text === 'slot' || text === 'timed' || text === 'timeblock' || text === '日程' || text === '时间块' || text === '当天安排') return 'slot'
  return null
}

/** Canonicalize the model-supplied subtask list; null when there is none. */
function normalizeExtractedSubtasks(raw) {
  if (!Array.isArray(raw)) return null
  const items = []
  for (const entry of raw) {
    if (items.length >= MAX_EXTRACTED_SUBTASKS) break
    let title = ''
    let done = false
    if (typeof entry === 'string') {
      title = cleanTitle(entry)
    } else if (isPlainObject(entry)) {
      title = cleanTitle(entry.title)
      done = entry.done === true
    }
    if (title === '') continue
    items.push({ title, done })
  }
  return items.length > 0 ? items : null
}

/**
 * Validate and canonicalize one extracted task. Returns null when the entry
 * cannot satisfy its kind's required fields.
 */
function normalizeExtractedTask(raw) {
  if (!isPlainObject(raw)) return null
  const title = cleanTitle(raw.title)
  if (title === '') return null
  const color = normalizeColor(raw.color)
  const noteText = cleanNote(raw.note)
  const note = noteText === '' ? null : noteText
  const subtasks = normalizeExtractedSubtasks(raw.subtasks)
  const startDate = normalizeDateText(raw.startDate)
  const endDate = normalizeDateText(raw.endDate)
  const date = normalizeDateText(raw.date)
  const startTime = normalizeTimeText(raw.startTime)
  const endTime = normalizeTimeText(raw.endTime)
  let kind = normalizeKind(raw.kind)
  if (kind === null) {
    if (startDate !== null || endDate !== null) kind = 'project'
    else if (date !== null && startTime !== null && endTime !== null) kind = 'slot'
    else return null
  }
  if (kind === 'project') {
    if (startDate === null || endDate === null) return null
    let from = startDate
    let to = endDate
    if (toDateFromNormalized(from).getTime() > toDateFromNormalized(to).getTime()) {
      from = endDate
      to = startDate
    }
    return {
      kind,
      title,
      startDate: from,
      endDate: to,
      date: null,
      startTime: null,
      endTime: null,
      color,
      note,
      subtasks,
    }
  }
  if (kind === 'daily') {
    return {
      kind,
      title,
      startDate: null,
      endDate: null,
      date: null,
      startTime: null,
      endTime: null,
      color,
      note,
      subtasks,
    }
  }
  if (date === null || startTime === null || endTime === null) return null
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) return null
  return {
    kind,
    title,
    startDate: null,
    endDate: null,
    date,
    startTime,
    endTime,
    color,
    note,
    subtasks,
  }
}

/** Ask the profile's default model for a strict JSON task array. Throws on any problem. */
async function extractWithAi(ctx, text, today) {
  const llm = ctx.get('llm')
  if (!llm || typeof llm.stream !== 'function') throw new Error('模型服务未就绪')
  let selection = null
  const defaultModel = ctx.get('agentDefaultModel')
  if (defaultModel && typeof defaultModel.currentSelection === 'function') {
    selection = defaultModel.currentSelection()
  }
  const provider = selection && typeof selection.provider === 'string' ? selection.provider : ''
  const model = selection && typeof selection.model === 'string' ? selection.model : ''
  if (provider === '' || model === '') throw new Error('未选择默认模型')
  const reply = await collectModelReply(llm, {
    provider,
    model,
    system: EXTRACT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [{ type: 'text', text: buildExtractUserText(text, today) }] }],
    maxTokens: AI_MAX_TOKENS,
    temperature: 0.1,
    purpose: 'session-title',
  })
  const parsed = parseJsonArray(reply)
  if (parsed === null) throw new Error('模型未返回 JSON 数组')
  const tasks = []
  for (const entry of parsed) {
    if (tasks.length >= MAX_EXTRACTED_TASKS) break
    const task = normalizeExtractedTask(entry)
    if (task !== null) tasks.push(task)
  }
  if (tasks.length === 0) throw new Error('模型回复中没有可用任务')
  return tasks
}

// --- deterministic fallback parser -------------------------------------------

const WEEKDAY_INDEX = Object.freeze({
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7,
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7,
})

const WEEK_OFFSETS = Object.freeze({ 下下: 2, 下: 1, 本: 0, 这: 0, 上上: -2, 上: -1 })

const REL_DAY_OFFSETS = new Map([
  ['今天', 0], ['今日', 0], ['当天', 0],
  ['明天', 1], ['明日', 1],
  ['后天', 2], ['大后天', 3],
  ['昨天', -1], ['昨日', -1], ['前天', -2],
])

// "天天" is a daily cue only when it is not the tail of a day word: the very
// common "今天天气" must not turn a weather remark into a habit.
const DAILY_RE = /每(?:一)?天|每日|每一天|(?<![今明昨后前当])天天/
const DAILY_STRIP_RE = /每(?:一)?天|每日|每一天|(?<![今明昨后前当])天天/g

const DATE_TOKEN_RE = new RegExp([
  '(?<iso>\\d{4}\\s*[-/.]\\s*\\d{1,2}\\s*[-/.]\\s*\\d{1,2})',
  '(?<cny>\\d{4}\\s*年\\s*\\d{1,2}\\s*月\\s*\\d{1,2}\\s*[日号]?)',
  '(?<md>\\d{1,2}\\s*月\\s*\\d{1,2}\\s*[日号]?)',
  '(?<dom>\\d{1,2}\\s*[日号])',
  '(?<week>(?<weekPrefix>下下|下|本|这|上上|上)?(?:个)?(?:周|星期|礼拜)(?<weekday>[一二三四五六日天1-7]))',
  // A bare `MM-DD` is a date only when it is not glued to a clock: in
  // "9:00-10:30" the "00-10" span must never be read as January 10th.
  '(?<mdslash>(?<![\\d:：])\\d{1,2}\\s*[-/.]\\s*\\d{1,2}(?![\\d:：]))',
  '(?<nd>\\d{1,3}\\s*天\\s*(?:之|以)?后)',
  '(?<rel>大后天|后天|明天|明日|今天|今日|当天|昨天|昨日|前天|下下周末|下周末|本周末|这周末|下下月底|下个月底|本月底|这个月底|月底|月末|下下个星期|下个星期|下星期|下下周|下周|下个周|本星期|这星期|本周|这周|上个星期|上星期|上周)',
].join('|'), 'g')

const CLOCK_TOKEN_RE = /(?:(上午|下午|中午|晚上|夜里|夜间|凌晨|早上|傍晚|清晨)\s*)?(\d{1,2})(?:\s*[:：]\s*(\d{1,2})|\s*(?:点|时|点钟)\s*(?:(半)|(\d{1,2})\s*分?)?)/g

/** Parse small Chinese or Arabic numerals up to 99. */
function parseSmallNumber(text) {
  const source = String(text === undefined || text === null ? '' : text).trim()
  if (source === '') return null
  if (/^\d+$/.test(source)) return Number(source)
  const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  const chars = [...source]
  if (!chars.every((char) => char === '十' || digits[char] !== undefined)) return null
  const tenIndex = chars.indexOf('十')
  if (tenIndex === -1) {
    let value = 0
    for (const char of chars) value = value * 10 + digits[char]
    return value
  }
  const high = tenIndex === 0 ? 1 : digits[chars[0]]
  if (high === undefined) return null
  const rest = chars.slice(tenIndex + 1)
  if (rest.length > 1) return null
  const low = rest.length === 0 ? 0 : digits[rest[0]]
  if (low === undefined) return null
  return high * 10 + low
}

function scanDateTokens(text) {
  const tokens = []
  DATE_TOKEN_RE.lastIndex = 0
  let match = DATE_TOKEN_RE.exec(text)
  while (match !== null) {
    const groups = match.groups || {}
    const token = { index: match.index, end: match.index + match[0].length, text: match[0] }
    if (groups.iso !== undefined) {
      const parts = groups.iso.split(/[-/.]/).map((part) => Number(part.trim()))
      token.kind = 'iso'
      token.year = parts[0]
      token.month = parts[1]
      token.day = parts[2]
    } else if (groups.cny !== undefined) {
      const matchCny = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/.exec(groups.cny)
      token.kind = 'cny'
      token.year = matchCny === null ? NaN : Number(matchCny[1])
      token.month = matchCny === null ? NaN : Number(matchCny[2])
      token.day = matchCny === null ? NaN : Number(matchCny[3])
    } else if (groups.md !== undefined) {
      const parts = groups.md.split('月')
      token.kind = 'md'
      token.month = Number(String(parts[0]).replace(/\s+/g, ''))
      token.day = Number(String(parts[1] === undefined ? '' : parts[1]).replace(/[日号\s]/g, ''))
    } else if (groups.dom !== undefined) {
      token.kind = 'dom'
      token.day = Number(String(groups.dom).replace(/[日号\s]/g, ''))
    } else if (groups.week !== undefined) {
      token.kind = 'week'
      token.weekOffset = groups.weekPrefix === undefined ? null : (WEEK_OFFSETS[groups.weekPrefix] === undefined ? null : WEEK_OFFSETS[groups.weekPrefix])
      token.weekday = WEEKDAY_INDEX[groups.weekday] === undefined ? null : WEEKDAY_INDEX[groups.weekday]
    } else if (groups.mdslash !== undefined) {
      const parts = groups.mdslash.split(/[-/.]/).map((part) => Number(part.trim()))
      token.kind = 'mdslash'
      token.month = parts[0]
      token.day = parts[1]
    } else if (groups.nd !== undefined) {
      token.kind = 'nd'
      token.days = parseSmallNumber(groups.nd.replace(/[天之以\s后]/g, ''))
    } else if (groups.rel !== undefined) {
      token.kind = 'rel'
      token.rel = groups.rel
    } else {
      token.kind = 'unknown'
    }
    tokens.push(token)
    if (match[0].length === 0) DATE_TOKEN_RE.lastIndex += 1
    match = DATE_TOKEN_RE.exec(text)
  }
  return tokens
}

function monthDayToDate(month, day, today) {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const todayStart = startOfDay(today).getTime()
  const date = buildDate(today.getFullYear(), month, day)
  if (date === null) return null
  if (date.getTime() < todayStart) {
    const next = buildDate(today.getFullYear() + 1, month, day)
    if (next !== null) return next
  }
  return date
}

function dayOfMonthToDate(day, today) {
  if (!Number.isInteger(day) || day < 1 || day > 31) return null
  const todayStart = startOfDay(today).getTime()
  let year = today.getFullYear()
  let month = today.getMonth() + 1
  let date = buildDate(year, month, day)
  if (date === null) return null
  if (date.getTime() < todayStart) {
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
    date = buildDate(year, month, day)
  }
  return date
}

function resolveRelativeDate(text, today) {
  if (REL_DAY_OFFSETS.has(text)) return addDays(today, REL_DAY_OFFSETS.get(text))
  const monday = mondayOfWeek(today)
  switch (text) {
    case '本月底':
    case '这个月底':
    case '月底':
    case '月末':
      return new Date(today.getFullYear(), today.getMonth() + 1, 0)
    case '下月底':
    case '下个月底':
      return new Date(today.getFullYear(), today.getMonth() + 2, 0)
    case '下下月底':
      return new Date(today.getFullYear(), today.getMonth() + 3, 0)
    case '本周末':
    case '这周末':
      return addDays(monday, 6)
    case '下周末':
      return addDays(monday, 13)
    case '下下周末':
      return addDays(monday, 20)
    case '本周':
    case '这周':
    case '本星期':
    case '这星期':
      return monday
    case '下周':
    case '下个周':
    case '下星期':
    case '下个星期':
      return addDays(monday, 7)
    case '下下周':
    case '下下个星期':
      return addDays(monday, 14)
    case '上周':
    case '上星期':
    case '上个星期':
      return addDays(monday, -7)
    default:
      return null
  }
}

function resolveDateToken(token, today, inheritedWeekOffset) {
  switch (token.kind) {
    case 'iso':
    case 'cny':
      return buildDate(token.year, token.month, token.day)
    case 'md':
    case 'mdslash':
      return monthDayToDate(token.month, token.day, today)
    case 'dom':
      return dayOfMonthToDate(token.day, today)
    case 'week': {
      if (token.weekday === null || token.weekday === undefined) return null
      const offset = token.weekOffset === null || token.weekOffset === undefined
        ? (inheritedWeekOffset === null || inheritedWeekOffset === undefined ? 0 : inheritedWeekOffset)
        : token.weekOffset
      return addDays(mondayOfWeek(today), offset * 7 + (token.weekday - 1))
    }
    case 'nd':
      if (!Number.isInteger(token.days) || token.days < 0 || token.days > 3650) return null
      return addDays(today, token.days)
    case 'rel':
      return resolveRelativeDate(token.rel, today)
    default:
      return null
  }
}

function resolveDateTokens(tokens, today) {
  const resolved = []
  let lastWeekOffset = null
  for (const token of tokens) {
    const inherited = token.kind === 'week' ? lastWeekOffset : null
    const date = resolveDateToken(token, today, inherited)
    if (token.kind === 'week' && token.weekOffset !== null && token.weekOffset !== undefined) lastWeekOffset = token.weekOffset
    if (date !== null) resolved.push({ token, date })
  }
  return resolved
}

function scanClockTokens(text) {
  const tokens = []
  CLOCK_TOKEN_RE.lastIndex = 0
  let match = CLOCK_TOKEN_RE.exec(text)
  while (match !== null) {
    tokens.push({
      index: match.index,
      end: match.index + match[0].length,
      text: match[0],
      period: match[1] === undefined ? '' : match[1],
      hour: Number(match[2]),
      colonMinute: match[3] === undefined ? null : Number(match[3]),
      half: match[4] !== undefined,
      pointMinute: match[5] === undefined ? null : Number(match[5]),
    })
    if (match[0].length === 0) CLOCK_TOKEN_RE.lastIndex += 1
    match = CLOCK_TOKEN_RE.exec(text)
  }
  return tokens
}

function clockTokenToMinutes(token) {
  let hour = token.hour
  let minute = 0
  if (token.colonMinute !== null && token.colonMinute !== undefined) minute = token.colonMinute
  else if (token.half) minute = 30
  else if (token.pointMinute !== null && token.pointMinute !== undefined) minute = token.pointMinute
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
  const period = token.period
  if (period === '中午') {
    if (hour >= 1 && hour <= 3) hour += 12
  } else if (period === '下午' || period === '傍晚' || period === '晚上' || period === '夜里' || period === '夜间') {
    if (hour < 12) hour += 12
  } else if (period === '凌晨' && hour === 12) {
    hour = 0
  }
  if (hour > 23) return null
  return hour * 60 + minute
}

const RANGE_SEPARATOR_RE = /(?:至|到|~|～|—|–|直到|-)/

const TITLE_FILLERS = new Set([
  '到', '至', '~', '～', '—', '–', '-', '，', '、', '；', '。', ':', '：', '从', '在', '于', '和', '与', '的', '了',
])

/** True when a fragment carries any date, time, or daily cue. */
function hasCue(text) {
  if (DAILY_RE.test(text)) return true
  if (scanDateTokens(text).length > 0) return true
  if (scanClockTokens(text).length > 0) return true
  return false
}

/**
 * Split free text into task-sized segments. Lines and Chinese full stops end a
 * segment; a comma separates two tasks only when the right-hand fragment starts
 * with its own date/time cue, otherwise the fragment is title continuation.
 */
function segmentText(text) {
  const segments = []
  const lines = String(text === undefined || text === null ? '' : text).split(/[\r\n]+/)
  for (const line of lines) {
    for (const clause of line.split(/[；;。]/)) {
      const content = clause.trim()
      if (content === '') continue
      const parts = content.split(/[，,]/)
      if (parts.length <= 1) {
        segments.push(content)
        continue
      }
      let pending = ''
      let lastOpen = false
      for (const part of parts) {
        const piece = part.trim()
        if (piece === '') continue
        if (hasCue(piece)) {
          segments.push(pending === '' ? piece : `${pending}，${piece}`)
          pending = ''
          lastOpen = true
        } else if (lastOpen && segments.length > 0 && pending === '') {
          segments[segments.length - 1] = `${segments[segments.length - 1]}，${piece}`
        } else {
          pending = pending === '' ? piece : `${pending}，${piece}`
          lastOpen = false
        }
      }
      if (pending !== '') segments.push(pending)
    }
  }
  return segments
}

/** Task title from a segment with every date/time/daily cue stripped off. */
function cleanHeuristicTitle(segment, dateTokens, clockTokens) {
  let text = segment
  const pieces = []
  for (const token of dateTokens) pieces.push(token.text)
  for (const token of clockTokens) pieces.push(token.text)
  pieces.sort((left, right) => right.length - left.length)
  for (const piece of pieces) {
    if (piece === '') continue
    text = text.split(piece).join(' ')
  }
  text = text.replace(DAILY_STRIP_RE, ' ')
  text = collapseText(text)
  text = text.replace(/^[\s\-*•·]+/, '')
  text = text.replace(/^\d+[.、)）]\s*/, '')
  text = text.replace(/^(?:和|与|在|于|从|到|至|是|把|将)\s*/, '')
  text = text.replace(/[，,、：:；;。~～—–\-→]+\s*/g, ' ')
  text = collapseText(text)
  const parts = text.split(' ').filter((part) => part !== '' && !TITLE_FILLERS.has(part))
  text = collapseText(parts.join(' '))
  text = text.replace(/^(?:和|与|在|于|从|到|至)\s*/, '')
  text = collapseText(text)
  text = text.replace(/(?:的|了)$/, '')
  text = collapseText(text)
  return text.slice(0, MAX_TITLE_CHARS)
}

function heuristicTask(kind, title, fields) {
  return {
    kind,
    title,
    startDate: null,
    endDate: null,
    date: null,
    startTime: null,
    endTime: null,
    color: null,
    note: null,
    subtasks: null,
    ...fields,
  }
}

/**
 * Outline fallback: an indented or bulleted list under a date/weekday heading
 * (the common "周一 + 缩进子项" paste) becomes one one-day project per content
 * line, with the parent chain kept in `note` and a checkbox marker treated as
 * completed. Returns [] when the text is not outline-shaped.
 */
function heuristicOutlineExtract(text, today) {
  const rawLines = String(text === undefined || text === null ? '' : text).split(/\r?\n/)
  const lines = []
  let hasIndent = false
  let hasBullet = false
  for (const raw of rawLines) {
    if (/^[\t ]+\S/.test(raw)) hasIndent = true
    if (/^\s*(?:[-*•·]|\d+[.、)）])\s+\S/.test(raw)) hasBullet = true
    const indent = (raw.match(/^[\t ]*/) || [''])[0].replace(/\t/g, '    ').length
    let content = raw.trim()
    if (content === '') continue
    const checked = /^(?:\[[xX]\]|☑|✅|✓)/.test(content)
    content = content
      .replace(/^\d+[.、)）]\s*/, '')
      .replace(/^[-*•·]\s+/, '')
      .replace(/^(?:\[[ xX]\]\s*|☐\s*|☑\s*|✅\s*|✓\s*)/, '')
      .trim()
    if (content === '') continue
    lines.push({ content, indent, checked })
  }
  if (lines.length < 2) return []

  // A line that is only a date/weekday resolves the list's base date.
  let baseDate = null
  let startIndex = 0
  for (let index = 0; index < Math.min(lines.length, 3); index += 1) {
    const tokens = scanDateTokens(lines[index].content)
    if (tokens.length === 0) continue
    const rest = cleanHeuristicTitle(lines[index].content, tokens, scanClockTokens(lines[index].content))
    if (rest !== '') continue
    const resolved = resolveDateTokens(tokens, today)
    if (resolved.length === 0) continue
    baseDate = resolved[0].date
    startIndex = index + 1
    break
  }
  if (baseDate === null && !hasIndent && !hasBullet) return []

  const tasks = []
  let current = null
  let baseIndent = null
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index]
    if (baseIndent === null) baseIndent = line.indent
    const ownTokens = scanDateTokens(line.content)
    const ownResolved = resolveDateTokens(ownTokens, today)
    const day = ownResolved.length > 0 ? ownResolved[0].date : (baseDate === null ? today : baseDate)
    // Indented lines are subtasks of the current top-level task; their order is
    // the input order and is never reorderable.
    if (line.indent > baseIndent && current !== null) {
      const subtasks = current.subtasks === null ? [] : current.subtasks
      subtasks.push({ title: line.content.slice(0, MAX_TITLE_CHARS), done: line.checked })
      current.subtasks = subtasks
      continue
    }
    current = heuristicTask('project', line.content.slice(0, MAX_TITLE_CHARS), {
      startDate: formatDate(day),
      endDate: formatDate(day),
      subtasks: null,
    })
    tasks.push(current)
    if (tasks.length >= MAX_EXTRACTED_TASKS) break
  }
  return tasks
}

/** Deterministic extraction for Chinese task text; never throws. */
function heuristicExtract(text, todayText) {
  const today = toDateFromNormalized(todayText)
  const outline = heuristicOutlineExtract(text, today)
  if (outline.length > 0) return colorizeHeuristicTasks(outline)
  const tasks = []
  for (const segment of segmentText(text)) {
    if (tasks.length >= MAX_EXTRACTED_TASKS) break
    const dateTokens = scanDateTokens(segment)
    const clockTokens = scanClockTokens(segment)
    const resolved = resolveDateTokens(dateTokens, today)
    const title = cleanHeuristicTitle(segment, dateTokens, clockTokens)
    const clockMinutes = clockTokens
      .map((token) => ({ token, minutes: clockTokenToMinutes(token) }))
      .filter((entry) => entry.minutes !== null)

    // A daily cue wins: the habit repeats, not the calendar slot it mentions.
    if (DAILY_RE.test(segment)) {
      tasks.push(heuristicTask('daily', title === '' ? '日常任务' : title, {}))
      continue
    }

    // A two-date range such as "10月12日到10月23日" or "下周一至周五".
    if (resolved.length >= 2) {
      const gap = segment.slice(resolved[0].token.end, resolved[1].token.index)
      if (RANGE_SEPARATOR_RE.test(gap)) {
        let from = resolved[0].date
        let to = resolved[1].date
        if (from.getTime() > to.getTime()) {
          const swap = from
          from = to
          to = swap
        }
        tasks.push(heuristicTask('project', title === '' ? '项目' : title, {
          startDate: formatDate(from),
          endDate: formatDate(to),
        }))
        continue
      }
    }

    // Clock pairs become timed blocks on the one resolved date (today if absent).
    if (clockMinutes.length >= 2) {
      const slotDate = resolved.length > 0 ? resolved[0].date : today
      let produced = false
      for (let index = 0; index + 1 < clockMinutes.length; index += 2) {
        const start = clockMinutes[index].minutes
        let end = clockMinutes[index + 1].minutes
        if (end <= start) {
          const shifted = end + 720
          if (shifted > start && shifted <= 1440) end = shifted
          else continue
        }
        tasks.push(heuristicTask('slot', title === '' ? '日程安排' : title, {
          date: formatDate(slotDate),
          startTime: minutesToTimeText(start),
          endTime: minutesToTimeText(end),
        }))
        produced = true
        if (tasks.length >= MAX_EXTRACTED_TASKS) break
      }
      if (produced) continue
    }

    // One resolved date without a clock pair: a one-day project.
    if (resolved.length >= 1) {
      const day = formatDate(resolved[0].date)
      tasks.push(heuristicTask('project', title === '' ? '项目' : title, {
        startDate: day,
        endDate: day,
      }))
      continue
    }

    // No date, no clock, no daily cue: a plain task belongs to today, per the
    // "anything without an explicit deadline is a task for today" rule.
    if (title !== '') {
      tasks.push(heuristicTask('project', title, {
        startDate: formatDate(today),
        endDate: formatDate(today),
      }))
    }
  }
  return colorizeHeuristicTasks(tasks)
}

/** Give fallback tasks the same palette the model is offered. */
function colorizeHeuristicTasks(tasks) {
  return tasks.map((task, index) => {
    if (task.kind === 'daily' || task.color !== null) return task
    return { ...task, color: COLOR_PALETTE[index % COLOR_PALETTE.length] }
  })
}

/** Full extraction pipeline: model first, deterministic fallback always available. */
async function extractTasks(ctx, text, today) {
  let aiFailure = null
  try {
    const tasks = await extractWithAi(ctx, text, today)
    return { source: 'ai', tasks, warning: null }
  } catch (error) {
    aiFailure = describeError(error).slice(0, 160)
    ctx.logger?.warn?.('dsh-dailyboard: AI extraction unavailable: %s', aiFailure)
  }
  try {
    const tasks = heuristicExtract(text, today)
    const reason = aiFailure === null ? '' : `（AI 失败原因：${aiFailure}）`
    if (tasks.length > 0) {
      return {
        source: 'fallback',
        tasks,
        warning: `AI 提取暂不可用${reason}，已按本地规则识别任务，请核对后保存。`,
      }
    }
    return {
      source: 'fallback',
      tasks: [],
      warning: `未能从文本中识别出任务${reason}；请补充日期、时间或“每天”等线索。`,
    }
  } catch (error) {
    ctx.logger?.warn?.('dsh-dailyboard: heuristic extraction failed: %s', describeError(error))
    return { source: 'fallback', tasks: [], warning: '任务提取失败，请手动添加。' }
  }
}

// --- daily email reminder ----------------------------------------------------

const REMINDER_DEFAULTS = {
  enabled: false,
  to: '',
  user: '',
  pass: '',
  smtpHost: 'smtp.qq.com',
  smtpPort: 465,
  secure: 'tls',
  time: '08:00',
  lastSentDate: '',
  extraRecipients: [],
}

function reminderSettingsPath() {
  return path.join(dshHomeDir(), 'task-board', 'settings.json')
}

function isEmailAddress(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/** Extra recipients: each has an address, a note and its own send time. */
function cleanExtraRecipients(raw) {
  const list = []
  if (!Array.isArray(raw)) return list
  for (const entry of raw) {
    if (list.length >= 10) break
    if (!isPlainObject(entry)) continue
    const email = typeof entry.email === 'string' ? entry.email.trim().slice(0, 200) : ''
    if (!isEmailAddress(email)) continue
    const note = typeof entry.note === 'string' ? entry.note.trim().slice(0, 60) : ''
    const time = typeof entry.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time) ? entry.time : '08:00'
    const lastSentDate = normalizeDateText(entry.lastSentDate)
    list.push({
      id: sanitizeId(entry.id, 'x'),
      email,
      note,
      time,
      lastSentDate: lastSentDate === null ? '' : lastSentDate,
    })
  }
  return list
}

function cleanReminderSettings(raw) {
  const value = isPlainObject(raw) ? raw : {}
  const time = typeof value.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)
    ? value.time
    : REMINDER_DEFAULTS.time
  const port = Number.isInteger(value.smtpPort) && value.smtpPort > 0 && value.smtpPort < 65536
    ? value.smtpPort
    : REMINDER_DEFAULTS.smtpPort
  const host = typeof value.smtpHost === 'string' && value.smtpHost.trim() !== ''
    ? value.smtpHost.trim().slice(0, 200)
    : REMINDER_DEFAULTS.smtpHost
  const lastSentDate = normalizeDateText(value.lastSentDate)
  const secure = value.secure === 'starttls' ? 'starttls' : (value.secure === 'tls' ? 'tls' : (port === 465 ? 'tls' : 'starttls'))
  return {
    enabled: value.enabled === true,
    to: typeof value.to === 'string' ? value.to.trim().slice(0, 200) : '',
    user: typeof value.user === 'string' ? value.user.trim().slice(0, 200) : '',
    pass: typeof value.pass === 'string' ? value.pass : '',
    smtpHost: host,
    smtpPort: port,
    secure,
    time,
    lastSentDate: lastSentDate === null ? '' : lastSentDate,
    extraRecipients: cleanExtraRecipients(value.extraRecipients),
  }
}

async function loadReminderSettings() {
  try {
    const text = await fs.readFile(reminderSettingsPath(), 'utf8')
    return cleanReminderSettings(JSON.parse(text))
  } catch {
    return cleanReminderSettings(null)
  }
}

async function saveReminderSettings(settings) {
  const file = reminderSettingsPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.tmp`
  await fs.writeFile(temp, JSON.stringify(cleanReminderSettings(settings), null, 2), 'utf8')
  await fs.rename(temp, file)
}

function publicReminderSettings(settings) {
  return {
    enabled: settings.enabled,
    to: settings.to,
    user: settings.user,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    secure: settings.secure,
    time: settings.time,
    lastSentDate: settings.lastSentDate,
    extraRecipients: settings.extraRecipients,
    hasPass: settings.pass !== '',
  }
}

function addDaysKey(key, days) {
  const date = toDateFromNormalized(key)
  date.setDate(date.getDate() + days)
  return formatDate(date)
}

function startOfWeekKey(key) {
  const date = toDateFromNormalized(key)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return formatDate(date)
}

/** Occurrence dates of a recurring task (mirrors the client-side rules). */
function recurringDatesFor(task) {
  const dates = []
  if (!isPlainObject(task) || typeof task.startDate !== 'string') return dates
  const startDate = normalizeDateText(task.startDate)
  if (startDate === null) return dates
  const weeks = Math.min(Math.max(Math.round(Number(task.weeks) || 1), 1), 52)
  const windowEnd = addDaysKey(startOfWeekKey(startDate), weeks * 7)
  if (task.mode === 'interval') {
    const step = Math.min(Math.max(Math.round(Number(task.intervalDays) || 1), 1), 365)
    let date = startDate
    let guard = 0
    while (date < windowEnd && guard < 400) {
      dates.push(date)
      date = addDaysKey(date, step)
      guard += 1
    }
    return dates
  }
  const weekdays = Array.isArray(task.weekdays) ? task.weekdays.filter((value) => Number.isInteger(value) && value >= 1 && value <= 7) : []
  for (let index = 0; index < weeks; index += 1) {
    const weekStart = addDaysKey(startOfWeekKey(startDate), index * 7)
    for (const weekday of weekdays) {
      const date = addDaysKey(weekStart, weekday - 1)
      if (date >= startDate) dates.push(date)
    }
  }
  return dates.sort()
}

function clockText(minutes) {
  const clamped = Math.min(Math.max(Math.round(Number(minutes) || 0), 0), 1439)
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

/** Build the daily digest email from the stored task data. */
async function buildDigestEmail() {
  const { data } = await loadStoreData()
  const now = new Date()
  const today = formatDate(now)
  const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const heading = `今日任务提醒 · ${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekdayNames[now.getDay()]}`
  const lines = [heading, '']
  let total = 0
  let doneCount = 0
  const subtasksOn = (task) => (Array.isArray(task.subtasks) ? task.subtasks.filter((sub) => sub.date === today) : [])

  const slots = data.dayPlans && Array.isArray(data.dayPlans[today]) ? data.dayPlans[today].slice().sort((a, b) => a.start - b.start) : []
  lines.push(`【当天任务】${slots.length === 0 ? '无' : ''}`)
  for (const slot of slots) {
    total += 1
    if (slot.done) doneCount += 1
    const results = subtasksOn(slot).map((sub) => sub.title)
    lines.push(`- ${clockText(slot.start)} ${slot.title}${results.length > 0 ? `（${results.join('、')}）` : ''}${slot.done ? ' ✅' : ''}`)
  }

  const recurring = (data.recurringTasks || []).filter((task) => recurringDatesFor(task).includes(today))
  lines.push('', `【周期任务】${recurring.length === 0 ? '无' : ''}`)
  for (const task of recurring) {
    total += 1
    const done = Array.isArray(task.doneDates) && task.doneDates.includes(today)
    if (done) doneCount += 1
    const results = subtasksOn(task).map((sub) => sub.title)
    lines.push(`- ${task.title}${results.length > 0 ? `：${results.join('、')}` : ''}${done ? ' ✅' : ''}`)
  }

  const projects = (data.projects || []).filter((project) => project.start <= today && today <= project.end)
  lines.push('', `【长期任务】${projects.length === 0 ? '无' : ''}`)
  for (const project of projects) {
    total += 1
    const done = Array.isArray(project.doneDates) && project.doneDates.includes(today)
    if (done) doneCount += 1
    const results = subtasksOn(project).map((sub) => sub.title)
    lines.push(`- ${project.title}（${project.start} → ${project.end}）${results.length > 0 ? `：${results.join('、')}` : ''}${done ? ' ✅' : ''}`)
  }

  lines.push('', `【日常任务】${(data.dailyTasks || []).length === 0 ? '无' : ''}`)
  for (const task of data.dailyTasks || []) {
    const done = Array.isArray(task.doneDates) && task.doneDates.includes(today)
    lines.push(`- ${task.title}${done ? ' ✅' : ''}`)
  }

  const audienceItems = []
  const pushAudience = (task) => {
    if (cleanAudience(task.audience) !== '') audienceItems.push(task)
  }
  slots.forEach(pushAudience)
  recurring.forEach(pushAudience)
  projects.forEach(pushAudience)
  for (const task of data.dailyTasks || []) pushAudience(task)
  if (audienceItems.length > 0) {
    const reminderSettings = await loadReminderSettings()
    const recipientLabels = new Map()
    for (const recipient of reminderSettings.extraRecipients || []) {
      recipientLabels.set(recipient.id, recipient.note !== '' ? `${recipient.note}（${recipient.email}）` : recipient.email)
    }
    const audienceLabel = (task) => {
      const value = cleanAudience(task.audience)
      if (recipientLabels.has(value)) return recipientLabels.get(value)
      if (AUDIENCE_LABELS[value]) return AUDIENCE_LABELS[value]
      return '他人'
    }
    lines.push('', '【给他人（合作伙伴 / 亲属等）】')
    for (const task of audienceItems) {
      lines.push(`- ${audienceLabel(task)}：${task.title}`)
    }
  }

  lines.push('', `—— 今日进度：已完成 ${doneCount} / ${total}`)
  lines.push('（由 DSH 任务面板自动发送）')
  return {
    subject: `今日任务提醒（${now.getMonth() + 1}/${now.getDate()}）`,
    text: lines.join('\n'),
  }
}

/** Build a plain-text UTF-8 email message (base64 body, RFC 2047 subject). */
function buildMailMessage(settings, subject, text) {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
  const body = Buffer.from(text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n')
  const headers = [
    `From: =?UTF-8?B?${Buffer.from('任务提醒', 'utf8').toString('base64')}?= <${settings.user}>`,
    `To: <${settings.to}>`,
    `Subject: ${encodedSubject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@qq.com>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ]
  return `${headers.join('\r\n')}\r\n\r\n${body}\r\n.\r\n`
}

/** Minimal SMTP client (implicit TLS or STARTTLS + AUTH LOGIN), dependency free. */
function smtpSend(settings, subject, text) {
  return new Promise((resolve, reject) => {
    const implicit = settings.secure !== 'starttls'
    let settled = false
    let buffer = ''
    let pending = null
    let socket = null
    const timer = setTimeout(() => finish(new Error('SMTP 连接超时')), 25000)
    function finish(error) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        if (socket !== null) socket.destroy()
      } catch {
        // already closed
      }
      if (error) reject(error)
      else resolve()
    }
    const tryResolve = () => {
      if (pending === null) return
      const match = /(?:^|\r?\n)(\d{3}) [^\r\n]*(?:\r?\n|$)/.exec(buffer)
      if (match === null) return
      const end = match.index + match[0].length
      const response = { code: Number(match[1]), raw: buffer.slice(0, end) }
      buffer = buffer.slice(end)
      const waiter = pending
      pending = null
      waiter(response)
    }
    const onData = (chunk) => {
      buffer += chunk
      tryResolve()
    }
    const attach = (stream) => {
      socket = stream
      stream.setEncoding('utf8')
      stream.on('data', onData)
      stream.on('error', (error) => finish(error))
      stream.on('close', () => finish(new Error('SMTP 连接被关闭')))
    }
    const next = () => new Promise((resolveResponse) => {
      pending = resolveResponse
      tryResolve()
    })
    const command = async (line, expected) => {
      socket.write(`${line}\r\n`)
      const response = await next()
      if (expected !== undefined && !expected.includes(response.code)) {
        throw new Error(`SMTP 命令失败（${line.split(' ')[0]}）：${response.code}`)
      }
      return response
    }
    const upgrade = () => new Promise((resolveUpgrade, rejectUpgrade) => {
      const plain = socket
      plain.removeListener('data', onData)
      plain.removeAllListeners('error')
      plain.removeAllListeners('close')
      const secured = tls.connect({ socket: plain, servername: settings.smtpHost }, () => {
        attach(secured)
        resolveUpgrade()
      })
      secured.once('error', (error) => rejectUpgrade(error))
    })
    const run = async () => {
      const greeting = await next()
      if (greeting.code !== 220) throw new Error(`SMTP 问候失败：${greeting.code}`)
      await command(`EHLO ${os.hostname() || 'localhost'}`, [250])
      if (!implicit) {
        await command('STARTTLS', [220])
        await upgrade()
        await command(`EHLO ${os.hostname() || 'localhost'}`, [250])
      }
      await command('AUTH LOGIN', [334])
      await command(Buffer.from(settings.user, 'utf8').toString('base64'), [334])
      await command(Buffer.from(settings.pass, 'utf8').toString('base64'), [235])
      await command(`MAIL FROM:<${settings.user}>`, [250])
      await command(`RCPT TO:<${settings.to}>`, [250, 251])
      await command('DATA', [354])
      socket.write(buildMailMessage(settings, subject, text))
      const stored = await next()
      if (stored.code !== 250) throw new Error(`SMTP 邮件被拒：${stored.code}`)
      try {
        await command('QUIT', [221])
      } catch {
        // the message is already accepted
      }
      finish(null)
    }
    if (implicit) {
      attach(tls.connect({ host: settings.smtpHost, port: settings.smtpPort, servername: settings.smtpHost }))
    } else {
      attach(net.connect({ host: settings.smtpHost, port: settings.smtpPort }))
    }
    run().catch((error) => finish(error))
  })
}

async function handleReminderLoad() {
  return { settings: publicReminderSettings(await loadReminderSettings()) }
}

async function handleReminderSave(body) {
  if (!isPlainObject(body) || !isPlainObject(body.settings)) {
    throw new HttpError(400, 'invalid', 'settings required')
  }
  const current = await loadReminderSettings()
  const incoming = cleanReminderSettings(body.settings)
  const next = { ...incoming, pass: incoming.pass === '' ? current.pass : incoming.pass }
  if (next.enabled) {
    if (!isEmailAddress(next.to)) throw new HttpError(400, 'invalid', '收件邮箱格式不正确')
    if (!isEmailAddress(next.user)) throw new HttpError(400, 'invalid', '发件邮箱格式不正确')
    if (next.pass === '') throw new HttpError(400, 'invalid', '请填写邮箱授权码/密码')
  }
  await saveReminderSettings(next)
  return { settings: publicReminderSettings(next) }
}

async function handleReminderTest(body) {
  const settings = await loadReminderSettings()
  const extraId = isPlainObject(body) && typeof body.extraId === 'string' ? body.extraId : ''
  const extra = extraId === '' ? null : (settings.extraRecipients.find((item) => item.id === extraId) || null)
  if (extraId !== '' && extra === null) throw new HttpError(400, 'invalid', '收件邮箱不存在')
  if (!isEmailAddress(settings.user) || settings.pass === '') {
    throw new HttpError(400, 'invalid', '请先保存有效的发件邮箱和授权码/密码')
  }
  const digest = await buildDigestEmail()
  const recipient = extra === null ? settings.to : extra.email
  if (!isEmailAddress(recipient)) throw new HttpError(400, 'invalid', '请先设置有效的收件邮箱')
  const prefix = extra !== null && extra.note !== '' ? `${extra.note} · ` : ''
  await smtpSend({ ...settings, to: recipient }, `${prefix}${digest.subject}（测试）`, digest.text)
  return { message: '测试邮件已发送，请检查收件箱（也可能在垃圾箱）' }
}

/** Check every 30 s while the host runs; send once per day after each configured time. */
function startReminderScheduler(ctx) {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const settings = await loadReminderSettings()
      if (!settings.enabled || !isEmailAddress(settings.user) || settings.pass === '') return
      const now = new Date()
      const today = formatDate(now)
      let changed = false
      const isDue = (timeText) => {
        const [hour, minute] = timeText.split(':').map(Number)
        const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0)
        return now.getTime() >= due.getTime()
      }
      const digest = await buildDigestEmail()
      if (isEmailAddress(settings.to) && settings.lastSentDate !== today && isDue(settings.time)) {
        await smtpSend(settings, digest.subject, digest.text)
        settings.lastSentDate = today
        changed = true
        ctx.logger?.info?.('dsh-dailyboard: daily reminder sent to %s', settings.to)
      }
      for (const extra of settings.extraRecipients) {
        if (extra.lastSentDate === today || !isDue(extra.time)) continue
        try {
          const prefix = extra.note !== '' ? `${extra.note} · ` : ''
          await smtpSend({ ...settings, to: extra.email }, `${prefix}${digest.subject}`, digest.text)
          extra.lastSentDate = today
          changed = true
          ctx.logger?.info?.('dsh-dailyboard: reminder sent to extra recipient %s', extra.email)
        } catch (error) {
          ctx.logger?.warn?.('dsh-dailyboard: extra reminder to %s failed: %s', extra.email, describeError(error))
        }
      }
      if (changed) await saveReminderSettings(settings)
    } catch (error) {
      ctx.logger?.warn?.('dsh-dailyboard: daily reminder failed: %s', describeError(error))
    } finally {
      running = false
    }
  }
  const timer = setInterval(() => {
    tick().catch(() => {})
  }, 30000)
  ctx.effect(() => () => clearInterval(timer), 'dsh-dailyboard: reminder scheduler')
  setTimeout(() => {
    tick().catch(() => {})
  }, 4000)
}

// --- route handlers ----------------------------------------------------------

async function handleLoad() {
  return loadStoreData()
}

async function handleSave(body) {
  if (!isPlainObject(body)) throw new HttpError(400, 'invalid', 'request body must be a JSON object')
  if (!isPlainObject(body.data)) throw new HttpError(400, 'invalid', 'data must be a JSON object')
  return saveStoreData(body.data)
}

async function handleExtract(ctx, body) {
  if (!isPlainObject(body)) throw new HttpError(400, 'invalid', 'request body must be a JSON object')
  const text = typeof body.text === 'string' ? body.text : ''
  if (text.trim() === '') throw new HttpError(400, 'invalid', 'text required')
  if (text.length > MAX_EXTRACT_INPUT_CHARS) {
    throw new HttpError(400, 'invalid', `text is longer than ${MAX_EXTRACT_INPUT_CHARS} characters`)
  }
  const normalizedToday = normalizeDateText(body.today)
  const today = normalizedToday === null ? formatDate(new Date()) : normalizedToday
  return extractTasks(ctx, text, today)
}

// --- plugin --------------------------------------------------------------

/**
 * Register the three routes on the web surface. Every route registration is a
 * cordis effect, so an unloading plugin unregisters its handlers.
 */
function registerRoutes(ctx, webServer, fiber) {
  const register = (routePath, run) => {
    fiber.effect(() => webServer.register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}${routePath}`,
      handler: routeHandler(run),
    }))
  }
  register('/load', () => handleLoad())
  register('/save', (body) => handleSave(body))
  register('/extract', (body) => handleExtract(ctx, body))
  register('/reminder/load', () => handleReminderLoad())
  register('/reminder/save', (body) => handleReminderSave(body))
  register('/reminder/test', (body) => handleReminderTest(body))
}

export function apply(ctx) {
  startReminderScheduler(ctx)
  const webServer = ctx.get('webServer')
  if (webServer) {
    registerRoutes(ctx, webServer, ctx)
  } else {
    // A non-web profile has no HTTP surface; register once one appears.
    ctx.inject(['webServer'], (sub) => registerRoutes(ctx, sub.webServer, sub))
  }
}
