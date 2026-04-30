import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import type { Task } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TaskList } from "./TaskList"
import { LogOut, Loader2, CheckCircle2, Clock, AlertCircle } from "lucide-react"

interface DashboardProps {
  onSignOut: () => void
}

export function Dashboard({ onSignOut }: DashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // PostgREST: GET /rest/v1/tasks?order=created_at.desc
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw error
      setTasks(data || [])
    } catch (err: any) {
      setError(err.message || "Failed to load tasks")
      console.error("Fetch tasks error:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    fetchTasks()
  }, [fetchTasks])

  const stats = {
    total: tasks.length,
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Supaflare Demo</h1>
          <p className="text-muted-foreground">
            {user?.email} — Teenybase + PostgREST + RLS (each user sees only their own tasks)
          </p>
        </div>
        <Button variant="outline" onClick={onSignOut}>
          <LogOut className="h-4 w-4 mr-2" /> Sign Out
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-muted">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-muted">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.todo}</p>
                <p className="text-sm text-muted-foreground">To Do</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-muted">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.in_progress}</p>
                <p className="text-sm text-muted-foreground">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-muted">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.done}</p>
                <p className="text-sm text-muted-foreground">Done</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Feature badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">POST /rest/v1/tasks — INSERT</Badge>
        <Badge variant="outline">GET /rest/v1/tasks — SELECT</Badge>
        <Badge variant="outline">PATCH /rest/v1/tasks — UPDATE</Badge>
        <Badge variant="outline">DELETE /rest/v1/tasks — DELETE</Badge>
        <Badge variant="outline">?title.ilike.%...% — Search</Badge>
        <Badge variant="outline">?status.eq=todo — Filter</Badge>
        <Badge variant="outline">?order=created_at.desc — Sort</Badge>
        <Badge variant="outline">POST /auth/v1/signup — Register</Badge>
        <Badge variant="outline">POST /auth/v1/token — Login</Badge>
        <Badge variant="outline">POST /auth/v1/recover — Recovery</Badge>
        <Badge>🔒 RLS — user_id == auth.uid()</Badge>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" className="mt-2" onClick={fetchTasks}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Task list */}
      <TaskList tasks={tasks} loading={loading} onRefresh={fetchTasks} />
    </div>
  )
}
