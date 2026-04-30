import { useState } from "react"
import type { Task } from "@/lib/supabase"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TaskForm } from "./TaskForm"
import { Search, Plus, Edit2, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"

interface TaskListProps {
  tasks: Task[]
  loading: boolean
  onRefresh: () => void
}

type SortField = "title" | "priority" | "status" | "due_date" | "created_at"
type SortDir = "asc" | "desc" | null

const PRIORITY_ORDER = { high: 3, medium: 2, low: 1 }
const STATUS_ORDER = { todo: 1, in_progress: 2, done: 3 }

const priorityColors: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  high: "destructive",
  medium: "default",
  low: "secondary",
}

const statusColors: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  todo: "outline",
  in_progress: "default",
  done: "secondary",
}

export function TaskList({ tasks, loading, onRefresh }: TaskListProps) {
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterPriority, setFilterPriority] = useState<string>("all")
  const [sortField, setSortField] = useState<SortField>("created_at")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [formOpen, setFormOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // PostgREST search: use `title.ilike.%search%` or `description.ilike.%search%`
  // PostgREST filter: `status.eq.{value}`, `priority.eq.{value}`
  // PostgREST order: `order=created_at.desc`

  // Client-side filtering for the demo (supabase does server-side)
  const filtered = tasks
    .filter((t) => {
      if (search) {
        const s = search.toLowerCase()
        return t.title.toLowerCase().includes(s) || t.description.toLowerCase().includes(s)
      }
      return true
    })
    .filter((t) => filterStatus !== "all" ? t.status === filterStatus : true)
    .filter((t) => filterPriority !== "all" ? t.priority === filterPriority : true)
    .sort((a, b) => {
      if (!sortDir || sortDir === null) return 0
      const mul = sortDir === "asc" ? 1 : -1
      if (sortField === "priority") return mul * (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
      if (sortField === "status") return mul * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
      if (sortField === "due_date") {
        const da = a.due_date || ""
        const db2 = b.due_date || ""
        return mul * da.localeCompare(db2)
      }
      return mul * (a[sortField] as string).localeCompare(b[sortField] as string)
    })

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : sortDir === "desc" ? null : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field || !sortDir) return <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
    if (sortDir === "asc") return <ArrowUp className="h-4 w-4" />
    return <ArrowDown className="h-4 w-4" />
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this task?")) return
    setDeletingId(id)
    // PostgREST: DELETE /rest/v1/tasks?id=eq.{id}
    const { error } = await supabase.from("tasks").delete().eq("id", id)
    if (error) console.error("Delete error:", error)
    setDeletingId(null)
    onRefresh()
  }

  const handleSave = async (data: any) => {
    if (editingTask) {
      // PostgREST: PATCH /rest/v1/tasks?id=eq.{id}
      const { error } = await supabase.from("tasks").update(data).eq("id", editingTask.id)
      if (error) console.error("Update error:", error)
    } else {
      // PostgREST: POST /rest/v1/tasks
      const { error } = await supabase.from("tasks").insert(data)
      if (error) console.error("Insert error:", error)
    }
    setEditingTask(null)
    onRefresh()
  }

  const openEdit = (task: Task) => {
    setEditingTask(task)
    setFormOpen(true)
  }

  const openCreate = () => {
    setEditingTask(null)
    setFormOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: search + filters + create */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search tasks... (ilike)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-[140px]">
          <option value="all">All Status</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </Select>
        <Select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="w-[140px]">
          <option value="all">All Priority</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {filtered.length} of {tasks.length} tasks (RLS: only your tasks)
        {search && ` matching "${search}"`}
        {filterStatus !== "all" && ` • status: ${filterStatus}`}
        {filterPriority !== "all" && ` • priority: ${filterPriority}`}
        {sortDir && ` • sorted by ${sortField} ${sortDir}`}
      </div>

      {/* Task table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("title")}>
                <div className="flex items-center gap-1"><SortIcon field="title" />Title</div>
              </TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="cursor-pointer select-none w-[100px]" onClick={() => handleSort("priority")}>
                <div className="flex items-center gap-1"><SortIcon field="priority" />Priority</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none w-[120px]" onClick={() => handleSort("status")}>
                <div className="flex items-center gap-1"><SortIcon field="status" />Status</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none w-[130px]" onClick={() => handleSort("due_date")}>
                <div className="flex items-center gap-1"><SortIcon field="due_date" />Due</div>
              </TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
              </TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No tasks found. Each user only sees their own tasks (RLS). Click "New Task" to create one.
                </TableCell>
              </TableRow>
            )}
            {!loading && filtered.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-medium">{task.title}</TableCell>
                <TableCell className="max-w-[250px] truncate text-muted-foreground">{task.description || "—"}</TableCell>
                <TableCell>
                  <Badge variant={priorityColors[task.priority]}>{task.priority}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={statusColors[task.status]}>
                    {task.status === "in_progress" ? "In Progress" : task.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{task.due_date || "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(task)} title="Edit">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(task.id)}
                      disabled={deletingId === task.id}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TaskForm
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditingTask(null); }}
        task={editingTask}
        onSave={handleSave}
      />
    </div>
  )
}
