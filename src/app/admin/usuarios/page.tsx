"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Shield, Unlock, CheckCircle2, XCircle } from "lucide-react";
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
    return <div className="flex h-64 items-center justify-center text-slate-500">Verificando permissões...</div>;
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
    <div>
      <AdminHeader
        title="Usuários"
        description="Gerencie contas de administrador e operadores"
        actions={
          <button onClick={openCreate} className="btn-primary">
            <Plus className="mr-2 h-4 w-4" />
            Novo usuário
          </button>
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

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-10"
          placeholder="Buscar por nome, e-mail ou papel..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? (
          <p className="text-center text-slate-500">Carregando...</p>
        ) : filteredUsers.length === 0 ? (
          <EmptyState icon={Shield} title="Nenhum usuário encontrado" description="Cadastre um novo usuário para começar." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-3 font-medium">Nome</th>
                  <th className="pb-3 font-medium">E-mail</th>
                  <th className="pb-3 font-medium">Papel</th>
                  <th className="pb-3 font-medium">Ativo</th>
                  <th className="pb-3 font-medium">Criado</th>
                  <th className="pb-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100">
                    <td className="py-3 font-medium">{user.name}</td>
                    <td className="py-3 text-slate-500">{user.email}</td>
                    <td className="py-3">
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300">
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3">
                      {user.active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/90 px-2 py-1 text-[11px] text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-950/90 px-2 py-1 text-[11px] text-red-300">
                          <XCircle className="h-3.5 w-3.5" /> Inativo
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-slate-500">{new Date(user.createdAt).toLocaleDateString("pt-BR")}</td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(user)} className="rounded p-1 text-slate-400 transition hover:bg-surface-800 hover:text-brand-200">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(user.id)} className="rounded p-1 text-red-400 transition hover:bg-red-950/40 hover:text-red-200">
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
      </div>

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
