"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type ManagedUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "operator";
  isActive: boolean;
};

export default function UsersAdmin() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "operator">("operator");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const activeCount = users.filter((user) => user.isActive).length;

  const loadUsers = useCallback(async () => {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const body = (await response.json()) as { users?: ManagedUser[]; message?: string };
    if (!response.ok) throw new Error(body.message ?? "Could not load users.");
    setUsers(body.users ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/users", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { users?: ManagedUser[] };
        if (!response.ok) throw new Error("Could not load users.");
        if (active) setUsers(body.users ?? []);
      })
      .catch(() => {
        if (active) setMessage("Could not load users.");
      });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, role }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(body.message ?? "Could not add user.");
        return;
      }
      setEmail("");
      setName("");
      setRole("operator");
      setMessage("User added.");
      await loadUsers();
    } catch {
      setMessage("Could not add user.");
    } finally {
      setBusy(false);
    }
  }

  async function updateUser(user: ManagedUser, update: { role: ManagedUser["role"] } | { isActive: boolean }) {
    setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(body.message ?? "Could not update user.");
        return;
      }
      await loadUsers();
    } catch {
      setMessage("Could not update user.");
    }
  }

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div><p className="eyebrow">Administration</p><h1>Users</h1></div>
        <strong>{activeCount} of 3 active users</strong>
      </header>
      <form className="panel form-grid" onSubmit={submit}>
        <h2>Add user</h2>
        <label>Name<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="operator">Operator</option><option value="admin">Admin</option></select></label>
        <button type="submit" disabled={busy || activeCount >= 3}>{busy ? "Adding…" : "Add user"}</button>
        <p className="form-message" role="status">{message}</p>
      </form>
      <section className="panel table-panel">
        <h2>Authorised users</h2>
        <div className="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{users.map((user) => <tr key={user.id}>
            <td>{user.name}</td><td>{user.email}</td>
            <td><select aria-label={`Role for ${user.name}`} value={user.role} onChange={(event) => updateUser(user, { role: event.target.value as ManagedUser["role"] })}><option value="admin">Admin</option><option value="operator">Operator</option></select></td>
            <td>{user.isActive ? "Active" : "Inactive"}</td>
            <td><button type="button" disabled={!user.isActive && activeCount >= 3} onClick={() => updateUser(user, { isActive: !user.isActive })}>{user.isActive ? "Deactivate" : "Reactivate"}</button></td>
          </tr>)}</tbody>
        </table></div>
      </section>
    </section>
  );
}
