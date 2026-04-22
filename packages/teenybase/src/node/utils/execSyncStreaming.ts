import {spawn} from 'node:child_process';

/**
 * Execute a command like execSync but stream output to console in real-time.
 * Optionally captures stdout/stderr and returns them.
 * @param command The command to execute
 * @param options Spawn options (cwd, env, etc.)
 * @param capture Whether to capture and return stdout/stderr
 * @param silent When true, suppresses output to the terminal. Captured data is still
 *               available in the resolve/reject value. Use when the caller handles
 *               errors itself and doesn't want subprocess output on screen.
 * @returns Promise resolving to captured stdout on success, or rejecting with {stdout, stderr, status}
 */
export async function execSyncStreaming(
    command: string,
    options?: { cwd?: string, env?: NodeJS.ProcessEnv },
    capture = true,
    silent = false
): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, {
            cwd: options?.cwd,
            env: options?.env,
            shell: true
        })

        let stdoutData = ''
        let stderrData = ''
        let allData = ''

        child.stdout.on('data', (data) => {
            const chunk = data.toString()
            if (capture) stdoutData += chunk
            if (capture) allData += chunk
            if (!silent) process.stdout.write(chunk)
        })

        child.stderr.on('data', (data) => {
            const chunk = data.toString()
            if (capture) stderrData += chunk
            if (capture) allData += chunk
            if (!silent) process.stderr.write(chunk)
        })

        child.on('close', (code) => {
            if (code === 0) resolve(capture ? allData : stdoutData)
            else reject({stdout: stdoutData, output: allData, stderr: stderrData, status: code || 0})
        })

        child.on('error', (err) => {
            reject(err)
        })
    })
}
