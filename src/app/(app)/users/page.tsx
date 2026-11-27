import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PanelCard } from "@/components/cards/panel-card"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { requireTenantContext } from "@/server/auth/session"
import { listBranches } from "@/server/modules/branches"
import { listInvites, listMembers } from "@/server/modules/members"
import { listCustomRoles } from "@/server/modules/roles"
import { can, canGrantRoles } from "@/server/rbac/ability"
import { roleLabel } from "@/server/rbac/labels"
import { CONFIGURABLE_MENUS, MENU_KEYS } from "@/server/rbac/menus"
import { ALL_PERMISSIONS, SYSTEM_ROLES, type SystemRoleKey } from "@/server/rbac/permissions"
import { CreateRoleDialog, CustomRoleActions } from "./role-dialogs"
import { AddUserDialog, MemberActions, RevokeInviteButton, type Option } from "./user-dialogs"

export const metadata: Metadata = { title: "Users · QR Feed" }

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" })

export default async function UsersPage() {
  const ctx = await requireTenantContext()
  if (!can(ctx, "user:read")) redirect("/dashboard")

  const [members, invites, branches, customRoles] = await Promise.all([
    listMembers(ctx),
    listInvites(ctx),
    can(ctx, "branch:read") ? listBranches(ctx) : [],
    listCustomRoles(ctx),
  ])
  const branchName = new Map(branches.map((b) => [b._id.toHexString(), b.name]))
  const customRoleNames = new Map(customRoles.map((r) => [r._id.toHexString(), r.name]))

  // Offer only roles this admin may hand out (no privilege escalation, enforced server-side too).
  const systemOptions: Option[] = (Object.keys(SYSTEM_ROLES) as SystemRoleKey[])
    .filter((key) => canGrantRoles(ctx, [key], customRoles))
    .map((key) => ({
      value: key,
      label: SYSTEM_ROLES[key].label,
      description: SYSTEM_ROLES[key].description,
    }))
  const customOptions: Option[] = customRoles
    .filter((r) => canGrantRoles(ctx, [`custom:${r._id.toHexString()}`], customRoles))
    .map((r) => ({
      value: `custom:${r._id.toHexString()}`,
      label: `${r.name} (custom)`,
      description: r.description || `${r.permissions.length} permissions · ${r.scope} scope`,
    }))
  const roleOptions: Option[] = [...systemOptions, ...customOptions]

  const branchOptions: Option[] = branches.map((b) => ({
    value: b._id.toHexString(),
    label: b.name,
  }))
  const menuOptions: Option[] = CONFIGURABLE_MENUS.map((m) => ({
    value: m.key,
    label: m.label,
    description: m.group,
  }))
  const menuLabel = new Map<string, string>(CONFIGURABLE_MENUS.map((m) => [m.key, m.label]))

  const grantablePermissions: Option[] = ALL_PERMISSIONS.filter((p) => ctx.permissions.has(p)).map(
    (p) => ({ value: p, label: p }),
  )

  const canInvite = can(ctx, "user:invite")
  const canManage = can(ctx, "user:manage")
  const canManageRoles = can(ctx, "role:manage")

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in to this organisation, and what they can do."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Users" }]}
        actions={
          <>
            {canManageRoles && (
              <CreateRoleDialog
                permissions={grantablePermissions}
                allowTenantScope={ctx.branchScope === "all"}
              />
            )}
            {canInvite && (
              <AddUserDialog roles={roleOptions} branches={branchOptions} menus={menuOptions} />
            )}
          </>
        }
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
                <p className="truncate text-sm text-muted-foreground">
                  {m.email}
                  {m.phone ? ` · ${m.phone}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.roles.map((r) => (
                  <Badge key={r} variant={r === "org_admin" ? "default" : "muted"}>
                    {roleLabel(r, customRoleNames)}
                  </Badge>
                ))}
                {m.branchIds.map((b) => (
                  <Badge key={b.toHexString()} variant="outline">
                    {branchName.get(b.toHexString()) ?? "Branch"}
                  </Badge>
                ))}
                {m.menus && (
                  <Badge
                    variant="info"
                    title={`Menus: ${["Dashboard", ...m.menus.map((k) => menuLabel.get(k) ?? k)].join(", ")}`}
                  >
                    {m.menus.length === 0
                      ? "Dashboard only"
                      : `${m.menus.length} ${m.menus.length === 1 ? "menu" : "menus"}`}
                  </Badge>
                )}
                {m.status === "inactive" && <Badge variant="destructive">Inactive</Badge>}
              </div>
              {canManage &&
                m.userId !== ctx.actorId &&
                canGrantRoles(ctx, m.roles, customRoles) && (
                  <MemberActions
                    memberId={m._id.toHexString()}
                    name={m.name}
                    status={m.status}
                    current={{
                      roles: m.roles,
                      branchIds: m.branchIds.map((b) => b.toHexString()),
                      phone: m.phone ?? "",
                      menus: m.menus ?? MENU_KEYS,
                    }}
                    roles={roleOptions}
                    branches={branchOptions}
                    menus={menuOptions}
                  />
                )}
            </li>
          ))}
        </ul>
      </PanelCard>

      {(customRoles.length > 0 || canManageRoles) && (
        <PanelCard
          className="mt-6"
          title="Custom roles"
          description="Permission bundles tailored to your departments and shifts."
        >
          {customRoles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No custom roles yet. System roles cover Org Admin, Branch Admin, Dept Manager, L1–L3,
              Verifier and Auditor.
            </p>
          ) : (
            <ul className="-mx-4 divide-y">
              {customRoles.map((r) => (
                <li
                  key={r._id.toHexString()}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.description || `${r.permissions.length} permissions`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="capitalize">
                      {r.scope} scope
                    </Badge>
                    <Badge variant="muted" className="tabular-nums">
                      {r.permissions.length} perms
                    </Badge>
                  </div>
                  {canManageRoles && (
                    <CustomRoleActions
                      role={{
                        id: r._id.toHexString(),
                        name: r.name,
                        description: r.description ?? "",
                        scope: r.scope,
                        permissions: r.permissions,
                      }}
                      permissions={grantablePermissions}
                      allowTenantScope={ctx.branchScope === "all"}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      )}

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
                      {roleLabel(r, customRoleNames)}
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
