export interface PRFile {
  path: string
  additions: number
  deletions: number
  status: "added" | "modified" | "deleted" | "renamed"
  patch?: string
}

export interface CodeLine {
  lineNumber: number
  content: string
  highlighted?: boolean
}

export interface ReviewComment {
  id: string
  type: "inline" | "general"
  severity: "blocking" | "suggestion" | "nit"
  path?: string
  line?: number
  patch?: string  // unified diff patch for this file — used by @pierre/diffs
  codeContext?: CodeLine[]
  body: string
  status: "pending" | "queued" | "dismissed" | "sent"
  resolved?: boolean
}

export interface PullRequest {
  id: string
  repoId: string
  number: number
  title: string
  repo: string
  author: string
  authorAvatar?: string
  branch: string
  baseBranch: string
  requestedAt: string
  reviewStatus: "awaiting" | "changes-requested" | "approved"
  unread: boolean
  reviewReady?: boolean
  reviewRequested?: boolean
  userReviewed?: boolean
  isReadyToMerge?: boolean
  additions: number
  deletions: number
  files: PRFile[]
  description: string
  url?: string
  agentId?: string
  checks?: Array<{ name: string; status: string; conclusion: string | null }>
}

export const mockFileDiffs: Record<string, string> = {
  "src/lib/csv.ts": `@@ -0,0 +1,98 @@
+import Papa from 'papaparse'
+import type { Device } from '@/types'
+
+const BATCH_SIZE = 100
+
+export interface ParsedRow {
+  id?: string
+  name: string
+  location: string
+  serial_number: string
+}
+
+export interface ImportResult {
+  success: boolean
+  row: ParsedRow
+  error?: string
+}
+
+export function parseCSV(file: File): Promise<ParsedRow[]> {
+  return new Promise((resolve, reject) => {
+    Papa.parse(file, {
+      header: true,
+      skipEmptyLines: true,
+      complete: (results) => resolve(results.data as ParsedRow[]),
+      error: reject,
+    })
+  })
+}
+
+export function validateRows(rows: ParsedRow[]): ParsedRow[] {
+  return rows.filter(r => r.name && r.serial_number)
+}
+
+function splitIntoChunks<T>(arr: T[], size: number): T[][] {
+  const chunks: T[][] = []
+  for (let i = 0; i < arr.length; i += size) {
+    chunks.push(arr.slice(i, i + size))
+  }
+  return chunks
+}
+
+export async function importDevices(file: File): Promise<ImportResult[]> {
+  const rows = await parseCSV(file)
+  const validated = validateRows(rows)
+  const chunks = splitIntoChunks(validated, BATCH_SIZE)
+  const results: ImportResult[] = []
+  for (const chunk of chunks) {
+    await importBatch(chunk)
+    results.push(...chunk.map(toResult))
+  }
+  return results
+}`,
  "src/components/DevicesTable.tsx": `@@ -145,12 +145,24 @@
+import { useDeviceImport } from '@/hooks/useDeviceImport'
+import { Button } from '@huxflux/ui'
+
-export function DevicesTable({ devices }: { devices: Device[] }) {
+export function DevicesTable({ devices, onImport }: Props) {
+  const { isImporting, progress, startImport } = useDeviceImport()
+
   return (
-    <div className="table-container">
+    <div className="flex flex-col gap-4">
+      <div className="flex items-center justify-between">
+        <h2>Devices</h2>
+        <Button onClick={() => document.getElementById('csv-input')?.click()}>
+          Import CSV
+        </Button>
+        <input id="csv-input" type="file" accept=".csv" className="hidden"
+          onChange={(e) => e.target.files && startImport(e.target.files[0])} />
+      </div>
+      {isImporting && (
+        <Progress value={(progress.done / progress.total) * 100} />
+      )}
       <table>`,
  "src/middleware/auth.ts": `@@ -50,18 +50,15 @@
-import { verifyLegacyToken } from './legacy'
-import { checkTokenBlacklist } from './blacklist'
 import { SessionLib } from '@minut/session'

 export function authMiddleware(req, res, next) {
   try {
     const token = extractToken(req.headers)
     if (!token) return next(new UnauthorizedError())
-    const legacy = verifyLegacyToken(token)
-    if (legacy) {
-      if (checkTokenBlacklist(legacy.id)) return next(new UnauthorizedError())
-      req.user = legacy.user
-      return next()
-    }
-    const session = validateSessionSync(token)
-    req.user = session.user
-    next()
+    validateSession(token).then(() => next())
   } catch (err) {
     next(err)
   }
 }`,
}

export const mockPRs: PullRequest[] = [
  {
    id: "pr-1",
    repoId: "",
    number: 247,
    title: "Add CSV import to devices table",
    repo: "minut/platform",
    author: "viktor",
    branch: "feat/csv-import",
    baseBranch: "main",
    requestedAt: "2h ago",
    reviewStatus: "awaiting",
    unread: false,
    additions: 312,
    deletions: 18,
    files: [
      { path: "src/components/DevicesTable.tsx", additions: 145, deletions: 12, status: "modified" },
      { path: "src/lib/csv.ts", additions: 98, deletions: 0, status: "added" },
      { path: "src/hooks/useDeviceImport.ts", additions: 67, deletions: 6, status: "modified" },
      { path: "src/api/devices.ts", additions: 2, deletions: 0, status: "modified" },
    ],
    description: "Adds ability to bulk import devices via CSV file. Supports both add and update operations. Validates against existing device schema before import.",
  },
  {
    id: "pr-2",
    repoId: "",
    number: 243,
    title: "Fix null pointer in sensor data aggregation",
    repo: "minut/platform",
    author: "sara",
    branch: "fix/sensor-null",
    baseBranch: "main",
    requestedAt: "1d ago",
    reviewStatus: "changes-requested",
    unread: true,
    additions: 24,
    deletions: 8,
    files: [
      { path: "src/services/aggregation.ts", additions: 18, deletions: 6, status: "modified" },
      { path: "src/services/aggregation.test.ts", additions: 6, deletions: 2, status: "modified" },
    ],
    description: "Fixes a null pointer exception that occurs when sensor data arrives out of order. Adds null checks and a unit test to cover the edge case.",
  },
  {
    id: "pr-3",
    repoId: "",
    number: 238,
    title: "Refactor authentication middleware",
    repo: "minut/platform",
    author: "emma",
    branch: "refactor/auth-middleware",
    baseBranch: "main",
    requestedAt: "3d ago",
    reviewStatus: "awaiting",
    unread: false,
    additions: 189,
    deletions: 203,
    files: [
      { path: "src/middleware/auth.ts", additions: 95, deletions: 143, status: "modified" },
      { path: "src/middleware/session.ts", additions: 72, deletions: 60, status: "modified" },
      { path: "src/middleware/index.ts", additions: 22, deletions: 0, status: "modified" },
    ],
    description: "Refactors the authentication middleware to use the new session management library. Improves error handling and removes deprecated token validation code.",
  },
]

export const mockReviewResults: Record<string, { summary: string; comments: ReviewComment[] }> = {
  "pr-1": {
    summary: `The CSV import implementation looks solid overall. The validation logic in \`csv.ts\` is well-structured and the progress reporting in the hook is a nice touch.

That said, there's a critical issue around atomicity: if the batch import fails mid-way, devices from the first chunk will have been created but subsequent ones won't — leaving the system in an inconsistent state. This needs to be addressed before merging.

I've also left a few smaller suggestions below.`,
    comments: [
      {
        id: "c1",
        type: "inline",
        severity: "blocking",
        path: "src/lib/csv.ts",
        line: 87,
        codeContext: [
          { lineNumber: 84, content: "  const chunks = splitIntoChunks(validated, BATCH_SIZE)" },
          { lineNumber: 85, content: "  const results: ImportResult[] = []" },
          { lineNumber: 86, content: "  for (const chunk of chunks) {" },
          { lineNumber: 87, content: "    await importBatch(chunk)", highlighted: true },
          { lineNumber: 88, content: "    results.push(...chunk.map(toResult))" },
          { lineNumber: 89, content: "  }" },
          { lineNumber: 90, content: "  return results" },
        ],
        body: "If `importBatch()` throws after processing the first chunk, those devices will have been created while subsequent ones won't. Consider wrapping the entire import in a transaction, or collect all validated records first and apply them in a single API call.",
        status: "pending",
      },
      {
        id: "c2",
        type: "inline",
        severity: "suggestion",
        path: "src/components/DevicesTable.tsx",
        line: 234,
        codeContext: [
          { lineNumber: 231, content: "  const { data, isImporting, progress } = useDeviceImport()" },
          { lineNumber: 232, content: "" },
          { lineNumber: 233, content: "  return (" },
          { lineNumber: 234, content: "    <Progress value={(progress.done / progress.total) * 100} />", highlighted: true },
          { lineNumber: 235, content: "    <DeviceList data={data} />" },
          { lineNumber: 236, content: "  )" },
        ],
        body: "The progress percentage is recomputed on every render. Wrap this in `useMemo` — with large device lists this could be noticeable.",
        status: "pending",
      },
      {
        id: "c3",
        type: "inline",
        severity: "nit",
        path: "src/hooks/useDeviceImport.ts",
        line: 45,
        codeContext: [
          { lineNumber: 42, content: "  const { data, loading } = useQuery(DEVICES_QUERY)" },
          { lineNumber: 43, content: "" },
          { lineNumber: 44, content: "  async function runImport(file: File) {" },
          { lineNumber: 45, content: "    const isImporting = true", highlighted: true },
          { lineNumber: 46, content: "    const csv = await parseCSV(file)" },
          { lineNumber: 47, content: "    return uploadBatch(csv)" },
          { lineNumber: 48, content: "  }" },
        ],
        body: "`isImporting` shadows the outer `loading` state from the query. Rename to `isBatchImporting` to make the distinction clear when reading the hook.",
        status: "pending",
      },
      {
        id: "c4",
        type: "general",
        severity: "suggestion",
        body: "The parser doesn't strip BOM (Byte Order Mark) characters, which are common in CSVs exported from Excel on Windows. This will cause the first column header to be misread. Consider stripping `\\uFEFF` at the start of parsing.",
        status: "pending",
      },
    ],
  },
  "pr-2": {
    summary: `Good fix — the null checks are correctly placed and the early return prevents the downstream aggregation from running on bad data.

One concern: the test only validates the null case itself but doesn't verify that out-of-order data (the original trigger) still aggregates correctly after the fix. Happy to approve once that's covered.`,
    comments: [
      {
        id: "c5",
        type: "inline",
        severity: "suggestion",
        path: "src/services/aggregation.test.ts",
        line: 34,
        codeContext: [
          { lineNumber: 31, content: "  it('returns null when data is missing', () => {" },
          { lineNumber: 32, content: "    const result = aggregate(null)" },
          { lineNumber: 33, content: "    expect(result).toBeNull()" },
          { lineNumber: 34, content: "  })", highlighted: true },
          { lineNumber: 35, content: "" },
          { lineNumber: 36, content: "  // TODO: add more tests" },
          { lineNumber: 37, content: "})" },
        ],
        body: "Add a test that sends readings out of chronological order and asserts the aggregated result is still correct. The null fix is tested but the original out-of-order scenario that surfaced this bug isn't covered.",
        status: "pending",
      },
      {
        id: "c6",
        type: "inline",
        severity: "nit",
        path: "src/services/aggregation.ts",
        line: 112,
        codeContext: [
          { lineNumber: 109, content: "export function aggregate(data: SensorData | null) {" },
          { lineNumber: 110, content: "  if (!data) return null" },
          { lineNumber: 111, content: "" },
          { lineNumber: 112, content: "  const readings = data?.readings ?? []", highlighted: true },
          { lineNumber: 113, content: "  return readings.reduce(sum, 0) / readings.length" },
          { lineNumber: 114, content: "}" },
        ],
        body: "`data?.readings ?? []` silently falls back to an empty array, which means downstream code produces 0-aggregates instead of surfacing the null. Consider logging a warning so this is visible in production.",
        status: "pending",
      },
    ],
  },
  "pr-3": {
    summary: `Clean refactor — the new session library's API is used consistently and the removal of the deprecated validation code is well-scoped. The middleware chain is noticeably simpler.

One blocking issue: the new \`validateSession\` call in \`auth.ts\` is async but the surrounding context doesn't await it in the error path. This will silently swallow auth failures.`,
    comments: [
      {
        id: "c7",
        type: "inline",
        severity: "blocking",
        path: "src/middleware/auth.ts",
        line: 58,
        codeContext: [
          { lineNumber: 55, content: "  try {" },
          { lineNumber: 56, content: "    const token = extractToken(req.headers)" },
          { lineNumber: 57, content: "    if (!token) return next(new UnauthorizedError())" },
          { lineNumber: 58, content: "    validateSession(token).then(() => next())", highlighted: true },
          { lineNumber: 59, content: "  } catch (err) {" },
          { lineNumber: 60, content: "    next(err)" },
          { lineNumber: 61, content: "  }" },
        ],
        body: "`validateSession(token)` is async but the `catch` block calls `next(err)` before the promise settles. Auth failures in the async path won't propagate correctly — requests may pass through unauthenticated. Add `await` here.",
        status: "pending",
      },
      {
        id: "c8",
        type: "inline",
        severity: "suggestion",
        path: "src/middleware/session.ts",
        line: 22,
        codeContext: [
          { lineNumber: 19, content: "export function createSession(userId: string) {" },
          { lineNumber: 20, content: "  return SessionLib.create({" },
          { lineNumber: 21, content: "    userId," },
          { lineNumber: 22, content: "    ttl: 3600,", highlighted: true },
          { lineNumber: 23, content: "    secure: true," },
          { lineNumber: 24, content: "  })" },
          { lineNumber: 25, content: "}" },
        ],
        body: "The session TTL is hardcoded to 3600. This was configurable in the old implementation — worth keeping it as an env var or config option rather than hardcoding.",
        status: "pending",
      },
    ],
  },
}
