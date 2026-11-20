"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Building2,
  ClipboardCheck,
  KeyRound,
  MailPlus,
  Monitor,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import Navbar from "../../components/Navbar";
import { useAuth } from "../../components/AuthProvider";

type Tab =
  | "overview"
  | "departments"
  | "branches"
  | "approvals"
  | "sessions"
  | "attempts"
  | "audit"
  | "policies"
  | "invitations";
type AnyRow = Record<string, any>;
const tabs: { id: Tab; label: string; icon: any }[] = [
  { id: "overview", label: "Panel general", icon: ShieldCheck },
  { id: "departments", label: "Departamentos y cargos", icon: Building2 },
  { id: "branches", label: "Sucursales y accesos", icon: Users },
  { id: "approvals", label: "Aprobaciones", icon: ClipboardCheck },
  { id: "sessions", label: "Sesiones", icon: Monitor },
  { id: "attempts", label: "Intentos de acceso", icon: KeyRound },
  { id: "audit", label: "Auditoría", icon: Activity },
  { id: "policies", label: "Políticas", icon: KeyRound },
  { id: "invitations", label: "Invitaciones", icon: MailPlus },
];
const initialPolicy = {
  min_password_length: 10,
  max_login_attempts: 5,
  lockout_minutes: 15,
  session_hours: 12,
  require_mfa: false,
};

export default function SecurityPage() {
  const { user, token, isLoading } = useAuth(),
    router = useRouter();
  const [tab, setTab] = useState<Tab>("overview"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [users, setUsers] = useState<AnyRow[]>([]),
    [roles, setRoles] = useState<AnyRow[]>([]),
    [departments, setDepartments] = useState<AnyRow[]>([]),
    [branches, setBranches] = useState<AnyRow[]>([]),
    [sessions, setSessions] = useState<AnyRow[]>([]),
    [attempts, setAttempts] = useState<AnyRow[]>([]),
    [audit, setAudit] = useState<AnyRow[]>([]),
    [workflows, setWorkflows] = useState<AnyRow[]>([]),
    [requests, setRequests] = useState<AnyRow[]>([]),
    [invitations, setInvitations] = useState<AnyRow[]>([]),
    [policy, setPolicy] = useState(initialPolicy);
  const [departmentForm, setDepartmentForm] = useState({
      name: "",
      description: "",
    }),
    [position, setPosition] = useState({ department_id: "", name: "" }),
    [workflowForm, setWorkflowForm] = useState({
      name: "",
      module: "imports",
      operation: "settlement",
      amount_threshold: 0,
      approver_role: "gerente_general",
      require_distinct_actor: true,
    }),
    [requestForm, setRequestForm] = useState({
      workflow_id: "",
      record_type: "",
      record_id: "",
      amount: 0,
      reason: "",
    }),
    [inviteForm, setInviteForm] = useState({ email: "", role_key: "user" }),
    [inviteLink, setInviteLink] = useState("");
  const canAdmin = Boolean(
    user?.roles?.some((role) => ["admin", "erp_admin"].includes(role)) ||
    user?.role === "admin",
  );
  const headers = {
    Authorization: `Bearer ${token || ""}`,
    "Content-Type": "application/json",
  };
  const fetchJson = useCallback(
    async (path: string, options?: RequestInit) => {
      const response = await fetch(`/api${path}`, {
        ...options,
        headers: { ...headers, ...options?.headers },
      });
      const raw = await response.text();
      let body: AnyRow = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = { message: raw.slice(0, 240) };
      }
      if (!response.ok) {
        const detail = Array.isArray(body.message)
          ? body.message.join(", ")
          : body.message;
        throw new Error(
          detail ||
            `El servidor respondió ${response.status} al consultar ${path}.`,
        );
      }
      return body;
    },
    [token],
  );
  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const pairs = await Promise.allSettled([
        fetchJson("/users"),
        fetchJson("/company/roles/catalog"),
        fetchJson("/security/departments"),
        fetchJson("/security/branches"),
        fetchJson("/security/sessions"),
        fetchJson("/security/login-attempts?limit=200"),
        fetchJson("/security/audit?limit=100"),
        fetchJson("/security/approval-workflows"),
        fetchJson("/security/approval-requests"),
        fetchJson("/security/invitations"),
        fetchJson("/security/policy"),
      ]);
      const put = (index: number, setter: (v: any) => void) => {
        const result = pairs[index];
        if (result.status === "fulfilled") setter(result.value);
      };
      put(0, setUsers);
      put(1, setRoles);
      put(2, setDepartments);
      put(3, setBranches);
      put(4, setSessions);
      put(5, setAttempts);
      put(6, setAudit);
      put(7, setWorkflows);
      put(8, setRequests);
      put(9, setInvitations);
      put(10, (value) => setPolicy({ ...initialPolicy, ...value }));
      const failed = pairs.find((item) => item.status === "rejected");
      if (failed?.status === "rejected")
        setError(
          failed.reason instanceof Error
            ? failed.reason.message
            : "Algunas secciones no se pudieron cargar.",
        );
    } finally {
      setLoading(false);
    }
  }, [fetchJson, token]);
  useEffect(() => {
    if (!isLoading && !canAdmin) router.replace("/dashboard");
  }, [isLoading, canAdmin, router]);
  useEffect(() => {
    void loadAll();
  }, [loadAll]);
  const run = async (action: () => Promise<void>) => {
    setError("");
    setNotice("");
    try {
      await action();
      setNotice("Cambios guardados.");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error.");
    }
  };
  const createDepartment = () =>
    run(async () => {
      await fetchJson("/security/departments", {
        method: "POST",
        body: JSON.stringify(departmentForm),
      });
      setDepartmentForm({ name: "", description: "" });
    });
  const createPosition = () =>
    run(async () => {
      await fetchJson(
        `/security/departments/${position.department_id}/positions`,
        { method: "POST", body: JSON.stringify({ name: position.name }) },
      );
      setPosition({ ...position, name: "" });
    });
  const createWorkflow = () =>
    run(async () => {
      await fetchJson("/security/approval-workflows", {
        method: "POST",
        body: JSON.stringify(workflowForm),
      });
      setWorkflowForm({ ...workflowForm, name: "" });
    });
  const createApprovalRequest = () =>
    run(async () => {
      await fetchJson("/security/approval-requests", {
        method: "POST",
        body: JSON.stringify(requestForm),
      });
      setRequestForm({
        ...requestForm,
        record_type: "",
        record_id: "",
        amount: 0,
        reason: "",
      });
    });
  const createInvitation = () =>
    run(async () => {
      const result = await fetchJson("/security/invitations", {
        method: "POST",
        body: JSON.stringify(inviteForm),
      });
      const link = `${window.location.origin}/accept-invitation?token=${result.invitation_token}`;
      setInviteLink(link);
      await navigator.clipboard?.writeText(link);
      setInviteForm({ ...inviteForm, email: "" });
    });
  const decision = (
    request: AnyRow,
    value: "approved" | "rejected" | "returned",
  ) => {
    const note = window.prompt("Escribe la justificación de la decisión:");
    if (!note?.trim()) return;
    void run(async () => {
      await fetchJson(`/security/approval-requests/${request.id}`, {
        method: "PATCH",
        body: JSON.stringify({ decision: value, decision_note: note }),
      });
    });
  };
  if (isLoading || !canAdmin)
    return <div className="security-wait">Cargando seguridad…</div>;
  const pending = requests.filter((r) => r.status === "pending").length;
  return (
    <div className="dashboard-layout">
      <Navbar />
      <main className="security-main">
        <header className="security-heading">
          <div>
            <span className="security-eyebrow">ADMINISTRACIÓN Y CONTROL</span>
            <h1>Usuarios y seguridad</h1>
            <p>
              Identidades, permisos, actividad y aprobaciones de la empresa.
            </p>
          </div>
          <button className="security-refresh" onClick={() => void loadAll()}>
            <RefreshCw size={16} />
            Actualizar
          </button>
        </header>
        <nav className="security-tabs">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={tab === item.id ? "active" : ""}
                onClick={() => setTab(item.id)}
              >
                <Icon size={16} />
                {item.label}
                {item.id === "approvals" && pending > 0 && <b>{pending}</b>}
              </button>
            );
          })}
        </nav>
        {error && <div className="security-alert error">{error}</div>}
        {notice && <div className="security-alert success">{notice}</div>}
        {loading && (
          <div className="security-loading">
            <RefreshCw className="spin" /> Cargando registros…
          </div>
        )}
        {!loading && tab === "overview" && (
          <>
            <div className="security-metrics">
              <Metric
                icon={<Users />}
                label="Usuarios activos"
                value={users.filter((x) => x.is_active).length}
              />
              <Metric
                icon={<ShieldCheck />}
                label="Roles configurados"
                value={roles.length}
              />
              <Metric
                icon={<Monitor />}
                label="Sesiones activas"
                value={sessions.length}
              />
              <Metric
                icon={<ClipboardCheck />}
                label="Aprobaciones pendientes"
                value={pending}
              />
            </div>
            <div className="security-overview-grid">
              <section className="security-panel">
                <h2>Centro de control</h2>
                <p>
                  Administra permisos desde Configuración y cuentas desde
                  Usuarios.
                </p>
                <div className="security-shortcuts">
                  <a href="/users">
                    <Users size={18} />
                    Administrar usuarios
                  </a>
                  <a href="/settings">
                    <ShieldCheck size={18} />
                    Roles y permisos
                  </a>
                  <button onClick={() => setTab("audit")}>
                    <Activity size={18} />
                    Ver auditoría
                  </button>
                  <button onClick={() => setTab("policies")}>
                    <KeyRound size={18} />
                    Políticas de acceso
                  </button>
                </div>
              </section>
              <section className="security-panel">
                <h2>Actividad reciente</h2>
                {audit.slice(0, 6).map((row) => (
                  <div className="security-activity" key={row.id}>
                    <span className="activity-dot" />
                    <div>
                      <strong>
                        {row.actor_name || row.actor_id || "Sistema"} ·{" "}
                        {row.action}
                      </strong>
                      <small>
                        {row.resource} · {date(row.created_at)}
                      </small>
                    </div>
                    <span
                      className={
                        row.status_code < 400 ? "status-ok" : "status-fail"
                      }
                    >
                      {row.status_code}
                    </span>
                  </div>
                ))}
                {!audit.length && <Empty />}
              </section>
            </div>
          </>
        )}
        {!loading && tab === "departments" && (
          <div className="security-columns">
            <section className="security-panel">
              <h2>Departamentos</h2>
              <div className="security-form">
                <input
                  placeholder="Nombre del área"
                  value={departmentForm.name}
                  onChange={(e) =>
                    setDepartmentForm({
                      ...departmentForm,
                      name: e.target.value,
                    })
                  }
                />
                <input
                  placeholder="Descripción"
                  value={departmentForm.description}
                  onChange={(e) =>
                    setDepartmentForm({
                      ...departmentForm,
                      description: e.target.value,
                    })
                  }
                />
                <button
                  onClick={() => void createDepartment()}
                  disabled={!departmentForm.name}
                >
                  <Plus size={16} />
                  Crear departamento
                </button>
              </div>
              {departments.map((d) => (
                <div className="security-list-row" key={d.id}>
                  <div>
                    <strong>{d.name}</strong>
                    <small>
                      {d.description || "Sin descripción"} ·{" "}
                      {d.positions?.length || 0} cargos
                    </small>
                  </div>
                </div>
              ))}
            </section>
            <section className="security-panel">
              <h2>Cargos</h2>
              <div className="security-form">
                <select
                  value={position.department_id}
                  onChange={(e) =>
                    setPosition({ ...position, department_id: e.target.value })
                  }
                >
                  <option value="">Departamento</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Nombre del cargo"
                  value={position.name}
                  onChange={(e) =>
                    setPosition({ ...position, name: e.target.value })
                  }
                />
                <button
                  onClick={() => void createPosition()}
                  disabled={!position.department_id || !position.name}
                >
                  <Plus size={16} />
                  Agregar cargo
                </button>
              </div>
              {departments.flatMap((d) =>
                (d.positions || []).map((p: AnyRow) => (
                  <div className="security-list-row" key={p.id}>
                    <div>
                      <strong>{p.name}</strong>
                      <small>{d.name}</small>
                    </div>
                  </div>
                )),
              )}
            </section>
          </div>
        )}
        {!loading && tab === "branches" && (
          <section className="security-panel">
            <h2>Sucursales y alcance</h2>
            <p className="security-muted">
              Asigna sucursales desde la edición de cada usuario. Las
              autorizaciones se guardan en el servidor por empresa.
            </p>
            <div className="security-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Sucursal</th>
                    <th>Ciudad</th>
                    <th>Código</th>
                    <th>Usuarios asignados</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((b) => (
                    <tr key={b.id}>
                      <td>{b.name}</td>
                      <td>{b.city || "—"}</td>
                      <td>{b.code}</td>
                      <td>{b.member_count}</td>
                      <td>{b.is_active ? "Activa" : "Inactiva"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {!loading && tab === "approvals" && (
          <>
            <div className="security-columns">
              <section className="security-panel">
                <h2>Nuevo flujo</h2>
                <div className="security-form vertical">
                  <input
                    placeholder="Nombre del flujo"
                    value={workflowForm.name}
                    onChange={(e) =>
                      setWorkflowForm({ ...workflowForm, name: e.target.value })
                    }
                  />
                  <div className="security-form-pair">
                    <select
                      value={workflowForm.module}
                      onChange={(e) =>
                        setWorkflowForm({
                          ...workflowForm,
                          module: e.target.value,
                        })
                      }
                    >
                      {[
                        "imports",
                        "sales",
                        "inventory",
                        "finance",
                        "purchases",
                      ].map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Operación"
                      value={workflowForm.operation}
                      onChange={(e) =>
                        setWorkflowForm({
                          ...workflowForm,
                          operation: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="security-form-pair">
                    <input
                      type="number"
                      min="0"
                      placeholder="Umbral USD"
                      value={workflowForm.amount_threshold}
                      onChange={(e) =>
                        setWorkflowForm({
                          ...workflowForm,
                          amount_threshold: Number(e.target.value),
                        })
                      }
                    />
                    <select
                      value={workflowForm.approver_role}
                      onChange={(e) =>
                        setWorkflowForm({
                          ...workflowForm,
                          approver_role: e.target.value,
                        })
                      }
                    >
                      {roles.map((role) => (
                        <option key={role.role_key} value={role.role_key}>
                          {role.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="security-checkbox">
                    <input
                      type="checkbox"
                      checked={workflowForm.require_distinct_actor}
                      onChange={(e) =>
                        setWorkflowForm({
                          ...workflowForm,
                          require_distinct_actor: e.target.checked,
                        })
                      }
                    />
                    Exigir que solicitante y aprobador sean personas distintas
                  </label>
                  <button
                    onClick={() => void createWorkflow()}
                    disabled={!workflowForm.name}
                  >
                    <Plus size={16} />
                    Guardar flujo
                  </button>
                </div>
              </section>
              <section className="security-panel">
                <h2>Flujos configurados</h2>
                {workflows.map((w) => (
                  <div className="security-list-row" key={w.id}>
                    <div>
                      <strong>{w.name}</strong>
                      <small>
                        {w.module}.{w.operation} · desde $
                        {Number(w.amount_threshold).toLocaleString()} · aprueba{" "}
                        {w.approver_role_name}
                      </small>
                    </div>
                  </div>
                ))}
                {!workflows.length && <Empty />}
              </section>
            </div>
            <section className="security-panel">
              <h2>Solicitudes</h2>
              <div className="security-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>Flujo</th>
                      <th>Solicitante</th>
                      <th>Importe</th>
                      <th>Estado</th>
                      <th>Decisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id}>
                        <td>
                          {r.record_type} · {r.record_id}
                          <small className="table-sub">{r.reason}</small>
                        </td>
                        <td>{r.workflow_name}</td>
                        <td>{r.requester_name || "—"}</td>
                        <td>${Number(r.amount).toLocaleString()}</td>
                        <td>{r.status}</td>
                        <td>
                          {r.status === "pending" && (
                            <div className="security-row-actions">
                              <button onClick={() => decision(r, "approved")}>
                                Aprobar
                              </button>
                              <button onClick={() => decision(r, "returned")}>
                                Devolver
                              </button>
                              <button
                                className="danger"
                                onClick={() => decision(r, "rejected")}
                              >
                                Rechazar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!requests.length && <Empty />}
            </section>
          </>
        )}
        {!loading && tab === "sessions" && (
          <section className="security-panel">
            <h2>Sesiones activas</h2>
            <p className="security-muted">
              Revocar una sesión cierra el acceso en la siguiente solicitud del
              dispositivo.
            </p>
            <Rows
              rows={sessions}
              columns={[
                "full_name",
                "username",
                "ip_address",
                "user_agent",
                "last_seen_at",
                "expires_at",
              ]}
              labels={[
                "Usuario",
                "Cuenta",
                "IP",
                "Dispositivo",
                "Actividad",
                "Vence",
              ]}
              action={(r) =>
                void run(async () => {
                  await fetchJson(`/security/sessions/${r.id}`, {
                    method: "DELETE",
                  });
                })
              }
              actionLabel="Revocar"
            />
          </section>
        )}
        {!loading && tab === "attempts" && (
          <section className="security-panel">
            <h2>Intentos de inicio de sesión</h2>
            <p className="security-muted">
              Los bloqueos temporales se calculan con el límite y periodo
              configurados en la política.
            </p>
            <Rows
              rows={attempts}
              columns={["username", "ip_address", "succeeded", "attempted_at"]}
              labels={["Usuario", "IP", "Resultado", "Fecha"]}
            />
          </section>
        )}
        {!loading && tab === "audit" && (
          <section className="security-panel">
            <h2>Registro de auditoría</h2>
            <p className="security-muted">
              Eventos de escritura, aprobaciones, accesos y cambios del sistema.
            </p>
            <Rows
              rows={audit}
              columns={[
                "actor_name",
                "action",
                "resource",
                "resource_id",
                "ip_address",
                "status_code",
                "created_at",
              ]}
              labels={[
                "Usuario",
                "Acción",
                "Recurso",
                "Registro",
                "IP",
                "Resultado",
                "Fecha",
              ]}
            />
          </section>
        )}
        {!loading && tab === "policies" && (
          <section className="security-panel policy-panel">
            <h2>Políticas de seguridad</h2>
            <p className="security-muted">
              Se aplican a toda la empresa. Las sesiones existentes vencen según
              su tiempo de expiración original.
            </p>
            <div className="policy-grid">
              <NumberField
                label="Longitud mínima de contraseña"
                min={8}
                max={128}
                value={policy.min_password_length}
                onChange={(v) =>
                  setPolicy({ ...policy, min_password_length: v })
                }
              />
              <NumberField
                label="Intentos antes del bloqueo"
                min={3}
                max={20}
                value={policy.max_login_attempts}
                onChange={(v) =>
                  setPolicy({ ...policy, max_login_attempts: v })
                }
              />
              <NumberField
                label="Minutos de bloqueo"
                min={1}
                max={1440}
                value={policy.lockout_minutes}
                onChange={(v) => setPolicy({ ...policy, lockout_minutes: v })}
              />
              <NumberField
                label="Duración de sesión (horas)"
                min={1}
                max={168}
                value={policy.session_hours}
                onChange={(v) => setPolicy({ ...policy, session_hours: v })}
              />
              <label className="security-checkbox policy-mfa">
                <input
                  type="checkbox"
                  checked={policy.require_mfa}
                  onChange={(e) =>
                    setPolicy({ ...policy, require_mfa: e.target.checked })
                  }
                />
                Exigir MFA
              </label>
            </div>
            <button
              className="security-primary"
              onClick={() =>
                void run(async () => {
                  await fetchJson("/security/policy", {
                    method: "PATCH",
                    body: JSON.stringify(policy),
                  });
                })
              }
            >
              Guardar política
            </button>
          </section>
        )}
        {!loading && tab === "invitations" && (
          <div className="security-columns">
            <section className="security-panel">
              <h2>Invitar colaborador</h2>
              <p className="security-muted">
                Genera un enlace de un solo uso válido por 7 días. Cópialo y
                compártelo con la persona.
              </p>
              <div className="security-form vertical">
                <input
                  type="email"
                  placeholder="correo@empresa.com"
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, email: e.target.value })
                  }
                />
                <select
                  value={inviteForm.role_key}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, role_key: e.target.value })
                  }
                >
                  {roles
                    .filter((r) => r.role_key !== "admin")
                    .map((r) => (
                      <option key={r.role_key} value={r.role_key}>
                        {r.display_name}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => void createInvitation()}
                  disabled={!inviteForm.email}
                >
                  <MailPlus size={16} />
                  Crear invitación
                </button>
              </div>
              {inviteLink && (
                <div className="invite-link-box">
                  <strong>Enlace copiado</strong>
                  <input readOnly value={inviteLink} />
                  <button
                    onClick={() =>
                      void navigator.clipboard?.writeText(inviteLink)
                    }
                  >
                    Copiar de nuevo
                  </button>
                </div>
              )}
            </section>
            <section className="security-panel">
              <h2>Invitaciones enviadas</h2>
              {invitations.map((i) => (
                <div className="security-list-row" key={i.id}>
                  <div>
                    <strong>{i.email}</strong>
                    <small>
                      {i.role_name} · vence {date(i.expires_at)} ·{" "}
                      {i.accepted_at
                        ? "Aceptada"
                        : i.revoked_at
                          ? "Revocada"
                          : "Pendiente"}
                    </small>
                  </div>
                  {!i.accepted_at && !i.revoked_at && (
                    <button
                      className="security-text-danger"
                      onClick={() =>
                        void run(async () => {
                          await fetchJson(`/security/invitations/${i.id}`, {
                            method: "DELETE",
                          });
                        })
                      }
                    >
                      Revocar
                    </button>
                  )}
                </div>
              ))}
              {!invitations.length && <Empty />}
            </section>
          </div>
        )}
        <footer className="security-footer">
          <span>Importadora ERP · Seguridad empresarial</span>
          <span>
            {users.length} usuarios · {branches.length} sucursales
          </span>
        </footer>
        <style jsx>{styles}</style>
      </main>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: number;
}) {
  return (
    <div className="security-metric">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
function Empty() {
  return <div className="security-empty">No hay registros para mostrar.</div>;
}
function date(value: string) {
  return value
    ? new Date(value).toLocaleString("es-EC", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
}
function Rows({
  rows,
  columns,
  labels,
  action,
  actionLabel,
}: {
  rows: AnyRow[];
  columns: string[];
  labels: string[];
  action?: (row: AnyRow) => void;
  actionLabel?: string;
}) {
  return rows.length ? (
    <div className="security-table-wrap">
      <table>
        <thead>
          <tr>
            {labels.map((x) => (
              <th key={x}>{x}</th>
            ))}
            {action && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i}>
              {columns.map((key) => (
                <td key={key}>
                  {key.endsWith("_at")
                    ? date(row[key])
                    : key === "status_code"
                      ? row[key] < 400
                        ? "Correcto"
                        : `Error ${row[key]}`
                      : String(row[key] ?? "—")}
                </td>
              ))}
              {action && (
                <td>
                  <button
                    className="security-text-danger"
                    onClick={() => action(row)}
                  >
                    {actionLabel}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty />
  );
}
function NumberField({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="security-number">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

const styles = `
.security-main{padding:32px 40px 56px;max-width:1500px;margin:auto;color:var(--foreground)}.security-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}.security-eyebrow{color:var(--action-color,var(--primary));font-weight:800;font-size:11px;letter-spacing:.15em}.security-heading h1{margin:7px 0;font-size:32px;letter-spacing:-.04em}.security-heading p,.security-muted{color:var(--muted-foreground);margin:0}.security-refresh,.security-tabs button,.security-form button,.security-primary{display:inline-flex;align-items:center;gap:8px}.security-refresh{border:1px solid var(--border);border-radius:10px;background:var(--card);padding:10px 14px;color:var(--foreground);cursor:pointer}.security-tabs{display:flex;gap:7px;overflow:auto;border-bottom:1px solid var(--border);margin-bottom:22px}.security-tabs button{flex:none;border:0;background:none;padding:13px 12px;color:var(--muted-foreground);font-weight:650;cursor:pointer;border-bottom:2px solid transparent}.security-tabs button.active{color:var(--action-color,var(--primary));border-color:var(--action-color,var(--primary))}.security-tabs b{font-size:10px;background:color-mix(in srgb,var(--action-color,var(--primary)) 12%,var(--card));color:var(--action-color,var(--primary));border-radius:20px;padding:2px 6px}.security-alert{padding:12px 16px;border-radius:10px;margin-bottom:14px}.security-alert.error{background:#fff1f0;color:#a33028}.security-alert.success{background:#ecfdf5;color:#087443}.security-loading,.security-wait{padding:48px;text-align:center;color:var(--muted-foreground)}.security-loading{display:flex;align-items:center;justify-content:center;gap:10px}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.security-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}.security-metric{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px;display:flex;align-items:center;gap:14px}.security-metric>span{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:color-mix(in srgb,var(--action-color,var(--primary)) 10%,var(--card));color:var(--action-color,var(--primary))}.security-metric svg{width:19px}.security-metric div{display:grid;gap:4px}.security-metric small,.security-list-row small,.security-activity small{color:var(--muted-foreground);font-size:12px}.security-metric strong{font-size:24px}.security-overview-grid,.security-columns{display:grid;grid-template-columns:1fr 1fr;gap:16px}.security-panel{background:var(--card);border:1px solid var(--border);border-radius:17px;padding:22px;margin-bottom:16px;min-width:0}.security-panel h2{font-size:18px;margin:0 0 7px}.security-panel>p{margin:0 0 18px}.security-shortcuts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}.security-shortcuts a,.security-shortcuts button{display:flex;align-items:center;gap:10px;text-align:left;text-decoration:none;color:var(--foreground);background:var(--background);border:1px solid var(--border);border-radius:12px;padding:14px;font:inherit;cursor:pointer}.security-shortcuts svg{color:var(--action-color,var(--primary))}.security-activity{display:flex;align-items:flex-start;gap:11px;padding:12px 0;border-bottom:1px solid var(--border)}.security-activity:last-child{border:0}.security-activity div{display:grid;gap:4px;min-width:0;flex:1}.security-activity strong{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.activity-dot{width:8px;height:8px;background:#0c987a;border-radius:50%;margin-top:4px}.status-ok,.status-fail{font-size:11px;font-weight:800}.status-ok{color:#07804b}.status-fail{color:#c43b30}.security-form{display:flex;gap:9px;align-items:center;margin:18px 0}.security-form.vertical{display:grid;align-items:stretch}.security-form-pair{display:flex;gap:9px}.security-form input,.security-form select,.security-number input,.invite-link-box input{min-width:0;height:42px;border:1px solid var(--border);border-radius:9px;padding:0 11px;background:var(--background);color:var(--foreground);font:inherit}.security-form>input,.security-form>select{flex:1}.security-form button,.security-primary{flex:none;border:0;border-radius:9px;background:var(--action-color,var(--primary));color:var(--primary-foreground);padding:11px 14px;font-weight:700;cursor:pointer;white-space:nowrap}.security-form button:disabled{opacity:.5}.security-list-row{display:flex;justify-content:space-between;align-items:center;gap:15px;padding:14px 0;border-bottom:1px solid var(--border)}.security-list-row:last-child{border-bottom:0}.security-list-row>div{display:grid;gap:5px}.security-table-wrap{width:100%;overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}th{text-align:left;color:var(--muted-foreground);font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:12px;border-bottom:1px solid var(--border);white-space:nowrap}td{padding:12px;border-bottom:1px solid var(--border);vertical-align:top}td small.table-sub{display:block;color:var(--muted-foreground);margin-top:5px;max-width:250px}.security-row-actions{display:flex;gap:5px}.security-row-actions button,.security-text-danger{border:1px solid var(--border);background:var(--card);border-radius:7px;padding:6px 9px;cursor:pointer;color:var(--foreground);white-space:nowrap}.security-row-actions .danger,.security-text-danger{color:#b42318}.security-checkbox{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted-foreground)}.policy-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0}.security-number{display:grid;gap:7px;font-size:13px;font-weight:650}.policy-mfa{grid-column:1/-1}.invite-link-box{display:grid;gap:9px;padding:14px;background:var(--background);border:1px solid var(--border);border-radius:12px}.invite-link-box input{width:100%}.invite-link-box button{justify-self:start;border:0;background:none;color:var(--action-color,var(--primary));font-weight:700;cursor:pointer}.security-empty{color:var(--muted-foreground);padding:22px 0;font-size:13px}.security-footer{display:flex;justify-content:space-between;color:var(--muted-foreground);font-size:12px;padding-top:12px}@media(max-width:900px){.security-main{padding:25px 20px}.security-metrics{grid-template-columns:1fr 1fr}}@media(max-width:680px){.security-heading{align-items:flex-start;gap:12px}.security-heading h1{font-size:26px}.security-overview-grid,.security-columns{grid-template-columns:1fr}.security-metrics{gap:8px}.security-metric{padding:13px}.security-metric>span{width:36px;height:36px}.security-metric strong{font-size:20px}.security-shortcuts{grid-template-columns:1fr}.security-form{align-items:stretch;flex-direction:column}.security-form-pair{flex-direction:column}.policy-grid{grid-template-columns:1fr}.policy-mfa{grid-column:auto}.security-footer{gap:8px;flex-direction:column}}
`;
