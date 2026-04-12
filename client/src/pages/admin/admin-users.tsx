import { useState, useEffect } from "react";
import { useAuthFetch } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Search, Shield, UserX, UserCheck, Coins } from "lucide-react";

interface AdminUser {
  id: number;
  username: string;
  email: string;
  credits: number;
  plan: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editCredits, setEditCredits] = useState("");

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async (q?: string) => {
    setLoading(true);
    try {
      const url = q ? `/api/admin/users?search=${encodeURIComponent(q)}` : "/api/admin/users";
      const res = await authFetch("GET", url);
      setUsers(await res.json());
    } catch {}
    setLoading(false);
  };

  const handleSearch = () => loadUsers(search);

  const toggleActive = async (user: AdminUser) => {
    try {
      await authFetch("PATCH", `/api/admin/users/${user.id}/active`, { isActive: !user.isActive });
      toast({ title: user.isActive ? "User deactivated" : "User activated" });
      loadUsers(search);
    } catch {}
  };

  const toggleRole = async (user: AdminUser) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    try {
      await authFetch("PATCH", `/api/admin/users/${user.id}/role`, { role: newRole });
      toast({ title: `Role changed to ${newRole}` });
      loadUsers(search);
    } catch {}
  };

  const updateCredits = async () => {
    if (!editUser) return;
    const credits = parseFloat(editCredits);
    if (isNaN(credits)) return;
    try {
      await authFetch("PATCH", `/api/admin/users/${editUser.id}/credits`, { credits });
      toast({ title: "Credits updated" });
      setEditUser(null);
      loadUsers(search);
    } catch {}
  };

  const changePlan = async (userId: number, plan: string) => {
    try {
      await authFetch("PATCH", `/api/admin/users/${userId}/plan`, { plan });
      toast({ title: "Plan updated" });
      loadUsers(search);
    } catch {}
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">User Management</h1>
          <p className="text-sm text-muted-foreground">{users.length} users total</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by username or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9"
            data-testid="input-search-users"
          />
        </div>
        <Button onClick={handleSearch} variant="secondary" data-testid="button-search-users">Search</Button>
      </div>

      {/* Users table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">User</th>
                  <th className="text-left p-3 font-medium">Plan</th>
                  <th className="text-left p-3 font-medium">Credits</th>
                  <th className="text-left p-3 font-medium">Role</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Joined</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No users found</td></tr>
                ) : users.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-muted/30" data-testid={`admin-user-${user.id}`}>
                    <td className="p-3">
                      <div className="font-medium">{user.username}</div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                    </td>
                    <td className="p-3">
                      <Select value={user.plan} onValueChange={(v) => changePlan(user.id, v)}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="starter">Starter</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <Dialog open={editUser?.id === user.id} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
                        <DialogTrigger asChild>
                          <button
                            className="flex items-center gap-1 font-medium hover:text-primary transition-colors"
                            onClick={() => { setEditUser(user); setEditCredits(user.credits.toString()); }}
                          >
                            <Coins className="w-3 h-3" />
                            {user.credits.toFixed(1)}
                          </button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit Credits for {user.username}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Credits</Label>
                              <Input
                                type="number"
                                value={editCredits}
                                onChange={(e) => setEditCredits(e.target.value)}
                                data-testid="input-edit-credits"
                              />
                            </div>
                            <Button onClick={updateCredits} className="w-full" data-testid="button-save-credits">
                              Save Credits
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={user.role === "admin" ? "default" : "secondary"}
                        className="cursor-pointer text-xs"
                        onClick={() => toggleRole(user)}
                      >
                        {user.role === "admin" && <Shield className="w-3 h-3 mr-1" />}
                        {user.role}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant={user.isActive ? "outline" : "destructive"} className="text-xs">
                        {user.isActive ? "Active" : "Disabled"}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => toggleActive(user)}
                        title={user.isActive ? "Deactivate" : "Activate"}
                      >
                        {user.isActive ? <UserX className="w-4 h-4 text-destructive" /> : <UserCheck className="w-4 h-4 text-green-600" />}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
