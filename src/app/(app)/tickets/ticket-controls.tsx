"use client"

import Form from "next/form"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState, useTransition } from "react"
import { FormField, FormMessage, FormSelect, FormTextarea, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { PhotoUpload } from "@/components/photo-upload"
import { SlaChip } from "@/components/sla-chip"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SEVERITY_BADGE, statusLabel } from "@/lib/ticket-display"
import { timeAgo } from "@/lib/relative-time"
import { cn } from "@/lib/utils"
import {
  bulkTicketAction,
  createManualTicketAction,
  createSavedViewAction,
  deleteSavedViewAction,
  quickTransitionAction,
} from "./actions"

export type TicketRow = {
  id: string
  number: string
  locationName: string
  locationParent: string
  categoryName: string
  description: string
  severity: "low" | "medium" | "high" | "critical"
  status: string
  rating: number | null
  reportCount: number
  assigneeName: string | null
  currentLevel: number
  slaBreached: boolean
  slaPausedAt: string | null
  slaResolvedAt: string | null
  resolveDueAt: string | null
  createdAt: string
}

export type FilterOption = { value: string; label: string }
export type LocationOption = { value: string; label: string; branchId: string }

export type SavedViewItem = {
  id: string
  name: string
  shared: boolean
  filters: Record<string, string | undefined>
}

function ManualTicketForm({
  locations,
  categories,
  members,
  onDone,
}: {
  locations: LocationOption[]
  categories: FilterOption[]
  members: FilterOption[]
  onDone: (id?: string) => void
}) {
  const [state, action] = useActionState(createManualTicketAction, null)
  const [locationId, setLocationId] = useState(locations[0]?.value ?? "")
  const selectedBranchId = locations.find((l) => l.value === locationId)?.branchId
  useEffect(() => {
    if (state?.ok) onDone(state.data.id)
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      <FormSelect
        label="Location"
        name="locationId"
        options={locations}
        value={locationId}
        onChange={(e) => setLocationId(e.target.value)}
        state={state}
        required
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormSelect
          label="Category"
          name="categoryId"
          options={categories}
          state={state}
          required
        />
        <FormSelect
          label="Severity"
          name="severity"
          defaultValue="medium"
          options={[
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: "critical", label: "Critical" },
          ]}
          state={state}
        />
      </div>
      <FormTextarea
        label="What happened?"
        name="description"
        placeholder="Describe the issue clearly for the team…"
        required
        state={state}
      />
      <FormSelect
        label="Assign to (optional)"
        name="assigneeId"
        options={[{ value: "", label: "Auto-assign (use rules)" }, ...members]}
        state={state}
      />
      <FormField
        label="Tags (optional, comma-separated)"
        name="tags"
        placeholder="plumbing, vip-wing"
        state={state}
      />
      <PhotoUpload
        mode="staff"
        scope="ticket"
        branchId={selectedBranchId}
        maxFiles={3}
        label="Attach photos (optional)"
      />
      <FormMessage state={state} />
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="xl" onClick={() => onDone()}>
          Cancel
        </Button>
        <SubmitButton>Create ticket</SubmitButton>
      </div>
    </form>
  )
}

export function NewTicketDialog({
  locations,
  categories,
  members,
}: {
  locations: LocationOption[]
  categories: FilterOption[]
  members: FilterOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  if (locations.length === 0) return null

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title="New ticket"
      description="Log an issue manually without scanning a QR code."
      trigger={
        <Button size="xl">
          <Icon name="plus" data-icon="inline-start" /> New ticket
        </Button>
      }
    >
      {open && (
        <ManualTicketForm
          locations={locations}
          categories={categories}
          members={members}
          onDone={(id) => {
            setOpen(false)
            if (id) router.push(`/tickets/${id}`)
          }}
        />
      )}
    </Modal>
  )
}

function SaveViewForm({
  currentFilters,
  onDone,
}: {
  currentFilters: Record<string, string | undefined>
  onDone: () => void
}) {
  const [state, action] = useActionState(createSavedViewAction, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      {Object.entries(currentFilters).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <FormField
        label="View name"
        name="name"
        placeholder="e.g. Critical open"
        required
        state={state}
      />
      <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" name="shared" className="size-4 accent-(--primary)" />
        <span>Share with my organisation</span>
      </label>
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton>Save view</SubmitButton>
      </div>
    </form>
  )
}

export function TicketBoard({
  items,
  view,
  filters,
  branches,
  categories,
  members,
  savedViews,
  canAssign,
  canWork = false,
  canClose = false,
  now,
}: {
  items: TicketRow[]
  view: "table" | "kanban"
  filters: Record<string, string | undefined>
  branches: FilterOption[]
  categories: FilterOption[]
  members: FilterOption[]
  savedViews: SavedViewItem[]
  canAssign: boolean
  canWork?: boolean
  canClose?: boolean
  now: number
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saveOpen, setSaveOpen] = useState(false)
  const [viewErr, setViewErr] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState<"assign" | "cancel">("assign")
  const [kanbanPendingId, setKanbanPendingId] = useState<string | null>(null)
  const [, startKanbanTransition] = useTransition()
  const [bulkState, bulkFormAction] = useActionState(
    async (prev: Awaited<ReturnType<typeof bulkTicketAction>>, fd: FormData) => {
      const res = await bulkTicketAction(prev, fd)
      if (res?.ok) setSelected(new Set())
      return res
    },
    null,
  )

  function kanbanQuickAct(id: string, type: "accept" | "start" | "resume") {
    setKanbanPendingId(id)
    setViewErr(null)
    startKanbanTransition(async () => {
      try {
        const res = await quickTransitionAction(id, { type })
        if (res && !res.ok) setViewErr(res.error.message)
      } finally {
        setKanbanPendingId(null)
      }
    })
  }

  const visibleIds = new Set(items.map((i) => i.id))
  const activeSelected = new Set([...selected].filter((id) => visibleIds.has(id)))

  function buildUrl(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams()
    const merged: Record<string, string | undefined> = { ...filters, view, ...patch }
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "all" && !(k === "view" && v === "table")) next.set(k, v)
    }
    const qs = next.toString()
    return qs ? `/tickets?${qs}` : "/tickets"
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set([...prev].filter((itemId) => visibleIds.has(itemId)))
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (activeSelected.size === items.length) setSelected(new Set())
    else setSelected(new Set(items.map((i) => i.id)))
  }

  const kanbanCols = [
    { key: "new", label: "New", statuses: ["new"] },
    { key: "assigned", label: "Assigned / Accepted", statuses: ["assigned", "accepted"] },
    { key: "in_progress", label: "In progress", statuses: ["in_progress", "reopened"] },
    { key: "on_hold", label: "On hold", statuses: ["on_hold"] },
    { key: "pending_verification", label: "Pending verify", statuses: ["pending_verification"] },
    { key: "closed", label: "Closed", statuses: ["closed", "cancelled"] },
  ]

  return (
    <div className="space-y-4">
      {/* Saved views chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={buildUrl({
            status: "open",
            severity: undefined,
            assigneeId: undefined,
            q: undefined,
          })}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            filters.status === "open"
              ? "border-primary bg-primary/10 text-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          All open
        </Link>
        <Link
          href={buildUrl({ status: "pending_verification" })}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            filters.status === "pending_verification"
              ? "border-primary bg-primary/10 text-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          Needs verification
        </Link>
        <Link
          href={buildUrl({ assigneeId: "unassigned", status: "open" })}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            filters.assigneeId === "unassigned"
              ? "border-primary bg-primary/10 text-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          Unassigned
        </Link>
        {savedViews.map((sv) => {
          const qs = new URLSearchParams()
          for (const [k, v] of Object.entries(sv.filters)) if (v) qs.set(k, v)
          return (
            <span
              key={sv.id}
              className="inline-flex items-center gap-1 rounded-full border bg-card py-0.5 pr-1.5 pl-3 text-xs font-medium"
            >
              <Link href={`/tickets?${qs.toString()}`} className="hover:text-primary">
                {sv.name}
              </Link>
              <button
                type="button"
                aria-label={`Delete view ${sv.name}`}
                onClick={async () => {
                  setViewErr(null)
                  const res = await deleteSavedViewAction(sv.id)
                  if (res && !res.ok) setViewErr(res.error.message)
                  else router.refresh()
                }}
                className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
              >
                <Icon name="close" className="size-3" />
              </button>
            </span>
          )
        })}

        <Modal
          open={saveOpen}
          onOpenChange={setSaveOpen}
          title="Save current filter view"
          trigger={
            <button
              type="button"
              className="rounded-full border border-dashed px-3 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground"
            >
              + Save view
            </button>
          }
        >
          {saveOpen && <SaveViewForm currentFilters={filters} onDone={() => setSaveOpen(false)} />}
        </Modal>

        <div className="ml-auto flex items-center gap-1 rounded-lg border p-0.5">
          <Link
            href={buildUrl({ view: "table" })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
              view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <Icon name="list" className="size-3.5" /> Table
          </Link>
          <Link
            href={buildUrl({ view: "kanban" })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
              view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <Icon name="kanban" className="size-3.5" /> Kanban
          </Link>
        </div>
      </div>

      {viewErr && <p className="text-xs text-destructive">{viewErr}</p>}

      {/* Filter form */}
      <Form
        key={JSON.stringify({ ...filters, view })}
        action="/tickets"
        className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-7"
      >
        {view === "kanban" && <input type="hidden" name="view" value="kanban" />}
        <Input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Search number, text, spot…"
          aria-label="Search tickets"
          className="h-10 lg:col-span-2"
        />
        <select
          name="status"
          defaultValue={filters.status ?? "all"}
          aria-label="Filter by status"
          className="h-10 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="all">All statuses</option>
          <option value="open">All open</option>
          <option value="new">New</option>
          <option value="assigned">Assigned</option>
          <option value="accepted">Accepted</option>
          <option value="in_progress">In progress</option>
          <option value="on_hold">On hold</option>
          <option value="pending_verification">Pending verification</option>
          <option value="reopened">Reopened</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          name="severity"
          defaultValue={filters.severity ?? "all"}
          aria-label="Filter by severity"
          className="h-10 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          name="branchId"
          defaultValue={filters.branchId ?? "all"}
          aria-label="Filter by branch"
          className="h-10 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <select
          name="assigneeId"
          defaultValue={filters.assigneeId ?? "all"}
          aria-label="Filter by assignee"
          className="h-10 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="all">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {members.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <div className="flex gap-1.5">
          <select
            name="categoryId"
            defaultValue={filters.categoryId ?? "all"}
            aria-label="Filter by category"
            className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="all">Category</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <Button type="submit" size="default" className="h-10 shrink-0" aria-label="Apply filters">
            <Icon name="filter" />
          </Button>
        </div>
      </Form>

      {/* Bulk action bar */}
      {(canAssign || canClose) && activeSelected.size > 0 && (
        <form
          action={bulkFormAction}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2.5 text-sm"
        >
          {[...activeSelected].map((id) => (
            <input key={id} type="hidden" name="ticketIds" value={id} />
          ))}
          <span className="font-medium tabular-nums">{activeSelected.size} selected</span>
          <select
            name="action"
            value={bulkMode}
            onChange={(e) => setBulkMode(e.target.value as "assign" | "cancel")}
            aria-label="Bulk action"
            className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {canAssign && <option value="assign">Bulk assign</option>}
            {canClose && <option value="cancel">Bulk cancel</option>}
          </select>
          {bulkMode === "assign" && (
            <select
              name="assigneeId"
              required
              aria-label="Bulk assign to"
              className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="">Assign to…</option>
              {members.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
          <Input
            name="reason"
            aria-label="Bulk action reason"
            placeholder={bulkMode === "cancel" ? "Cancellation reason" : "Reason (optional)"}
            className="h-9 w-44"
          />
          <SubmitButton size="sm" variant={bulkMode === "cancel" ? "destructive" : "default"}>
            {bulkMode === "cancel" ? "Cancel selected" : "Apply bulk assign"}
          </SubmitButton>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          {bulkState && !bulkState.ok && (
            <span className="text-xs text-destructive">{bulkState.error.message}</span>
          )}
        </form>
      )}

      {view === "kanban" ? (
        <div className="grid gap-4 overflow-x-auto pb-2 md:grid-cols-2 xl:grid-cols-3">
          {kanbanCols.map((col) => {
            const colItems = items.filter((i) => col.statuses.includes(i.status))
            return (
              <section key={col.key} className="flex flex-col rounded-xl border bg-muted/30 p-3">
                <header className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{col.label}</h2>
                  <Badge variant="muted" className="tabular-nums">
                    {colItems.length}
                  </Badge>
                </header>
                <ul className="space-y-2.5">
                  {colItems.length === 0 ? (
                    <li className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      No tickets
                    </li>
                  ) : (
                    colItems.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-xl border bg-card p-3 transition-colors hover:border-primary/50"
                      >
                        <Link href={`/tickets/${t.id}`} className="block">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-medium">{t.number}</span>
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              {t.currentLevel > 1 && (
                                <Badge variant="warning">L{t.currentLevel}</Badge>
                              )}
                              <Badge variant={SEVERITY_BADGE[t.severity]} className="capitalize">
                                {t.severity}
                              </Badge>
                            </div>
                          </div>
                          <p className="mt-1.5 text-sm font-semibold">{t.categoryName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {t.locationName}
                            {t.locationParent && ` · ${t.locationParent}`}
                          </p>
                          {t.description && (
                            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                              {t.description}
                            </p>
                          )}
                          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>{t.assigneeName ?? "Unassigned"}</span>
                            <div className="flex items-center gap-1.5">
                              <SlaChip
                                createdAt={t.createdAt}
                                resolveDueAt={t.resolveDueAt}
                                pausedAt={t.slaPausedAt}
                                resolvedAt={t.slaResolvedAt}
                                breached={t.slaBreached}
                                now={now}
                              />
                              <span>{timeAgo(new Date(t.createdAt), now)}</span>
                            </div>
                          </div>
                        </Link>
                        {canWork &&
                          ["new", "assigned", "accepted", "reopened", "on_hold"].includes(
                            t.status,
                          ) && (
                            <div className="mt-2.5 flex justify-end border-t pt-2">
                              {(t.status === "new" || t.status === "assigned") && (
                                <Button
                                  size="xs"
                                  variant="secondary"
                                  loading={kanbanPendingId === t.id}
                                  onClick={() => kanbanQuickAct(t.id, "accept")}
                                >
                                  Accept
                                </Button>
                              )}
                              {(t.status === "accepted" || t.status === "reopened") && (
                                <Button
                                  size="xs"
                                  variant="secondary"
                                  loading={kanbanPendingId === t.id}
                                  onClick={() => kanbanQuickAct(t.id, "start")}
                                >
                                  Start work
                                </Button>
                              )}
                              {t.status === "on_hold" && (
                                <Button
                                  size="xs"
                                  variant="secondary"
                                  loading={kanbanPendingId === t.id}
                                  onClick={() => kanbanQuickAct(t.id, "resume")}
                                >
                                  Resume
                                </Button>
                              )}
                            </div>
                          )}
                      </li>
                    ))
                  )}
                </ul>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted text-left text-muted-foreground">
              <tr>
                {(canAssign || canClose) && (
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Select all tickets"
                      checked={items.length > 0 && activeSelected.size === items.length}
                      onChange={toggleAll}
                      className="size-4 accent-(--primary)"
                    />
                  </th>
                )}
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Ticket
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Where
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  About
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Assignee
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Severity
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Status &amp; SLA
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Reported
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((t) => (
                <tr key={t.id} className="align-top hover:bg-muted/30">
                  {(canAssign || canClose) && (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${t.number}`}
                        checked={activeSelected.has(t.id)}
                        onChange={() => toggleOne(t.id)}
                        className="size-4 accent-(--primary)"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Link
                      href={`/tickets/${t.id}`}
                      className="font-mono text-xs font-semibold whitespace-nowrap text-primary hover:underline"
                    >
                      {t.number}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {t.currentLevel > 1 && <Badge variant="warning">L{t.currentLevel}</Badge>}
                      {t.reportCount > 1 && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          ×{t.reportCount}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{t.locationName}</span>
                    {t.locationParent && (
                      <span className="block text-xs text-muted-foreground">
                        {t.locationParent}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/tickets/${t.id}`} className="font-medium hover:underline">
                      {t.categoryName}
                    </Link>
                    {t.description && (
                      <span className="mt-1 line-clamp-2 block max-w-64 text-xs text-muted-foreground">
                        {t.description}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {t.assigneeName ?? "Unassigned"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={SEVERITY_BADGE[t.severity]} className="capitalize">
                      {t.severity}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={
                          t.status === "new"
                            ? "secondary"
                            : t.status === "closed"
                              ? "success"
                              : t.status === "pending_verification"
                                ? "info"
                                : t.status === "on_hold"
                                  ? "warning"
                                  : "muted"
                        }
                        className="capitalize"
                      >
                        {statusLabel(t.status)}
                      </Badge>
                      <SlaChip
                        createdAt={t.createdAt}
                        resolveDueAt={t.resolveDueAt}
                        pausedAt={t.slaPausedAt}
                        resolvedAt={t.slaResolvedAt}
                        breached={t.slaBreached}
                        now={now}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {timeAgo(new Date(t.createdAt), now)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export { buttonVariants }
