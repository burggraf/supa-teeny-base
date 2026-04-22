import prompts from 'prompts'

export async function promptEmail(initial?: string): Promise<string> {
    if (initial) return initial
    const res = await prompts({
        type: 'text', name: 'value', message: 'Email:',
        validate: (v: string) => v.includes('@') || 'Please enter a valid email',
    })
    if (!res.value) throw new Error('Email is required. Pass --email or run in an interactive terminal.')
    return res.value
}

export async function promptPassword(initial?: string, opts?: {confirm?: boolean, minLength?: number}): Promise<string> {
    const minLen = opts?.minLength ?? 0
    if (initial != null) {
        const val = String(initial)
        if (minLen && val.length < minLen) throw new Error(`Password must be at least ${minLen} characters`)
        return val
    }
    const passRes = await prompts({
        type: 'password', name: 'value', message: 'Password:',
        validate: minLen ? ((v: string) => v.length >= minLen || `Password must be at least ${minLen} characters`) : undefined,
    })
    if (!passRes.value) throw new Error('Password is required. Pass --password or run in an interactive terminal.')
    if (opts?.confirm) {
        const confirmRes = await prompts({type: 'password', name: 'value', message: 'Confirm password:'})
        if (confirmRes.value !== passRes.value) throw new Error('Passwords do not match')
    }
    return passRes.value
}
