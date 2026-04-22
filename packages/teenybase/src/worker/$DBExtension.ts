import {HttpRoute} from "../types/route";
import {$Database} from "./$Database";
import {$Env} from './env'
import {DBMigration} from './migrationHelper'

export interface $DBExtension<T extends $Env = $Env>{
    // new<T extends $Env = $Env>(db: $Database<T>, ...rest: any[]): $DBExtension<T>
    getAuthToken?(): Promise<string | undefined>
    // Return a migration entry if this extension created infra to be recorded in _db_migrations
    // (replayable on a fresh DB). Return null/void if nothing to record.
    setup?(version: number): Promise<Omit<DBMigration, 'id'> | null | void>
    routes: HttpRoute[]
}
