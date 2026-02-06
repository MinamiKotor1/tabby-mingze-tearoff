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

import {
    DEFAULT_DRAG_OUT_MARGIN,
    DEFAULT_MAX_PENDING_AGE_MS,
    PENDING_TEAROFF_KEY_PREFIX,
    TEAROFF_HOTKEY_ID,
} from './constants'

interface TearoffConfig {
    enableDragOut: boolean
    dragOutMargin: number
    maxPendingAgeMS: number
}

interface TearoffUserConfig {
    enableDragOut?: unknown
    dragOutMargin?: unknown
    maxPendingAgeMS?: unknown
}

interface PendingTearoffData {
    requestID: string
    createdAt: number
    recoveryToken: RecoveryToken
}

interface PendingTearoffRecord {
    key: string
    data: PendingTearoffData
}

@Injectable({ providedIn: 'root' })
export class TearoffService {
    private initialized = false
    private dragListenersAttached = false
    private draggedTab: BaseTabComponent | null = null
    private logger: Logger
    private lastPointer = { x: 0, y: 0 }

    constructor(
        private app: AppService,
        private hostApp: HostAppService,
        private hotkeys: HotkeysService,
        private notifications: NotificationsService,
        private config: ConfigService,
        private tabRecovery: TabRecoveryService,
        log: LogService,
    ) {
        this.logger = log.create('mingze-tearoff')
    }

    init(): void {
        if (this.initialized) {
            return
        }
        this.initialized = true

        this.hotkeys.hotkey$.subscribe((hotkey: string) => {
            if (hotkey === TEAROFF_HOTKEY_ID) {
                void this.duplicateToNewWindow(this.app.activeTab)
            }
        })

        this.app.tabDragActive$.subscribe((tab: BaseTabComponent | null) => {
            this.onDragStateChanged(tab)
        })

        this.app.ready$.subscribe(() => {
            void this.consumePendingRecovery()
        })
    }

    isSupportedTab(tab: BaseTabComponent): boolean {
        if (tab instanceof BaseTerminalTabComponent) {
            return true
        }
        if (tab instanceof SplitTabComponent) {
            return this.getFirstTerminalTab(tab) !== null
        }
        return false
    }

    async duplicateToNewWindow(tab: BaseTabComponent | null): Promise<boolean> {
        if (!tab) {
            return false
        }

        if (!this.isSupportedTab(tab)) {
            this.notifications.error('This tab type is not supported')
            return false
        }

        try {
            const recoveryToken = await this.tabRecovery.getFullRecoveryToken(tab)
            if (!recoveryToken) {
                this.notifications.error('Could not create recovery token for this tab')
                return false
            }

            const request = this.createPendingRequest(recoveryToken)
            const requestKey = this.pendingStorageKey(request.requestID)

            this.prunePendingRequests()
            localStorage.setItem(requestKey, JSON.stringify(request))

            this.logger.info('Saved tear-off request:', request.requestID, 'type=', recoveryToken.type)

            this.hostApp.newWindow()

            window.setTimeout(() => {
                this.removePendingRequest(requestKey)
            }, this.currentConfig().maxPendingAgeMS + 5000)

            return true
        } catch (error) {
            this.logger.warn('Failed to duplicate to new window', error)
            this.notifications.error('Failed to open in new window')
            return false
        }
    }

    async consumePendingRecovery(): Promise<void> {
        const pending = this.collectPendingRequests()
        if (pending.length === 0) {
            return
        }

        const next = pending[0]
        this.removePendingRequest(next.key)

        try {
            const recoveredTab = await this.tabRecovery.recoverTab(next.data.recoveryToken, true)
            if (!recoveredTab) {
                this.logger.warn('Could not recover pending tab from request:', next.data.requestID)
                return
            }

            this.app.openNewTab(recoveredTab)
            this.logger.info('Recovered tab from request:', next.data.requestID)
        } catch (error) {
            this.logger.warn('Failed to consume pending recovery', error)
        }
    }

    private onDragStateChanged(tab: BaseTabComponent | null): void {
        if (!tab) {
            this.draggedTab = null
            this.detachDragListeners()
            return
        }

        if (!this.currentConfig().enableDragOut) {
            this.draggedTab = null
            this.detachDragListeners()
            return
        }

        this.draggedTab = tab
        this.attachDragListeners()
    }

    private attachDragListeners(): void {
        if (this.dragListenersAttached) {
            return
        }
        this.dragListenersAttached = true
        document.addEventListener('mousemove', this.onDocumentMouseMove, true)
        document.addEventListener('mouseup', this.onDocumentMouseUp, true)
    }

    private detachDragListeners(): void {
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

        window.setTimeout(() => {
            void this.duplicateToNewWindow(tab)
        })
    }

    private getFirstTerminalTab(splitTab: SplitTabComponent): BaseTerminalTabComponent | null {
        for (const child of splitTab.getAllTabs()) {
            if (child instanceof BaseTerminalTabComponent) {
                return child
            }
        }
        return null
    }

    private isPointOutsideWindow(x: number, y: number): boolean {
        const margin = Math.max(0, this.currentConfig().dragOutMargin)
        const left = window.screenX
        const top = window.screenY
        const right = left + window.outerWidth
        const bottom = top + window.outerHeight

        return x < left - margin || x > right + margin || y < top - margin || y > bottom + margin
    }

    private createPendingRequest(recoveryToken: RecoveryToken): PendingTearoffData {
        return {
            requestID: this.generateRequestID(),
            createdAt: Date.now(),
            recoveryToken,
        }
    }

    private generateRequestID(): string {
        return String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10)
    }

    private pendingStorageKey(requestID: string): string {
        return PENDING_TEAROFF_KEY_PREFIX + requestID
    }

    private collectPendingRequests(): PendingTearoffRecord[] {
        const records: PendingTearoffRecord[] = []
        const staleKeys: string[] = []
        const now = Date.now()
        const maxAge = this.currentConfig().maxPendingAgeMS

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (!key?.startsWith(PENDING_TEAROFF_KEY_PREFIX)) {
                continue
            }

            const raw = localStorage.getItem(key)
            if (!raw) {
                staleKeys.push(key)
                continue
            }

            const parsed = this.parsePendingRequest(raw)
            if (!parsed) {
                staleKeys.push(key)
                continue
            }

            if (now - parsed.createdAt > maxAge) {
                staleKeys.push(key)
                continue
            }

            records.push({ key, data: parsed })
        }

        for (const key of staleKeys) {
            this.removePendingRequest(key)
        }

        return records.sort((a, b) => a.data.createdAt - b.data.createdAt)
    }

    private parsePendingRequest(raw: string): PendingTearoffData | null {
        try {
            const parsed = JSON.parse(raw) as {
                requestID?: unknown
                createdAt?: unknown
                recoveryToken?: unknown
            }

            if (typeof parsed.requestID !== 'string') {
                return null
            }

            if (typeof parsed.createdAt !== 'number' || !Number.isFinite(parsed.createdAt)) {
                return null
            }

            if (!this.isRecoveryToken(parsed.recoveryToken)) {
                return null
            }

            return {
                requestID: parsed.requestID,
                createdAt: parsed.createdAt,
                recoveryToken: parsed.recoveryToken,
            }
        } catch {
            return null
        }
    }

    private isRecoveryToken(value: unknown): value is RecoveryToken {
        if (typeof value !== 'object' || value === null) {
            return false
        }

        return typeof (value as Record<string, unknown>).type === 'string'
    }

    private prunePendingRequests(): void {
        void this.collectPendingRequests()
    }

    private removePendingRequest(key: string): void {
        localStorage.removeItem(key)
    }

    private currentConfig(): TearoffConfig {
        const userConfig = (this.config.store?.mingzeTearoff ?? {}) as TearoffUserConfig

        return {
            enableDragOut: typeof userConfig.enableDragOut === 'boolean' ? userConfig.enableDragOut : true,
            dragOutMargin: typeof userConfig.dragOutMargin === 'number' && Number.isFinite(userConfig.dragOutMargin)
                ? Math.max(0, userConfig.dragOutMargin)
                : DEFAULT_DRAG_OUT_MARGIN,
            maxPendingAgeMS: typeof userConfig.maxPendingAgeMS === 'number' && Number.isFinite(userConfig.maxPendingAgeMS)
                ? Math.max(1000, userConfig.maxPendingAgeMS)
                : DEFAULT_MAX_PENDING_AGE_MS,
        }
    }
}
