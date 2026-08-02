"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Shield, CheckCircle2, XCircle, RefreshCw, UsersRound, UserRoundCheck } from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "OPERATOR";
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "OPERATOR";
  active: boolean;
}

const emptyForm: UserForm = {
  name: "",
  email: "",
  password: "",
  role: "OPERATOR",
  active: true,
};

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const term = search.toLowerCase();
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        user.role.toLowerCase().includes(term)
    );
  }, [search, users]);

  const activeUsers = users.filter((user) => user.active).length;
  const administrators = users.filter((user) => user.role === "ADMIN").length;

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.role) {
          setUserRole(data.data.role);
        } else {
          setError("Não autenticado");
        }
      })
      .catch(() => setError("Erro ao verificar permissões"));
  }, []);

  useEffect(() => {
    if (userRole === "ADMIN") {
      loadUsers();
    }
  }, [userRole]);

  async function loadUsers() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/usuarios");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao carregar usuários");
      } else {
        setUsers(data.data);
      }
    } catch {
      setError("Erro de conexão ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setMessage(null);
    setModalOpen(true);
  }

  function openEdit(user: UserItem) {
    setEditing(user);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      active: user.active,
    });
    setMessage(null);
    setModalOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const payload: Partial<UserForm> = {
      name: form.name,
      email: form.email,
      role: form.role,
      active: form.active,
    };

    if (!editing) {
      payload.password = form.password;
    } else if (form.password.trim()) {
      payload.password = form.password;
    }

    const url = editing ? `/api/usuarios/${editing.id}` : "/api/usuarios";
    const method = editing ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao salvar usuário");
      } else {
        setMessage(editing ? "Usuário atualizado com sucesso." : "Usuário criado com sucesso.");
        setModalOpen(false);
        loadUsers();
      }
    } catch {
      setError("Erro de rede ao salvar usuário");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este usuário?")) return;
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/usuarios/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao excluir usuário");
      } else {
        setMessage("Usuário excluído com sucesso.");
        loadUsers();
      }
    } catch {
      setError("Erro de rede ao excluir usuário");
    }
  }

  if (userRole === null) {
    return (
      <div>
        <AdminHeader title="Usuários" description="Controle de acessos e papéis da operação" />
        <div className="flex h-64 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-brand-300" /></div>
      </div>
    );
  }

  if (userRole !== "ADMIN") {
    return (
      <div>
        <AdminHeader title="Usuários" description="Controle de acessos e papéis" />
        <div className="card border border-red-500/20 bg-red-950/10 p-6 text-red-200">
          <h2 className="text-lg font-semibold">Acesso negado</h2>
          <p className="mt-2 text-sm text-slate-300">
            Esta área é restrita a administradores. Se você precisa de acesso, peça a um administrador para atualizar seu papel.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Usuários"
        description="Gerencie acessos administrativos e operadores da central de atendimento."
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => void loadUsers()} disabled={loading} className="btn-secondary gap-2">
              <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
              Atualizar
            </button>
            <button onClick={openCreate} className="btn-primary gap-2">
              <Plus className="h-4 w-4" />
              Novo usuário
            </button>
          </div>
        }
      />

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/20 bg-red-950/20 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900/40 text-brand-300 ring-1 ring-brand-700/40"><UsersRound className="h-5 w-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Contas</p><p className="mt-1 text-2xl font-semibold text-slate-100">{users.length}</p></div>
          </div>
        </article>
        <article className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-900/35 text-emerald-400 ring-1 ring-emerald-700/40"><UserRoundCheck className="h-5 w-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ativos</p><p className="mt-1 text-2xl font-semibold text-slate-100">{activeUsers}</p></div>
          </div>
        </article>
        <article className="card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-900/35 text-violet-400 ring-1 ring-violet-700/40"><Shield className="h-5 w-5" /></div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Administradores</p><p className="mt-1 text-2xl font-semibold text-slate-100">{administrators}</p></div>
          </div>
        </article>
      </section>

      <section className="card overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-surface-700 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-brand-100">Acessos da operação</h2>
            <p className="mt-1 text-sm text-slate-400">Defina quem administra configurações e quem atende a fila CRM.</p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input className="input py-2 pl-10" placeholder="Buscar por nome, e-mail ou papel..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {loading ? (
          <div className="flex min-h-64 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-brand-300" /></div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-10"><EmptyState icon={Shield} title="Nenhum usuário encontrado" description="Cadastre um novo usuário para começar." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Usuário</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">E-mail</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Papel</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Criado</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="px-5 py-4 font-medium text-slate-200">{user.name}</td>
                    <td className="px-5 py-4 text-slate-400">{user.email}</td>
                    <td className="px-5 py-4">
                      <span className={user.role === "ADMIN" ? "rounded-full bg-violet-900/35 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-300" : "rounded-full bg-surface-700 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300"}>
                        {user.role === "ADMIN" ? "Administrador" : "Operador"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {user.active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/35 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-900/35 px-2.5 py-1 text-[11px] font-semibold text-red-300">
                          <XCircle className="h-3.5 w-3.5" /> Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-500">{new Date(user.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(user)} className="rounded-lg p-2 text-slate-400 transition hover:bg-surface-700 hover:text-brand-200" title="Editar usuário">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(user.id)} className="rounded-lg p-2 text-red-400 transition hover:bg-red-950/40 hover:text-red-200" title="Excluir usuário">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar usuário" : "Novo usuário"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Nome *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="label">E-mail *</label>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="label">Senha {editing ? "(deixe em branco para manter)" : "*"}</label>
            <input
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              {...(!editing ? { required: true } : {})}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Papel</label>
              <select
                className="input"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as "ADMIN" | "OPERATOR" })}
              >
                <option value="ADMIN">ADMIN</option>
                <option value="OPERATOR">OPERATOR</option>
              </select>
            </div>
            <div className="flex items-end gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-brand-400"
                />
                Ativo
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
