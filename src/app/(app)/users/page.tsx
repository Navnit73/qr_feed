import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PanelCard } from "@/components/cards/panel-card"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { requireTenantContext } from "@/server/auth/session"
import { listBranches } from "@/server/modules/branches"
import { listInvites, listMembers } from "@/server/modules/members"
import { can, canGrantRoles } from "@/server/rbac/ability"
import { roleLabel } from "@/server/rbac/labels"
import { SYSTEM_ROLES, type SystemRoleKey } from "@/server/rbac/permissions"
import { InviteDialog, MemberActions, RevokeInviteButton, type Option } from "./user-dialogs"

export const metadata: Metadata = { title: "Users · QR Feed" }

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" })

export default async function UsersPage() {
  const ctx = await requireTenantContext()
  if (!can(ctx, "user:read")) redirect("/dashboard")

  const [members, invites, branches] = await Promise.all([
    listMembers(ctx),
    listInvites(ctx),
    can(ctx, "branch:read") ? listBranches(ctx) : [],
  ])
  const branchName = new Map(branches.map((b) => [b._id.toHexString(), b.name]))

  // Offer only roles this admin may hand out (no privilege escalation, enforced server-side too).
  const roleOptions: Option[] = (Object.keys(SYSTEM_ROLES) as SystemRoleKey[])
    .filter((key) => canGrantRoles(ctx, [key], []))
    .map((key) => ({
      value: key,
      label: SYSTEM_ROLES[key].label,
      description: SYSTEM_ROLES[key].description,
    }))
  const branchOptions: Option[] = branches.map((b) => ({
    value: b._id.toHexString(),
    label: b.name,
  }))
  const canInvite = can(ctx, "user:invite")
  const canManage = can(ctx, "user:manage")

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in to this organisation, and what they can do."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Users" }]}
        actions={canInvite && <InviteDialog roles={roleOptions} branches={branchOptions} />}
      />

      <PanelCard
        title="Members"
        description={`${members.length} ${members.length === 1 ? "person" : "people"}`}
      >
        <ul className="-mx-4 divide-y">
          {members.map((m) => (
            <li
              key={m._id.toHexString()}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {m.name}
                  {m.userId === ctx.actorId && (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  )}
                </p>
                <p className="truncate text-sm text-muted-foreground">{m.email}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.roles.map((r) => (
                  <Badge key={r} variant={r === "org_admin" ? "default" : "muted"}>
                    {roleLabel(r)}
                  </Badge>
                ))}
                {m.branchIds.map((b) => (
                  <Badge key={b.toHexString()} variant="outline">
                    {branchName.get(b.toHexString()) ?? "Branch"}
                  </Badge>
                ))}
                {m.status === "inactive" && <Badge variant="destructive">Inactive</Badge>}
              </div>
              {canManage && m.userId !== ctx.actorId && (
                <MemberActions
                  memberId={m._id.toHexString()}
                  name={m.name}
                  status={m.status}
                  current={{ roles: m.roles, branchIds: m.branchIds.map((b) => b.toHexString()) }}
                  roles={roleOptions}
                  branches={branchOptions}
                />
              )}
            </li>
          ))}
        </ul>
      </PanelCard>

      {invites.length > 0 && (
        <PanelCard
          className="mt-6"
          title="Pending invites"
          description="Links that haven't been used yet."
        >
          <ul className="-mx-4 divide-y">
            {invites.map((i) => (
              <li
                key={i._id.toHexString()}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.email}</p>
                  <p className="text-sm text-muted-foreground">
                    Expires {dateFormat.format(i.expiresAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {i.roles.map((r) => (
                    <Badge key={r} variant="muted">
                      {roleLabel(r)}
                    </Badge>
                  ))}
                </div>
                {canInvite && <RevokeInviteButton id={i._id.toHexString()} email={i.email} />}
              </li>
            ))}
          </ul>
        </PanelCard>
      )}
    </>
  )
}
