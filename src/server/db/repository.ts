import "server-only"
import {
  ObjectId,
  type ClientSession,
  type Collection,
  type Document,
  type Filter,
  type OptionalUnlessRequiredId,
  type Sort,
  type UpdateFilter,
} from "mongodb"
import { ApiError, type PageMeta } from "@/lib/api/errors"
import { pageMeta } from "@/lib/api/response"
import { db } from "@/server/db/client"
import { inBranchScope, type TenantContext } from "@/server/db/tenant-context"

/** Fields every tenant document carries. The repository owns them; callers never set them. */
export type TenantDoc = { _id: ObjectId; tenantId: ObjectId; createdAt: Date; updatedAt: Date }
export type NewDoc<T extends TenantDoc> = Omit<T, keyof TenantDoc> & { _id?: ObjectId }
type Opts = { session?: ClientSession }

export type ScopedRepository<T extends TenantDoc> = {
  find(filter: Filter<T>, opts?: Opts & { sort?: Sort; limit?: number }): Promise<T[]>
  findOne(filter: Filter<T>, opts?: Opts & { sort?: Sort }): Promise<T | null>
  findById(id: ObjectId | string, opts?: Opts): Promise<T | null>
  count(filter: Filter<T>, opts?: Opts): Promise<number>
  paginate(
    filter: Filter<T>,
    opts: Opts & { page?: number; pageSize?: number; sort?: Sort },
  ): Promise<{ items: T[]; meta: PageMeta }>
  insertOne(doc: NewDoc<T>, opts?: Opts): Promise<T>
  /** Returns the updated document, or null when nothing in scope matched. */
  updateOne(filter: Filter<T>, update: UpdateFilter<T>, opts?: Opts): Promise<T | null>
  /** Returns how many documents in scope matched. */
  updateMany(filter: Filter<T>, update: UpdateFilter<T>, opts?: Opts): Promise<number>
  deleteOne(filter: Filter<T>, opts?: Opts): Promise<boolean>
}

export type Repository<T extends TenantDoc> = {
  name: string
  /** False for append-only collections such as the audit log. */
  writable: boolean
  forTenant(ctx: TenantContext): ScopedRepository<T>
  /**
   * The raw collection, for the few cross-tenant lookups that resolve a tenant in the first
   * place (invite tokens, QR codes) and for index setup. Never use it with user input
   * as the tenant.
   */
  unscoped(): Collection<T>
}

const registry = new Map<string, Repository<TenantDoc>>()

/** Every repository, so the isolation suite can prove each one is covered. */
export function registeredRepositories(): ReadonlyMap<string, Repository<TenantDoc>> {
  return registry
}

const UPDATE_OPERATORS_THAT_WRITE = [
  "$set",
  "$setOnInsert",
  "$unset",
  "$inc",
  "$mul",
  "$rename",
  "$min",
  "$max",
  "$push",
  "$addToSet",
  "$pull",
  "$pop",
  "$currentDate",
]

function touchedKeys(update: Document): string[] {
  const keys: string[] = []
  for (const [op, value] of Object.entries(update)) {
    if (!op.startsWith("$")) throw new Error("Replacement updates are not allowed; use operators.")
    if (UPDATE_OPERATORS_THAT_WRITE.includes(op) && value && typeof value === "object") {
      keys.push(...Object.keys(value))
    }
  }
  return keys
}

export function defineRepository<T extends TenantDoc>(
  name: string,
  {
    branchField,
    appendOnly = false,
    register = true,
  }: {
    /** Which field holds the branch. `_id` for the branches collection itself. */
    branchField?: "branchId" | "_id"
    appendOnly?: boolean
    /** Tests define throwaway repositories that the isolation suite should not demand. */
    register?: boolean
  } = {},
): Repository<T> {
  const collection = () => db().collection<T>(name)

  const repo: Repository<T> = {
    name,
    writable: !appendOnly,
    unscoped: collection,

    forTenant(ctx) {
      const scope = (filter: Filter<T> = {}): Filter<T> => {
        const parts: Document[] = [filter, { tenantId: ctx.tenantId }]
        if (branchField && ctx.branchScope !== "all") {
          parts.push({ [branchField]: { $in: ctx.branchScope } })
        }
        // $and means nothing in the caller's filter can widen or replace the tenant clause.
        return { $and: parts } as Filter<T>
      }

      const assertBranch = (branchId: unknown) => {
        if (!branchField) return
        if (!(branchId instanceof ObjectId) || !inBranchScope(ctx.branchScope, branchId)) {
          throw new ApiError("FORBIDDEN", "You don't have access to that branch.")
        }
      }

      const assertWritable = () => {
        if (appendOnly) throw new Error(`${name} is append-only: entries can't be changed.`)
      }

      const guardUpdate = (update: UpdateFilter<T>): UpdateFilter<T> => {
        assertWritable()
        const keys = touchedKeys(update)
        if (keys.some((k) => k === "tenantId" || k.startsWith("tenantId."))) {
          throw new Error("tenantId can't be changed.")
        }
        if (keys.some((k) => k === "_id" || k === "createdAt")) {
          throw new Error("_id and createdAt can't be changed.")
        }
        if (branchField === "branchId" && keys.includes("branchId")) {
          const value = (update.$set as Document | undefined)?.branchId
          if (ctx.branchScope !== "all" && !(value && inBranchScope(ctx.branchScope, value))) {
            throw new ApiError("FORBIDDEN", "You can't move records to a branch you can't access.")
          }
        }
        return {
          ...update,
          $set: { ...(update.$set as Document), updatedAt: new Date() },
        } as UpdateFilter<T>
      }

      return {
        find: (filter, opts = {}) => {
          const cursor = collection().find(scope(filter), { session: opts.session })
          if (opts.sort) cursor.sort(opts.sort)
          if (opts.limit) cursor.limit(opts.limit)
          return cursor.toArray() as Promise<T[]>
        },

        findOne: (filter, opts = {}) =>
          collection().findOne(scope(filter), {
            session: opts.session,
            sort: opts.sort,
          }) as Promise<T | null>,

        findById: async (id, opts = {}) => {
          if (typeof id === "string" && !ObjectId.isValid(id)) return null
          const _id = typeof id === "string" ? new ObjectId(id) : id
          return collection().findOne(scope({ _id } as Filter<T>), {
            session: opts.session,
          }) as Promise<T | null>
        },

        count: (filter, opts = {}) =>
          collection().countDocuments(scope(filter), { session: opts.session }),

        paginate: async (filter, { page = 1, pageSize = 20, sort, session } = {}) => {
          const safePage = Math.max(1, Math.floor(page))
          const size = Math.min(100, Math.max(1, Math.floor(pageSize)))
          const [items, total] = await Promise.all([
            collection()
              .find(scope(filter), { session })
              .sort(sort ?? { _id: -1 })
              .skip((safePage - 1) * size)
              .limit(size)
              .toArray() as Promise<T[]>,
            collection().countDocuments(scope(filter), { session }),
          ])
          return { items, meta: pageMeta({ total, page: safePage, pageSize: size }) }
        },

        insertOne: async (doc, opts = {}) => {
          if ("tenantId" in doc) throw new Error("tenantId is set by the repository, not callers.")
          const now = new Date()
          const full = {
            _id: new ObjectId(),
            ...doc,
            tenantId: ctx.tenantId,
            createdAt: now,
            updatedAt: now,
          }
          if (branchField === "_id" && ctx.branchScope !== "all") {
            throw new ApiError("FORBIDDEN", "Only tenant-wide admins can create branches.")
          }
          if (branchField === "branchId") assertBranch((full as Document).branchId)
          await collection().insertOne(full as OptionalUnlessRequiredId<T>, {
            session: opts.session,
          })
          return full as unknown as T
        },

        updateOne: async (filter, update, opts = {}) =>
          collection().findOneAndUpdate(scope(filter), guardUpdate(update), {
            session: opts.session,
            returnDocument: "after",
          }) as Promise<T | null>,

        updateMany: async (filter, update, opts = {}) => {
          const res = await collection().updateMany(scope(filter), guardUpdate(update), {
            session: opts.session,
          })
          return res.matchedCount
        },

        deleteOne: async (filter, opts = {}) => {
          assertWritable()
          const res = await collection().deleteOne(scope(filter), { session: opts.session })
          return res.deletedCount === 1
        },
      }
    },
  }

  if (register) registry.set(name, repo as unknown as Repository<TenantDoc>)
  return repo
}
