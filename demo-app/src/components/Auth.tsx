import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface AuthProps {
  onAuthChange: () => void
}

export function Auth({ onAuthChange }: AuthProps) {
  const [mode, setMode] = useState<"login" | "signup" | "recovery">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage("Account created! Check email for confirmation (or auto-confirm if enabled).")
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onAuthChange()
      } else if (mode === "recovery") {
        const { error } = await supabase.auth.resetPasswordForEmail(email)
        if (error) throw error
        setMessage("Recovery token generated. (No email sent in dev mode — check D1 for token.)")
      }
    } catch (err: any) {
      setError(err.message || "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">
            {mode === "login" && "Sign In"}
            {mode === "signup" && "Create Account"}
            {mode === "recovery" && "Reset Password"}
          </CardTitle>
          <CardDescription>
            {mode === "login" && "Enter your email and password to access your tasks"}
            {mode === "signup" && "Create a new account to get started"}
            {mode === "recovery" && "Enter your email to receive a password reset link"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            {mode !== "recovery" && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                />
              </div>
            )}

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>
            )}
            {message && (
              <div className="text-sm text-green-700 bg-green-50 p-3 rounded-md">{message}</div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Processing..." : mode === "login" ? "Sign In" : mode === "signup" ? "Sign Up" : "Send Reset Link"}
            </Button>
          </form>

          <div className="mt-4 flex flex-col gap-2 text-sm">
            {mode !== "login" && (
              <Button variant="ghost" className="p-0 h-auto" onClick={() => { setMode("login"); setError(null); setMessage(null); }}>
                ← Back to Sign In
              </Button>
            )}
            {mode === "login" && (
              <>
                <Button variant="ghost" className="p-0 h-auto justify-start" onClick={() => { setMode("signup"); setError(null); setMessage(null); }}>
                  Don't have an account? Sign up
                </Button>
                <Button variant="ghost" className="p-0 h-auto justify-start" onClick={() => { setMode("recovery"); setError(null); setMessage(null); }}>
                  Forgot your password?
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
