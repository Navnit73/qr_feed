"use client"

import {
  createContext,
  type ReactNode,
  useActionState,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { FormField, FormMessage, FormSelect, SubmitButton } from "@/components/form"
import { Icon } from "@/components/icons"
import { Modal } from "@/components/modal"
import { useSweetAlert } from "@/components/sweet-alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { canNest, childTypes, LOCATION_TYPE_LABELS, type LocationType } from "@/lib/location-tree"
import {
  archiveBranchAction,
  archiveLocationAction,
  createBranchAction,
  createLocationAction,
  moveLocationAction,
  renameLocationAction,
  updateBranchAction,
} from "./actions"

/** Closes the dialog once the action succeeds. Forms mount fresh on every open. */
function useCloseOnSuccess(state: { ok: boolean } | null, onDone: () => void) {
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])
}

function DialogButtons({ onCancel, submit }: { onCancel: () => void; submit: string }) {
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="ghost" size="xl" onClick={onCancel}>
        Cancel
      </Button>
      <SubmitButton>{submit}</SubmitButton>
    </div>
  )
}

function AddBranchForm({ timeZones, onDone }: { timeZones: string[]; onDone: () => void }) {
  const [state, action] = useActionState(createBranchAction, null)
  useCloseOnSuccess(state, onDone)
  return (
    <form action={action} className="space-y-4">
      <FormField
        label="Branch name"
        name="name"
        placeholder="Hotel Mumbai"
        required
        state={state}
      />
      <FormSelect
        label="Time zone"
        name="timezone"
        defaultValue="Asia/Kolkata"
        state={state}
        options={timeZones.map((z) => ({ value: z, label: z.replaceAll("_", " ") }))}
      />
      <FormField label="Address (optional)" name="address" state={state} />
      <FormMessage state={state} />
      <DialogButtons onCancel={onDone} submit="Add branch" />
    </form>
  )
}

export function AddBranchDialog({ timeZones }: { timeZones: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Add branch"
      description="A branch is one site: a hotel, clinic, mall or plant."
      trigger={
        <Button size="xl">
          <Icon name="branch" data-icon="inline-start" /> Add branch
        </Button>
      }
    >
      {open && <AddBranchForm timeZones={timeZones} onDone={() => setOpen(false)} />}
    </Modal>
  )
}

export type ParentOption = { id: string; label: string; type: LocationType }

function AddLocationForm({
  branchId,
  parents,
  onDone,
}: {
  branchId: string
  parents: ParentOption[]
  onDone: () => void
}) {
  const [state, action] = useActionState(createLocationAction, null)
  useCloseOnSuccess(state, onDone)
  const [parentId, setParentId] = useState("")
  const parentType = parents.find((p) => p.id === parentId)?.type ?? null
  const types = useMemo(() => childTypes(parentType), [parentType])

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="branchId" value={branchId} />
      <FormSelect
        label="Inside"
        name="parentId"
        value={parentId}
        onChange={(e) => setParentId(e.target.value)}
        state={state}
        options={[
          { value: "", label: "Top level (the branch itself)" },
          ...parents
            .filter((p) => childTypes(p.type).length)
            .map((p) => ({ value: p.id, label: p.label })),
        ]}
      />
      <FormSelect
        // Remount when the parent changes so the first allowed type is selected.
        key={parentType ?? "root"}
        label="Type"
        name="type"
        state={state}
        options={types.map((t) => ({ value: t, label: LOCATION_TYPE_LABELS[t] }))}
      />
      <FormField label="Name" name="name" placeholder="Washroom F2" required state={state} />
      <FormField
        label="Code (optional)"
        name="code"
        placeholder="WC-F2"
        hint="A short ID printed under the QR code."
        state={state}
      />
      <FormMessage state={state} />
      <DialogButtons onCancel={onDone} submit="Add location" />
    </form>
  )
}

export function AddLocationDialog({
  branchId,
  parents,
}: {
  branchId: string
  parents: ParentOption[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Add location"
      description="Buildings hold floors, floors hold departments, and any of them can hold locations."
      trigger={
        <Button size="xl">
          <Icon name="location" data-icon="inline-start" /> Add location
        </Button>
      }
    >
      {open && (
        <AddLocationForm branchId={branchId} parents={parents} onDone={() => setOpen(false)} />
      )}
    </Modal>
  )
}

function RenameForm({
  id,
  branchId,
  name,
  onDone,
}: {
  id: string
  branchId: string
  name: string
  onDone: () => void
}) {
  const [state, action] = useActionState(renameLocationAction, null)
  useCloseOnSuccess(state, onDone)
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="branchId" value={branchId} />
      <FormField label="Name" name="name" defaultValue={name} required state={state} />
      <FormMessage state={state} />
      <DialogButtons onCancel={onDone} submit="Rename" />
    </form>
  )
}

function MoveForm({
  id,
  branchId,
  nodeType,
  currentParentId,
  parents,
  onDone,
}: {
  id: string
  branchId: string
  nodeType: LocationType
  currentParentId: string | null
  parents: ParentOption[]
  onDone: () => void
}) {
  const [state, action] = useActionState(moveLocationAction, null)
  useCloseOnSuccess(state, onDone)
  const validParents = parents.filter((p) => p.id !== id && canNest(p.type, nodeType))
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="branchId" value={branchId} />
      <FormSelect
        label="Move inside"
        name="parentId"
        defaultValue={currentParentId ?? ""}
        state={state}
        options={[
          ...(canNest(null, nodeType)
            ? [{ value: "", label: "Top level (the branch itself)" }]
            : []),
          ...validParents.map((p) => ({ value: p.id, label: p.label })),
        ]}
      />
      <FormMessage state={state} />
      <DialogButtons onCancel={onDone} submit="Move" />
    </form>
  )
}

/*
 * The tree's shared data (branch id and every possible parent) lives in one provider instead
 * of being repeated on every row: as props it made the page payload grow with rows².
 */
const TreeContext = createContext<{ branchId: string; parents: ParentOption[] } | null>(null)

export function BranchTreeProvider({
  branchId,
  parents,
  children,
}: {
  branchId: string
  parents: ParentOption[]
  children: ReactNode
}) {
  const value = useMemo(() => ({ branchId, parents }), [branchId, parents])
  return <TreeContext value={value}>{children}</TreeContext>
}

function useTree() {
  const ctx = useContext(TreeContext)
  if (!ctx) throw new Error("LocationMenu must sit inside <BranchTreeProvider>")
  return ctx
}

/** Rename, move and archive for one tree node, behind a single ⋯ menu. Dialogs mount on demand. */
export function LocationMenu({
  id,
  name,
  nodeType,
  parentId,
}: {
  id: string
  name: string
  nodeType: LocationType
  parentId: string | null
}) {
  const { branchId, parents } = useTree()
  const [dialog, setDialog] = useState<"rename" | "move" | null>(null)
  const close = () => setDialog(null)
  const swal = useSweetAlert()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label={`More actions for ${name}`}
              className="text-muted-foreground"
            />
          }
        >
          <Icon name="more" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem className="min-h-9" onClick={() => setDialog("rename")}>
            <Icon name="edit" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-9" onClick={() => setDialog("move")}>
            <Icon name="move" /> Move
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className="min-h-9"
            onClick={() =>
              swal.fire({
                tone: "warning",
                title: `Archive ${name}?`,
                text: "It disappears from the tree. Its history stays in the audit log.",
                confirmText: "Archive",
                cancelText: "Keep it",
                confirmVariant: "destructive",
                onConfirm: async () => {
                  const res = await archiveLocationAction(id, branchId)
                  if (res && !res.ok) throw new Error(res.error.message)
                },
              })
            }
          >
            <Icon name="archive" /> Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === "rename" && (
        <Modal open onOpenChange={(o) => !o && close()} title={`Rename ${name}`}>
          <RenameForm id={id} branchId={branchId} name={name} onDone={close} />
        </Modal>
      )}
      {dialog === "move" && (
        <Modal
          open
          onOpenChange={(o) => !o && close()}
          title={`Move ${name}`}
          description="Updates this location and everything inside it."
        >
          <MoveForm
            id={id}
            branchId={branchId}
            nodeType={nodeType}
            currentParentId={parentId}
            parents={parents}
            onDone={close}
          />
        </Modal>
      )}
    </>
  )
}

const WEEKDAYS: { key: string; label: string }[] = [
  { key: "1", label: "Monday" },
  { key: "2", label: "Tuesday" },
  { key: "3", label: "Wednesday" },
  { key: "4", label: "Thursday" },
  { key: "5", label: "Friday" },
  { key: "6", label: "Saturday" },
  { key: "0", label: "Sunday" },
]

type BranchSettingsData = {
  id: string
  name: string
  timezone: string
  address: string
  businessHours?: { days: Record<string, { enabled: boolean; start: string; end: string }> }
  holidays: string[]
}

function BranchSettingsForm({
  branch,
  timeZones,
  canArchive,
  onDone,
}: {
  branch: BranchSettingsData
  timeZones: string[]
  canArchive: boolean
  onDone: () => void
}) {
  const [state, action] = useActionState(updateBranchAction, null)
  const swal = useSweetAlert()
  useCloseOnSuccess(state, onDone)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="branchId" value={branch.id} />
      <FormField
        label="Branch name"
        name="name"
        defaultValue={branch.name}
        required
        state={state}
      />
      <FormSelect
        label="Time zone"
        name="timezone"
        defaultValue={branch.timezone}
        state={state}
        options={timeZones.map((z) => ({ value: z, label: z.replaceAll("_", " ") }))}
      />
      <FormField
        label="Address (optional)"
        name="address"
        defaultValue={branch.address}
        state={state}
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Business hours (used for business-hours SLAs)
        </legend>
        <div className="space-y-1.5 rounded-xl border p-3">
          {WEEKDAYS.map((d) => {
            const cfg = branch.businessHours?.days?.[d.key] ?? {
              enabled: d.key !== "0",
              start: "09:00",
              end: "18:00",
            }
            return (
              <div
                key={d.key}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-sm"
              >
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    name={`day_${d.key}_enabled`}
                    defaultChecked={cfg.enabled}
                    className="size-4 accent-(--primary)"
                  />
                  <span>{d.label}</span>
                </label>
                <input
                  type="time"
                  name={`day_${d.key}_start`}
                  defaultValue={cfg.start}
                  aria-label={`${d.label} start`}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-xs dark:bg-input/30"
                />
                <input
                  type="time"
                  name={`day_${d.key}_end`}
                  defaultValue={cfg.end}
                  aria-label={`${d.label} end`}
                  className="h-9 rounded-lg border border-input bg-background px-2 text-xs dark:bg-input/30"
                />
              </div>
            )
          })}
        </div>
      </fieldset>

      <FormField
        label="Holidays (comma-separated YYYY-MM-DD)"
        name="holidays"
        defaultValue={branch.holidays.join(", ")}
        placeholder="2026-01-26, 2026-08-15, 2026-10-02"
        hint="Business-hours SLA timers pause automatically on holiday dates."
        state={state}
      />

      <FormMessage state={state} />
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        {canArchive ? (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="text-destructive"
            onClick={() =>
              swal.fire({
                tone: "warning",
                title: `Archive ${branch.name}?`,
                text: "All active QR codes in this branch will be revoked immediately. Ticket history stays preserved.",
                confirmText: "Archive branch",
                cancelText: "Keep it",
                confirmVariant: "destructive",
                onConfirm: async () => {
                  const res = await archiveBranchAction(branch.id)
                  if (res && !res.ok) throw new Error(res.error.message)
                },
              })
            }
          >
            Archive branch
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="xl" onClick={onDone}>
            Cancel
          </Button>
          <SubmitButton>Save settings</SubmitButton>
        </div>
      </div>
    </form>
  )
}

export function BranchSettingsDialog({
  branch,
  timeZones,
  canArchive,
}: {
  branch: BranchSettingsData
  timeZones: string[]
  canArchive: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title={`Branch settings · ${branch.name}`}
      description="Configure time zone, operating hours and holiday dates for SLA calculations."
      trigger={
        <Button variant="outline" size="xl">
          <Icon name="settings" data-icon="inline-start" /> Branch settings
        </Button>
      }
    >
      {open && (
        <BranchSettingsForm
          branch={branch}
          timeZones={timeZones}
          canArchive={canArchive}
          onDone={() => setOpen(false)}
        />
      )}
    </Modal>
  )
}
