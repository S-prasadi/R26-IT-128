"use client";

import { useState, useMemo, useEffect } from "react";
import { Icon } from "@/components/piq/icon";
import { PiqBadge } from "@/components/piq/badge";
import { PiqBtn, PiqInput, PiqModal, PiqSpinner, ActionBtn } from "@/components/piq/primitives";
import { roleService } from "@/services/role.service";
import type { Role } from "@/types";

type Permission = { id: string; name: string; description: string; resource: string; action: string };

const PERMISSIONS: Permission[] = [
  { id:"1", name:"users:read",         description:"List and view users",         resource:"users",       action:"read"   },
  { id:"2", name:"users:write",        description:"Update user records",         resource:"users",       action:"write"  },
  { id:"3", name:"users:delete",       description:"Delete or deactivate users",  resource:"users",       action:"delete" },
  { id:"4", name:"roles:read",         description:"List and view roles",         resource:"roles",       action:"read"   },
  { id:"5", name:"roles:write",        description:"Create or update roles",      resource:"roles",       action:"write"  },
  { id:"6", name:"roles:delete",       description:"Delete roles",                resource:"roles",       action:"delete" },
  { id:"7", name:"permissions:read",   description:"List permissions",            resource:"permissions", action:"read"   },
  { id:"8", name:"permissions:assign", description:"Attach permissions to roles", resource:"permissions", action:"assign" },
];

const PERM_GROUPS: Record<string, { label: string; color: string; icon: string }> = {
  users:       { label:"Users",       color:"var(--accent)",  icon:"users"  },
  roles:       { label:"Roles",       color:"var(--violet)",  icon:"shield" },
  permissions: { label:"Permissions", color:"var(--teal)",    icon:"key"    },
};

function ActionIconBtn({ icon, color, onClick }: { icon: string; color: string; onClick: (e: React.MouseEvent) => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: 28, height: 28, borderRadius: "var(--radius)", border: `1px solid ${hov ? color + "66" : "var(--border)"}`, background: hov ? `${color}20` : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .12s" }}>
      <Icon n={icon} s={13} c={hov ? color : "var(--text3)"} />
    </button>
  );
}

export default function RolesPage() {
  const [roles, setRoles]           = useState<Role[]>([]);
  const [loading, setLoading]       = useState(true);
  const [apiError, setApiError]     = useState<string | null>(null);
  const [selected, setSelected]     = useState<string | null>(null);
  const [editOpen, setEditOpen]     = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Role | null>(null);
  const [toast, setToast]           = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  function loadRoles() {
    setLoading(true);
    roleService.getAll()
      .then((res) => setRoles(res.data.data.map((r) => ({ ...r, permissions: r.permissions ?? [] }))))
      .catch(() => setApiError("Failed to load roles. Check your connection or API configuration."))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadRoles(); }, []);

  const displayRole = roles.find((r) => r.id === selected) || roles[0] || null;

  const grouped = useMemo(() => {
    const g: Record<string, Permission[]> = {};
    for (const p of PERMISSIONS) { if (!g[p.resource]) g[p.resource] = []; g[p.resource].push(p); }
    return g;
  }, []);

  async function saveRole(updated: Role) {
    try {
      await roleService.update(updated.id, {
        name: updated.name,
        description: updated.description,
        permissions: updated.permissions,
      });
      setRoles((rs) => rs.map((r) => r.id === updated.id ? updated : r));
      setEditOpen(false);
      showToast("Role saved");
    } catch {
      showToast("Failed to save role");
    }
  }

  async function createRole(data: Omit<Role, "id" | "is_system">) {
    try {
      const res = await roleService.create({
        name: data.name,
        description: data.description,
        permissions: data.permissions,
      });
      setRoles((rs) => [...rs, res.data.data]);
      setCreateOpen(false);
      showToast("Role created");
    } catch {
      showToast("Failed to create role");
    }
  }

  async function deleteRole(id: string) {
    try {
      await roleService.delete(id);
      setRoles((rs) => rs.filter((r) => r.id !== id));
      if (selected === id) setSelected(null);
      setConfirmDel(null);
      showToast("Role deleted");
    } catch {
      showToast("Failed to delete role");
    }
  }

  function togglePerm(roleId: string, permName: string) {
    setRoles((rs) => rs.map((r) => {
      if (r.id !== roleId) return r;
      const perms = r.permissions ?? [];
      const updated = {
        ...r,
        permissions: perms.includes(permName)
          ? perms.filter((p) => p !== permName)
          : [...perms, permName],
      };
      roleService.update(roleId, { permissions: updated.permissions }).catch(() => {});
      return updated;
    }));
  }

  return (
    <div className="anim-up" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <PiqBtn icon="plus" onClick={() => setCreateOpen(true)}>New Role</PiqBtn>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: 56, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, background: "var(--surf)", borderRadius: "var(--radiusLg)", border: "1px solid var(--border)" }}>
          <PiqSpinner size={22} />
          <span style={{ fontSize: 15, color: "var(--text3)" }}>Loading roles…</span>
        </div>
      )}

      {/* Error */}
      {apiError && (
        <div style={{ padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", background: "var(--surf)", borderRadius: "var(--radiusLg)", border: "1px solid var(--border)" }}>
          <Icon n="alert" s={28} c="var(--rose)" />
          <div style={{ fontSize: 15, color: "var(--rose)", fontWeight: 500 }}>{apiError}</div>
          <PiqBtn variant="secondary" size="sm" icon="refresh" onClick={() => { setApiError(null); loadRoles(); }}>Retry</PiqBtn>
        </div>
      )}

      {!loading && !apiError && (
        <>
          {/* Role cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
            {roles.map((role) => {
              const active = displayRole?.id === role.id;
              return (
                <button key={role.id} onClick={() => setSelected(role.id)}
                  style={{ textAlign: "left", padding: "18px 20px", borderRadius: "var(--radiusLg)", cursor: "pointer", border: `1.5px solid ${active ? "var(--accent)" : "var(--border)"}`, background: active ? "var(--accentD)" : "var(--surf)", transition: "all .15s", fontFamily: "inherit" }}
                  onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.background = "var(--surf2)"; } }}
                  onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surf)"; } }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: active ? "var(--accent)" : "var(--surf3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon n="shield" s={17} c={active ? "white" : "var(--text3)"} />
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600, textTransform: "capitalize", color: active ? "var(--accent)" : "var(--text)" }}>{role.name}</div>
                        <div style={{ display: "flex", gap: 4, marginTop: 3 }}>{role.is_system && <PiqBadge label="system" variant="system" />}</div>
                      </div>
                    </div>
                    {!role.is_system && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <ActionIconBtn icon="edit"  color="var(--accent)" onClick={(e) => { e.stopPropagation(); setSelected(role.id); setEditOpen(true); }} />
                        <ActionIconBtn icon="trash" color="var(--rose)"   onClick={(e) => { e.stopPropagation(); setConfirmDel(role); }} />
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 14, color: "var(--text2)", lineHeight: 1.5, marginBottom: 12 }}>{role.description}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text3)" }}>
                    <span>{role.permissions.length} permission{role.permissions.length !== 1 ? "s" : ""}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          {displayRole && (
            <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, textTransform: "capitalize" }}>{displayRole.name}</span>
                    {displayRole.is_system && <PiqBadge label="system" variant="system" />}
                    <PiqBadge label={`${displayRole.permissions.length} permissions`} variant="default" />
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 3 }}>{displayRole.description}</div>
                </div>
                {!displayRole.is_system && (
                  <PiqBtn variant="secondary" size="sm" icon="edit" onClick={() => setEditOpen(true)}>Edit role</PiqBtn>
                )}
              </div>
              <div style={{ padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text2)", marginBottom: 14 }}>Permission matrix</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {Object.entries(grouped).map(([resource, perms]) => {
                    const grp = PERM_GROUPS[resource] || { label: resource, color: "var(--text2)", icon: "key" };
                    return (
                      <div key={resource}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <div style={{ width: 22, height: 22, borderRadius: 5, background: `oklch(from ${grp.color} l c h / 15%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Icon n={grp.icon} s={12} c={grp.color} />
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 600, color: grp.color, textTransform: "capitalize" }}>{grp.label}</span>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingLeft: 30 }}>
                          {perms.map((p) => {
                            const has = displayRole.permissions.includes(p.name);
                            return (
                              <button key={p.id} onClick={() => !displayRole.is_system && togglePerm(displayRole.id, p.name)} title={p.description}
                                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: "var(--radius)", border: `1px solid ${has ? grp.color + "50" : "var(--border)"}`, background: has ? `oklch(from ${grp.color} l c h / 12%)` : "transparent", color: has ? grp.color : "var(--text3)", fontSize: 14, fontWeight: 500, cursor: displayRole.is_system ? "default" : "pointer", transition: "all .12s", fontFamily: "inherit" }}>
                                {has ? <Icon n="check" s={12} c={grp.color} /> : <div style={{ width: 12, height: 12, borderRadius: 3, border: "1.5px solid var(--text3)" }} />}
                                {p.action}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {displayRole.is_system && (
                  <div style={{ marginTop: 16, padding: "10px 14px", background: "var(--amberD)", border: "1px solid var(--amber)30", borderRadius: "var(--radius)", fontSize: 14, color: "var(--amber)", display: "flex", gap: 8, alignItems: "center" }}>
                    <Icon n="lock" s={14} c="var(--amber)" />
                    System roles cannot be modified. Clone this role to create a customised variant.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Permissions reference table */}
          <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radiusLg)", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Permissions Reference</div>
              <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 2 }}>All available permissions in the system</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "10px 20px", textAlign: "left", fontSize: 13, fontWeight: 600, color: "var(--text3)", letterSpacing: "0.05em", minWidth: 200 }}>PERMISSION</th>
                    {roles.map((r) => (
                      <th key={r.id} style={{ padding: "10px 16px", textAlign: "center", fontSize: 13, fontWeight: 600, color: "var(--text3)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{r.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSIONS.map((p, i) => {
                    const grp = PERM_GROUPS[p.resource] || { color: "var(--text2)" };
                    return (
                      <tr key={p.id}
                        style={{ borderBottom: i < PERMISSIONS.length - 1 ? "1px solid var(--border)" : "none", transition: "background .1s" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surf2)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <td style={{ padding: "10px 20px" }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: grp.color }}>{p.name}</div>
                          <div style={{ fontSize: 13, color: "var(--text3)" }}>{p.description}</div>
                        </td>
                        {roles.map((r) => (
                          <td key={r.id} style={{ padding: "10px 16px", textAlign: "center" }}>
                            {r.permissions.includes(p.name)
                              ? <span style={{ color: "var(--green)", display: "inline-flex", justifyContent: "center" }}><Icon n="check" s={16} c="var(--green)" /></span>
                              : <span style={{ color: "var(--text3)", fontSize: 18, lineHeight: "1" }}>·</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {editOpen && displayRole && (
        <RoleFormModal role={displayRole} permissions={PERMISSIONS} grouped={grouped} onSave={saveRole} onClose={() => setEditOpen(false)} title={`Edit role — ${displayRole.name}`} />
      )}
      {createOpen && (
        <RoleFormModal role={null} permissions={PERMISSIONS} grouped={grouped} onSave={(d) => createRole(d as Omit<Role, "id" | "is_system">)} onClose={() => setCreateOpen(false)} title="Create new role" />
      )}
      <PiqModal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete role?"
        footer={<><PiqBtn variant="secondary" onClick={() => setConfirmDel(null)}>Cancel</PiqBtn><PiqBtn variant="danger" icon="trash" onClick={() => confirmDel && deleteRole(confirmDel.id)}>Delete role</PiqBtn></>}>
        <div style={{ fontSize: 15, color: "var(--text2)", lineHeight: 1.6 }}>
          Delete role <strong style={{ color: "var(--text)" }}>{confirmDel?.name}</strong>?
          Users assigned only this role will lose all associated permissions.
        </div>
      </PiqModal>

      {toast && (
        <div className="anim-up" style={{ position: "fixed", bottom: 24, right: 24, zIndex: 2000, background: "var(--greenD)", border: "1px solid var(--green)40", color: "var(--green)", padding: "10px 16px", borderRadius: "var(--radiusLg)", fontSize: 15, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon n="check" s={15} c="var(--green)" /> {toast}
        </div>
      )}
    </div>
  );
}

/* ─── Role Form Modal ─────────────────────────────────────────────────────── */
function RoleFormModal({ role, permissions, grouped, onSave, onClose, title }: {
  role: Role | null;
  permissions: Permission[];
  grouped: Record<string, Permission[]>;
  onSave: (r: Role) => void;
  onClose: () => void;
  title: string;
}) {
  const [form, setForm] = useState(role ? { ...role } : { id: "", name: "", description: "", is_system: false, permissions: [] as string[] });
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  function togglePerm(pname: string) {
    const has = form.permissions.includes(pname);
    set("permissions", has ? form.permissions.filter((p) => p !== pname) : [...form.permissions, pname]);
  }
  const valid = form.name.trim().length > 0;
  return (
    <PiqModal open width={560} title={title} onClose={onClose}
      footer={<><PiqBtn variant="secondary" onClick={onClose}>Cancel</PiqBtn><PiqBtn icon="check" disabled={!valid} onClick={() => onSave(form as Role)}>{role ? "Save changes" : "Create role"}</PiqBtn></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <PiqInput label="Role name" placeholder="e.g. analyst" icon="shield" value={form.name} onChange={(e) => set("name", e.target.value.toLowerCase().replace(/\s+/g, "-"))} required />
        <PiqInput label="Description" placeholder="What does this role allow?" icon="info" value={form.description} onChange={(e) => set("description", e.target.value)} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text2)", marginBottom: 10 }}>Permissions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Object.entries(grouped).map(([resource, perms]) => {
              const grp = PERM_GROUPS[resource] || { label: resource, color: "var(--text2)", icon: "key" };
              const allOn = perms.every((p) => form.permissions.includes(p.name));
              return (
                <div key={resource} style={{ background: "var(--surf2)", borderRadius: "var(--radius)", padding: "12px 14px", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <Icon n={grp.icon} s={13} c={grp.color} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: grp.color, textTransform: "capitalize" }}>{grp.label}</span>
                    </div>
                    <button onClick={() => {
                      if (allOn) set("permissions", form.permissions.filter((p) => !perms.map((x) => x.name).includes(p)));
                      else set("permissions", [...new Set([...form.permissions, ...perms.map((x) => x.name)])]);
                    }} style={{ fontSize: 12, color: "var(--text3)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                      {allOn ? "Remove all" : "Select all"}
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {perms.map((p) => {
                      const on = form.permissions.includes(p.name);
                      return (
                        <button key={p.id} onClick={() => togglePerm(p.name)} title={p.description}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: "var(--radius)", border: `1px solid ${on ? grp.color + "60" : "var(--border2)"}`, background: on ? `oklch(from ${grp.color} l c h / 15%)` : "transparent", color: on ? grp.color : "var(--text2)", fontSize: 14, cursor: "pointer", transition: "all .12s", fontFamily: "inherit" }}>
                          {on ? <Icon n="check" s={11} c={grp.color} /> : <div style={{ width: 11, height: 11, borderRadius: 3, border: "1.5px solid var(--text3)" }} />}
                          {p.action}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </PiqModal>
  );
}
