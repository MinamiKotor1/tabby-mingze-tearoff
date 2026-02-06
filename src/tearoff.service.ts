import { Injectable } from '@angular/core'
import {
    AppService,
    BaseTabComponent,
    ConfigService,
    HotkeysService,
    HostAppService,
    Logger,
    LogService,
    NotificationsService,
    RecoveryToken,
    SplitTabComponent,
    TabRecoveryService,
} from 'tabby-core'
import { BaseTerminalTabComponent } from 'tabby-terminal'

interface TearoffConfig {
    enableDragOut: boolean
    dragOutMargin: number
    maxPendingAgeMS: number
}

interface PendingTearoffPayload {
    version: number
    id: string
    createdAt: number
    sourceWindowId: string
    token: RecoveryToken
}

interface PendingClaim {
    windowId: string
    claimedAt: number
}

interface SessionLike {
    open?: boolean
    getID?: () => string|null
    getPTYID?: () => string|null
}

interface SessionSnapshot {
    session: SessionLike
    open: boolean
}

const PENDING_KEY_PREFIX = 'mingze-tearoff-pending-'
const CLAIM_KEY_SUFFIX = ':claim'
const PAYLOAD_VERSION = 1
const CLAIM_TTL_MS = 15000

@Injectable({ providedIn: 'root' })
export class TearoffService {
    private initialized = false
    private dragListenersAttached = false
    private inFlight = false
    private draggedTab: BaseTabComponent|null = null
    private windowBootAt = Date.now()
    private windowInstanceId = this.createID()
    private logger: Logger
    private lastPointer = { x: 0, y: 0 }

    constructor (
        private app: AppService,
        private hostApp: HostAppService,
        private hotkeys: HotkeysService,
        private tabRecovery: TabRecoveryService,
        private notifications: NotificationsService,
        private config: ConfigService,
        log: LogService,
    ) {
        this.logger = log.create('mingze-tearoff')
    }

    init (): void {
        if (this.initialized) {
            return
        }
        this.initialized = true

        this.hotkeys.hotkey$.subscribe((hotkey: string) => {
            if (hotkey === 'tearoff-tab') {
                void this.tearoff(this.app.activeTab)
            }
        })

        this.app.tabDragActive$.subscribe((tab: BaseTabComponent|null) => {
            this.onDragStateChanged(tab)
        })

        this.app.ready$.subscribe(() => {
            void this.consumePendingTearoff()
        })
    }

    isSupportedTab (tab: BaseTabComponent): boolean {
        if (tab instanceof BaseTerminalTabComponent) {
            return true
        }
        if (tab instanceof SplitTabComponent) {
            return true
        }
        return typeof (tab as { getRecoveryToken?: unknown }).getRecoveryToken === 'function'
    }

    async tearoff (tab: BaseTabComponent|null): Promise<boolean> {
        if (!tab) {
            return false
        }
        if (!this.isSupportedTab(tab)) {
            this.notifications.error('This tab type cannot be detached')
            return false
        }
        if (this.inFlight) {
            return false
        }

        this.inFlight = true
        this.draggedTab = null
        this.detachDragListeners()

        let pendingKey: string|null = null
        let suspendedSessions: SessionSnapshot[] = []

        try {
            const token = await this.tabRecovery.getFullRecoveryToken(tab)
            if (!token) {
                this.notifications.error('This tab does not support state transfer')
                return false
            }

            const recoverable = await this.tabRecovery.recoverTab(token)
            if (!recoverable) {
                this.notifications.error('This tab cannot be restored in another window')
                return false
            }

            const transferablePTYIDs = this.collectTransferablePTYIDs(token)
            suspendedSessions = this.suspendSessionsForTransfer(tab, transferablePTYIDs)
            pendingKey = this.enqueueToken(token)

            await this.destroyTab(tab)
            this.hostApp.newWindow()
            return true
        } catch (error) {
            if (pendingKey) {
                this.removePendingToken(pendingKey)
            }
            this.restoreSuspendedSessions(suspendedSessions)
            this.logger.warn('Tearoff failed', error)
            this.notifications.error('Detach failed')
            return false
        } finally {
            this.inFlight = false
        }
    }

    private onDragStateChanged (tab: BaseTabComponent|null): void {
        if (!this.currentConfig().enableDragOut) {
            return
        }
        if (tab) {
            this.draggedTab = tab
            this.attachDragListeners()
        } else {
            this.draggedTab = null
            this.detachDragListeners()
        }
    }

    private attachDragListeners (): void {
        if (this.dragListenersAttached) {
            return
        }
        this.dragListenersAttached = true
        document.addEventListener('mousemove', this.onDocumentMouseMove, true)
        document.addEventListener('mouseup', this.onDocumentMouseUp, true)
    }

    private detachDragListeners (): void {
        if (!this.dragListenersAttached) {
            return
        }
        this.dragListenersAttached = false
        document.removeEventListener('mousemove', this.onDocumentMouseMove, true)
        document.removeEventListener('mouseup', this.onDocumentMouseUp, true)
    }

    private onDocumentMouseMove = (event: MouseEvent): void => {
        this.lastPointer = {
            x: event.screenX,
            y: event.screenY,
        }
    }

    private onDocumentMouseUp = (event: MouseEvent): void => {
        if (!this.draggedTab) {
            return
        }

        const tab = this.draggedTab
        this.draggedTab = null
        this.detachDragListeners()

        const x = event.screenX || this.lastPointer.x
        const y = event.screenY || this.lastPointer.y
        if (!this.isPointOutsideWindow(x, y)) {
            return
        }

        setTimeout(() => {
            void this.tearoff(tab)
        })
    }

    private isPointOutsideWindow (x: number, y: number): boolean {
        const margin = Math.max(0, this.currentConfig().dragOutMargin)
        const left = window.screenX
        const top = window.screenY
        const right = left + window.outerWidth
        const bottom = top + window.outerHeight

        return x < left - margin || x > right + margin || y < top - margin || y > bottom + margin
    }

    private currentConfig (): TearoffConfig {
        const userConfig = this.config.store?.mingzeTearoff ?? {}
        return {
            enableDragOut: userConfig.enableDragOut ?? true,
            dragOutMargin: typeof userConfig.dragOutMargin === 'number' ? userConfig.dragOutMargin : 0,
            maxPendingAgeMS: typeof userConfig.maxPendingAgeMS === 'number' ? userConfig.maxPendingAgeMS : 60000,
        }
    }

    private collectTransferablePTYIDs (token: RecoveryToken): Set<string> {
        const ids = new Set<string>()
        const visited = new Set<unknown>()

        const walk = (value: unknown): void => {
            if (!value || typeof value !== 'object') {
                return
            }
            if (visited.has(value)) {
                return
            }
            visited.add(value)

            const maybeProfileOptions = (value as { profile?: { options?: { restoreFromPTYID?: unknown } } }).profile?.options
            if (typeof maybeProfileOptions?.restoreFromPTYID === 'string' && maybeProfileOptions.restoreFromPTYID.length) {
                ids.add(maybeProfileOptions.restoreFromPTYID)
            }

            if (Array.isArray(value)) {
                for (const item of value) {
                    walk(item)
                }
                return
            }

            for (const key in value as Record<string, unknown>) {
                walk((value as Record<string, unknown>)[key])
            }
        }

        walk(token)
        return ids
    }

    private suspendSessionsForTransfer (tab: BaseTabComponent, transferablePTYIDs: Set<string>): SessionSnapshot[] {
        if (transferablePTYIDs.size === 0) {
            return []
        }

        const snapshots: SessionSnapshot[] = []
        for (const terminalTab of this.collectTerminalTabs(tab)) {
            const session = (terminalTab as { session?: SessionLike }).session
            if (!session || typeof session.open !== 'boolean') {
                continue
            }
            const sessionID = this.getSessionID(session)
            if (!sessionID || !transferablePTYIDs.has(sessionID)) {
                continue
            }
            snapshots.push({ session, open: session.open })
            session.open = false
        }

        return snapshots
    }

    private restoreSuspendedSessions (snapshots: SessionSnapshot[]): void {
        for (const snapshot of snapshots) {
            snapshot.session.open = snapshot.open
        }
    }

    private getSessionID (session: SessionLike): string|null {
        if (typeof session.getID === 'function') {
            return session.getID()
        }
        if (typeof session.getPTYID === 'function') {
            return session.getPTYID()
        }
        return null
    }

    private collectTerminalTabs (root: BaseTabComponent): BaseTerminalTabComponent[] {
        const result: BaseTerminalTabComponent[] = []
        const stack: BaseTabComponent[] = [root]

        while (stack.length > 0) {
            const tab = stack.pop()!
            if (tab instanceof BaseTerminalTabComponent) {
                result.push(tab)
            }
            if (tab instanceof SplitTabComponent) {
                for (const child of tab.getAllTabs()) {
                    stack.push(child)
                }
            }
        }

        return result
    }

    private async destroyTab (tab: BaseTabComponent): Promise<void> {
        const maybePromise = (tab as unknown as { destroy: () => void|Promise<void> }).destroy()
        if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
            await maybePromise
        }
    }

    private enqueueToken (token: RecoveryToken): string {
        const createdAt = Date.now()
        const id = this.createID()
        const key = PENDING_KEY_PREFIX + createdAt + '-' + id
        const payload: PendingTearoffPayload = {
            version: PAYLOAD_VERSION,
            id,
            createdAt,
            sourceWindowId: this.windowInstanceId,
            token,
        }
        localStorage.setItem(key, JSON.stringify(payload))
        return key
    }

    private removePendingToken (key: string): void {
        localStorage.removeItem(key)
        localStorage.removeItem(this.claimKeyFor(key))
    }

    private async consumePendingTearoff (): Promise<void> {
        const keys = this.listPendingKeys()
        for (const key of keys) {
            const payload = this.readPendingPayload(key)
            if (!payload) {
                this.removePendingToken(key)
                continue
            }

            const age = Date.now() - payload.createdAt
            if (age > this.currentConfig().maxPendingAgeMS) {
                this.removePendingToken(key)
                continue
            }

            if (!this.shouldCurrentWindowConsume(payload)) {
                continue
            }

            if (!this.tryClaim(key)) {
                continue
            }

            try {
                this.removePendingToken(key)
                const params = await this.tabRecovery.recoverTab(payload.token)
                if (!params) {
                    this.logger.warn('Cannot recover detached token', payload.id)
                    continue
                }
                this.app.openNewTab(params)
            } catch (error) {
                this.logger.warn('Failed to consume detached tab payload', payload.id, error)
            }
        }
    }

    private shouldCurrentWindowConsume (payload: PendingTearoffPayload): boolean {
        if (payload.version !== PAYLOAD_VERSION) {
            return false
        }
        if (payload.sourceWindowId === this.windowInstanceId) {
            return false
        }
        if (payload.createdAt > Date.now() + 60000) {
            return false
        }
        return this.windowBootAt >= payload.createdAt
    }

    private tryClaim (key: string): boolean {
        const claimKey = this.claimKeyFor(key)
        const existingClaim = this.readClaim(claimKey)
        const now = Date.now()

        if (existingClaim && now - existingClaim.claimedAt < CLAIM_TTL_MS) {
            return false
        }

        const claim: PendingClaim = {
            windowId: this.windowInstanceId,
            claimedAt: now,
        }
        localStorage.setItem(claimKey, JSON.stringify(claim))

        const confirmedClaim = this.readClaim(claimKey)
        return confirmedClaim?.windowId === this.windowInstanceId
    }

    private listPendingKeys (): string[] {
        const keys: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (!key || !key.startsWith(PENDING_KEY_PREFIX) || key.endsWith(CLAIM_KEY_SUFFIX)) {
                continue
            }
            keys.push(key)
        }
        return keys.sort()
    }

    private readPendingPayload (key: string): PendingTearoffPayload|null {
        const raw = localStorage.getItem(key)
        if (!raw) {
            return null
        }
        try {
            const parsed = JSON.parse(raw) as PendingTearoffPayload
            if (!parsed || typeof parsed !== 'object') {
                return null
            }
            if (typeof parsed.createdAt !== 'number' || typeof parsed.sourceWindowId !== 'string') {
                return null
            }
            if (!parsed.token || typeof parsed.token !== 'object') {
                return null
            }
            return parsed
        } catch {
            return null
        }
    }

    private readClaim (key: string): PendingClaim|null {
        const raw = localStorage.getItem(key)
        if (!raw) {
            return null
        }
        try {
            const parsed = JSON.parse(raw) as PendingClaim
            if (!parsed || typeof parsed.windowId !== 'string' || typeof parsed.claimedAt !== 'number') {
                return null
            }
            return parsed
        } catch {
            return null
        }
    }

    private claimKeyFor (key: string): string {
        return key + CLAIM_KEY_SUFFIX
    }

    private createID (): string {
        return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
    }
}
