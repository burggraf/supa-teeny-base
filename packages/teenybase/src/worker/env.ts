import {AuthContext} from '../types/env'
import {DatabaseSettings} from '../types/config'
import {$Database} from './$Database'

/** Check if an env var is truthy. Handles both boolean true and string "true"/"1". */
export function envBool(val: unknown): boolean {
    return val === true || val === 'true' || val === '1'
}

/** Check if an env var is truthy, defaulting to true if undefined. For RESPOND_WITH_ERRORS. */
export function envBoolDefault(val: unknown, defaultVal = true): boolean {
    return val === undefined ? defaultVal : envBool(val)
}

export interface $CloudflareBindings {
    RESPOND_WITH_QUERY_LOG: string | boolean;
    RESPOND_WITH_ERRORS: string | boolean;
    ADMIN_SERVICE_TOKEN?: string;
    ADMIN_JWT_SECRET?: string;
    DATABASE_SETTINGS?: string; // JSON.stringify(DatabaseSettings)
}

export interface $Env<Bindings = {}, Variables = {}> {
    Bindings: $CloudflareBindings & Bindings,
    Variables: {
        auth?: AuthContext
        settings: DatabaseSettings
        $db: $Database
    } & Variables
}
