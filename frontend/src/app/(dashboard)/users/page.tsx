"use client";

import { useState, useMemo, useEffect } from "react";
import { Icon } from "@/components/piq/icon";
import { PiqAvatar } from "@/components/piq/avatar";
import { PiqBadge } from "@/components/piq/badge";
import { PiqBtn, PiqInput, PiqModal, PiqToggle, PiqSpinner, ActionBtn, PageBtn } from "@/components/piq/primitives";
import { userService } from "@/services/user.service";

type PageUser = {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  roles: string[];
  created_at: string;
};

type ApiUserShape = {
  id: string;
  name?: string;
  full_name?: string;
  email: string;
  role?: string;
  roles?: string[];
  is_active?: boolean;
  createdAt?: string;
  created_at?: string;
};

function mapApiUser(u: ApiUserShape): PageUser {
  return {
    id: u.id,
    full_name: u.full_name ?? u.name ?? u.email,
    email: u.email,
    is_active: u.is_active ?? true,
    roles: u.roles ?? (u.role ? [u.role] : ["user"]),
    created_at: u.created_at ?? u.createdAt ?? new Date().toISOString(),
  };
}

const STATIC_ROLES = [
  { id: "1", name: "admin",   description: "Full system access — all permissions granted",       is_system: true  },
  { id: "2", name: "manager", description: "Read-only access to users, roles and permissions",   is_system: false },
  { id: "3", name: "user",    description: "Default role for newly registered students",          is_system: true  },
];

const PER_PAGE = 8;

export default function UsersPage() {
  const [users, setUsers]           = useState<PageUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [apiError, setApiError]     = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  const [roleF, setRoleF]           = useState("all");
  const [statusF, setStatusF]       = useState("all");
  const [page, setPage]             = useState(1);
  const [editUser, setEditUser]       = useState<PageUser | null>(null);
  const [addOpen, setAddOpen]         = useState(false);
  const [inviteStaffOpen, setInviteStaffOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<PageUser | null>(null);
  const [toast, setToast]           = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  useEffect(() => {
    setLoading(true);
    userService.getAll()
      .then((res) => {
        const d = res.data.data as { items?: ApiUserShape[] } | ApiUserShape[];
        const items = Array.isArray(d) ? d : (d.items ?? []);
        setUsers(items.map(mapApiUser));
      })
      .catch(() => setApiError("Failed to load users. Check your connection or API configuration."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => users.filter((u) => {
    const q = search.toLowerCase();
    return (!q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      && (roleF === "all" || u.roles.includes(roleF))
      && (statusF === "all" || (statusF === "active" ? u.is_active : !u.is_active));
  }), [users, search, roleF, statusF]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  async function toggleActive(id: string) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    try {
      await userService.update(id, { is_active: !u.is_active } as never);
      setUsers((us) => us.map((x) => x.id === id ? { ...x, is_active: !x.is_active } : x));
      showToast("User status updated");
    } catch {
      showToast("Failed to update user status");
    }
  }

  async function deleteUser(id: string) {
    try {
      await userService.delete(id);
      setUsers((us) => us.filter((u) => u.id !== id));
      setConfirmDel(null);
      showToast("User removed");
    } catch {
      showToast("Failed to delete user");
    }
  }

  async function saveEdit(updated: PageUser) {
    try {
      await userService.update(updated.id, {
        name: updated.full_name,
        role: updated.roles[0],
        is_active: updated.is_active,
      } as never);
      setUsers((us) => us.map((u) => u.id === updated.id ? updated : u));
      setEditUser(null);
      showToast("User saved");
    } catch {
      showToast("Failed to save user");
    }
  }

  async function addUser(data: Omit<PageUser, "id" | "created_at" | "is_active">) {
    try {
      const res = await userService.create({
        full_name: data.full_name,
        email: data.email,
        role: data.roles[0] ?? "user",
      });
      const created = mapApiUser(res.data.data as ApiUserShape);
      setUsers((us) => [created, ...us]);
      setAddOpen(false);
      showToast("User created");
    } catch {
      showToast("Failed to create user");
    }
  }

  const selectStyle = {
    padding: "8px 30px 8px 12px", background: "var(--surf)", border: "1px solid var(--border2)",
    borderRadius: "var(--radius)", color: "var(--text)", fontSize: 15, fontFamily: "inherit",
    cursor: "pointer", outline: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat" as const, backgroundPosition: "right 8px center",
  };

  return (
    <div className="anim-up" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px" }}>
          <Icon n="search" s={15} c="var(--text3)" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            placeholder="Search users…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: "100%", padding: "8px 12px 8px 34px", background: "var(--surf)", border: "1px solid var(--border2)", borderRadius: "var(--radius)", color: "var(--text)", fontSize: 15, fontFamily: "inherit", outline: "none" }}
          />
        </div>
        <select value={roleF} onChange={(e) => { setRoleF(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="all">All roles</option>
          {STATIC_ROLES.map((r) => <option key={r.id} value={r.name}>{r.name.charAt(0).toUpperCase() + r.name.slice(1)}</option>)}
        </select>
        <select value={statusF} onChange={(e) => { setStatusF(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <PiqBtn variant="secondary" icon="shield" onClick={() => setInviteStaffOpen(true)}>Invite Staff</PiqBtn>
          <PiqBtn icon="plus" onClick={() => setAddOpen(true)}>Invite User</PiqBtn>
        </div>
      </div>

      {/* Summary chips */}
      {!loading && !apiError && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "var(--text3)" }}>{filtered.length} user{filtered.length !== 1 ? "s" : ""}</span>
          {search && <PiqBadge label={`"${search}"`} variant="default" />}
          {roleF !== "all" && <PiqBadge label={roleF} variant={roleF} />}
          {statusF !== "all" && <PiqBadge label={statusF} variant={statusF} />}
          {(search || roleF !== "all" || statusF !== "all") && (
            <button onClick={() => { setSearch(""); setRoleF("all"); setStatusF("all"); }}
              style={{ fontSize: 13, color: "var(--text3)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
        {loading && (
          <div style={{ padding: 56, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <PiqSpinner size={22} />
            <span style={{ fontSize: 15, color: "var(--text3)" }}>Loading users…</span>
          </div>
        )}

        {apiError && (
          <div style={{ padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
            <Icon n="alert" s={28} c="var(--rose)" />
            <div style={{ fontSize: 15, color: "var(--rose)", fontWeight: 500 }}>{apiError}</div>
            <PiqBtn variant="secondary" size="sm" icon="refresh" onClick={() => {
              setApiError(null);
              setLoading(true);
              userService.getAll()
                .then((res) => setUsers((res.data.data as ApiUserShape[]).map(mapApiUser)))
                .catch(() => setApiError("Failed to load users."))
                .finally(() => setLoading(false));
            }}>Retry</PiqBtn>
          </div>
        )}

        {!loading && !apiError && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["User", "Roles", "Status", "Joined", "Actions"].map((h, i) => (
                  <th key={h} style={{ padding: "11px 18px", textAlign: i === 4 ? "right" : "left", fontSize: 13, fontWeight: 600, color: "var(--text3)", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--text3)", fontSize: 15 }}>No users found</td></tr>
              )}
              {paged.map((u, i) => (
                <tr key={u.id}
                  style={{ borderBottom: i < paged.length - 1 ? "1px solid var(--border)" : "none", transition: "background .1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surf2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "13px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      <PiqAvatar name={u.full_name} size={34} />
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 500 }}>{u.full_name}</div>
                        <div style={{ fontSize: 13, color: "var(--text3)" }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "13px 18px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {u.roles.map((r) => <PiqBadge key={r} label={r} variant={r} />)}
                      {u.roles.length === 0 && <span style={{ fontSize: 13, color: "var(--text3)" }}>—</span>}
                    </div>
                  </td>
                  <td style={{ padding: "13px 18px" }}>
                    <PiqBadge label={u.is_active ? "Active" : "Inactive"} variant={u.is_active ? "active" : "inactive"} dot />
                  </td>
                  <td style={{ padding: "13px 18px", fontSize: 14, color: "var(--text2)", whiteSpace: "nowrap" }}>
                    {new Date(u.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td style={{ padding: "13px 18px" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <ActionBtn icon="edit"  title="Edit user"   color="var(--accent)" onClick={() => setEditUser({ ...u })} />
                      <ActionBtn icon={u.is_active ? "close" : "check"} title={u.is_active ? "Deactivate" : "Activate"} color={u.is_active ? "var(--amber)" : "var(--green)"} onClick={() => toggleActive(u.id)} />
                      <ActionBtn icon="trash" title="Delete user" color="var(--rose)"   onClick={() => setConfirmDel(u)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {!loading && !apiError && totalPages > 1 && (
          <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, color: "var(--text3)" }}>Page {page} of {totalPages} · {filtered.length} users</span>
            <div style={{ display: "flex", gap: 4 }}>
              <PageBtn label="←" disabled={page === 1} onClick={() => setPage((p) => p - 1)} />
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <PageBtn key={n} label={n} active={n === page} onClick={() => setPage(n)} />
              ))}
              <PageBtn label="→" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} />
            </div>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {editUser && <EditUserModal user={editUser} roles={STATIC_ROLES} onSave={saveEdit} onClose={() => setEditUser(null)} />}

      {/* Add User Modal */}
      {addOpen && <AddUserModal roles={STATIC_ROLES} onAdd={addUser} onClose={() => setAddOpen(false)} />}

      {/* Invite Staff Modal */}
      {inviteStaffOpen && <InviteStaffModal onAdd={addUser} onClose={() => setInviteStaffOpen(false)} />}

      {/* Confirm Delete */}
      <PiqModal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete user?"
        footer={<><PiqBtn variant="secondary" onClick={() => setConfirmDel(null)}>Cancel</PiqBtn><PiqBtn variant="danger" icon="trash" onClick={() => confirmDel && deleteUser(confirmDel.id)}>Delete permanently</PiqBtn></>}>
        <div style={{ fontSize: 15, color: "var(--text2)", lineHeight: 1.6 }}>
          Are you sure you want to permanently delete <strong style={{ color: "var(--text)" }}>{confirmDel?.full_name}</strong>?<br />
          This removes their auth record and all associated data. This action cannot be undone.
        </div>
      </PiqModal>

      {/* Toast */}
      {toast && (
        <div className="anim-up" style={{ position: "fixed", bottom: 24, right: 24, zIndex: 2000, background: "var(--greenD)", border: "1px solid var(--green)40", color: "var(--green)", padding: "10px 16px", borderRadius: "var(--radiusLg)", fontSize: 15, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon n="check" s={15} c="var(--green)" /> {toast}
        </div>
      )}
    </div>
  );
}

/* ─── Sub-modals ──────────────────────────────────────────────────────────── */
function EditUserModal({ user, roles, onSave, onClose }: { user: PageUser; roles: typeof STATIC_ROLES; onSave: (u: PageUser) => void; onClose: () => void }) {
  const [form, setForm] = useState({ ...user });
  const set = (k: keyof PageUser, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  function toggleRole(rname: string) {
    const has = form.roles.includes(rname);
    set("roles", has ? form.roles.filter((r) => r !== rname) : [...form.roles, rname]);
  }
  return (
    <PiqModal open title={`Edit — ${user.full_name}`} onClose={onClose}
      footer={<><PiqBtn variant="secondary" onClick={onClose}>Cancel</PiqBtn><PiqBtn icon="check" onClick={() => onSave(form)}>Save changes</PiqBtn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--surf2)", borderRadius: "var(--radius)" }}>
          <PiqAvatar name={user.full_name} size={40} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{user.full_name}</div>
            <div style={{ fontSize: 14, color: "var(--text3)" }}>{user.email}</div>
          </div>
        </div>
        <PiqInput label="Full name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} icon="person" />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--surf2)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Account active</div>
            <div style={{ fontSize: 13, color: "var(--text3)" }}>Inactive users cannot sign in</div>
          </div>
          <PiqToggle value={form.is_active} onChange={(v) => set("is_active", v)} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text2)" }}>Assigned roles</div>
          {roles.map((r) => (
            <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--surf2)", borderRadius: "var(--radius)", border: `1px solid ${form.roles.includes(r.name) ? "var(--accent)30" : "var(--border)"}`, cursor: "pointer" }}>
              <input type="checkbox" checked={form.roles.includes(r.name)} onChange={() => toggleRole(r.name)} style={{ accentColor: "var(--accent)", width: 14, height: 14 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <PiqBadge label={r.name} variant={r.name} />
                  {r.is_system && <PiqBadge label="system" variant="system" />}
                </div>
                <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 3 }}>{r.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </PiqModal>
  );
}

function InviteStaffModal({ onAdd, onClose }: { onAdd: (d: Omit<PageUser, "id" | "created_at" | "is_active">) => void; onClose: () => void }) {
  const [form, setForm] = useState({ full_name: "", email: "", role: "admin" as "admin" | "manager" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.full_name.trim() && form.email.includes("@");

  const ALL_PERMISSIONS = ["users:read","users:write","users:delete","roles:read","roles:write","roles:delete","permissions:read","permissions:assign"];
  const managerPerms    = ["users:read","roles:read","permissions:read"];
  const perms = form.role === "admin" ? ALL_PERMISSIONS : managerPerms;

  return (
    <PiqModal open title="Invite Staff Member" onClose={onClose}
      footer={<><PiqBtn variant="secondary" onClick={onClose}>Cancel</PiqBtn><PiqBtn icon="shield" disabled={!valid} onClick={() => onAdd({ full_name: form.full_name, email: form.email, roles: [form.role] })}>Create staff account</PiqBtn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ padding: "10px 14px", background: "var(--violetD)", border: "1px solid oklch(65% 0.17 290 / 20%)", borderRadius: "var(--radius)", fontSize: 13, color: "var(--violet)", display: "flex", gap: 8, alignItems: "center" }}>
          <Icon n="shield" s={14} c="var(--violet)" style={{ flexShrink: 0 }} />
          Staff accounts have elevated access. Only invite trusted personnel.
        </div>

        <PiqInput label="Full name" placeholder="e.g. Dr. Chaminda Perera" icon="person" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required />
        <PiqInput label="Email address" type="email" placeholder="name@sliit.lk" icon="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />

        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text2)", marginBottom: 8 }}>Staff role</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["admin", "manager"] as const).map((r) => (
              <button key={r} onClick={() => set("role", r)} type="button"
                style={{ flex: 1, padding: "10px 14px", borderRadius: "var(--radius)", border: `1.5px solid ${form.role === r ? "var(--violet)" : "var(--border2)"}`, background: form.role === r ? "var(--violetD)" : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const, transition: "all .12s" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: form.role === r ? "var(--violet)" : "var(--text)", textTransform: "capitalize", marginBottom: 2 }}>{r}</div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>
                  {r === "admin" ? "Full access — all 8 permissions" : "Read-only — users, roles, permissions"}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: "var(--surf2)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "12px 14px" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text2)", marginBottom: 8 }}>Permissions granted ({perms.length})</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {perms.map((p) => (
              <span key={p} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 99, background: "oklch(65% 0.17 290 / 12%)", color: "var(--violet)", border: "1px solid oklch(65% 0.17 290 / 20%)", fontWeight: 500 }}>{p}</span>
            ))}
          </div>
        </div>
      </div>
    </PiqModal>
  );
}

function AddUserModal({ roles, onAdd, onClose }: { roles: typeof STATIC_ROLES; onAdd: (d: Omit<PageUser, "id" | "created_at" | "is_active">) => void; onClose: () => void }) {
  const [form, setForm] = useState({ full_name: "", email: "", roles: ["user"] });
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  function toggleRole(rname: string) {
    const has = form.roles.includes(rname);
    set("roles", has ? form.roles.filter((r) => r !== rname) : [...form.roles, rname]);
  }
  const valid = form.full_name.trim() && form.email.includes("@");
  return (
    <PiqModal open title="Invite new user" onClose={onClose}
      footer={<><PiqBtn variant="secondary" onClick={onClose}>Cancel</PiqBtn><PiqBtn icon="plus" disabled={!valid} onClick={() => onAdd(form)}>Create user</PiqBtn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <PiqInput label="Full name" placeholder="e.g. Tharushi Bandara" icon="person" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required />
        <PiqInput label="Email address" type="email" placeholder="name@students.sliit.lk" icon="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text2)" }}>Assign roles</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {roles.map((r) => {
              const on = form.roles.includes(r.name);
              return (
                <button key={r.id} onClick={() => toggleRole(r.name)} type="button"
                  style={{ padding: "5px 12px", borderRadius: 99, fontSize: 14, fontWeight: 500, cursor: "pointer", border: `1.5px solid ${on ? "var(--accent)" : "var(--border2)"}`, background: on ? "var(--accentD)" : "transparent", color: on ? "var(--accent)" : "var(--text2)", transition: "all .12s", fontFamily: "inherit" }}>
                  {r.name}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ padding: "10px 12px", background: "var(--amberD)", border: "1px solid var(--amber)30", borderRadius: "var(--radius)", fontSize: 13, color: "var(--amber)", display: "flex", gap: 8 }}>
          <Icon n="info" s={14} c="var(--amber)" style={{ flexShrink: 0, marginTop: 1 }} />
          An invitation email will be sent. The user sets their own password on first login.
        </div>
      </div>
    </PiqModal>
  );
}
