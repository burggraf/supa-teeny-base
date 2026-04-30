import { createClient } from '@supabase/supabase-js'

// Supaflare backend URL
// In dev: proxied through Vite (relative path)
// In prod: use the actual Supaflare deployment URL
const SUPAFLARE_URL = import.meta.env.VITE_SUPAFLARE_URL || window.location.origin
const SUPAFLARE_ANON_KEY = import.meta.env.VITE_SUPAFLARE_ANON_KEY || 'sb-anon-test-key'

export const supabase = createClient(SUPAFLARE_URL, SUPAFLARE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

export type Task = {
  id: number
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  status: 'todo' | 'in_progress' | 'done'
  due_date: string | null
  created_at: string
  updated_at: string
  user_id: string
}

export type TaskInsert = Omit<Task, 'id' | 'created_at' | 'updated_at'>
export type TaskUpdate = Partial<TaskInsert>
