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
    Profile,
    ProfilesService,
    SplitTabComponent,
} from 'tabby-core'
import { BaseTerminalTabComponent } from 'tabby-terminal'

interface DuplicateWindowConfig {
    enableDragOut: boolean
    dragOutMargin: number
}

interface ProfileData {
    profile: Profile
    createdAt: number
}

const PROFILE_KEY_PREFIX = 'mingze-tearoff-profile-'

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
        private profiles: ProfilesService,
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
            if (hotkey === 'tearoff-tab') {
                void this.duplicateToNewWindow(this.app.activeTab)
            }
        })

        this.app.tabDragActive$.subscribe((tab: BaseTabComponent | null) => {
            this.onDragStateChanged(tab)
        })

        // Listen for app ready to consume pending profiles
        this.app.ready$.subscribe(() => {
            void this.consumePendingProfile()
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

    /**
     * Duplicate the tab's profile to a new window.
     */
    async duplicateToNewWindow(tab: BaseTabComponent | null): Promise<boolean> {
        if (!tab) {
            return false
        }

        if (!this.isSupportedTab(tab)) {
            this.notifications.error('This tab type is not supported')
            return false
        }

        try {
            const terminalTab = this.getTerminalTab(tab)
            if (!terminalTab) {
                this.notifications.error('Could not find terminal tab')
                return false
            }

            const profile = this.getTabProfile(terminalTab)
            if (!profile) {
                this.notifications.error('Could not get tab profile')
                return false
            }

            // Store profile in localStorage for new window
            const profileKey = PROFILE_KEY_PREFIX + Date.now()
            const profileData: ProfileData = {
                profile,
                createdAt: Date.now(),
            }
            localStorage.setItem(profileKey, JSON.stringify(profileData))
            this.logger.info('Saved profile for new window:', profile.name)

            // Open new window
            this.hostApp.newWindow()

            // Clean up after 30 seconds
            setTimeout(() => {
                localStorage.removeItem(profileKey)
            }, 30000)

            return true
        } catch (error) {
            this.logger.warn('Failed to duplicate to new window', error)
            this.notifications.error('Failed to open in new window')
            return false
        }
    }

    /**
     * Called on app ready to check if there's a pending profile to open
     */
    async consumePendingProfile(): Promise<void> {
        const keys = this.listPendingProfileKeys()
        if (keys.length === 0) {
            return
        }

        // Get most recent pending profile
        const key = keys[keys.length - 1]
        const raw = localStorage.getItem(key)
        if (!raw) {
            return
        }

        try {
            const data: ProfileData = JSON.parse(raw)
            const age = Date.now() - data.createdAt

            // Only consume if created recently (within 10 seconds)
            if (age > 10000) {
                this.logger.info('Pending profile too old, ignoring:', age, 'ms')
                return
            }

            // Remove from localStorage immediately
            localStorage.removeItem(key)

            if (data.profile) {
                this.logger.info('Opening tab from pending profile:', data.profile.name)
                // Use ProfilesService to open the tab
                await this.profiles.openNewTabForProfile(data.profile)
            }
        } catch (error) {
            this.logger.warn('Failed to consume pending profile', error)
        }
    }

    private listPendingProfileKeys(): string[] {
        const keys: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key?.startsWith(PROFILE_KEY_PREFIX)) {
                keys.push(key)
            }
        }
        return keys.sort()
    }

    private getTerminalTab(tab: BaseTabComponent): BaseTerminalTabComponent | null {
        if (tab instanceof BaseTerminalTabComponent) {
            return tab
        }
        if (tab instanceof SplitTabComponent) {
            return this.getFirstTerminalTab(tab)
        }
        return null
    }

    private getFirstTerminalTab(splitTab: SplitTabComponent): BaseTerminalTabComponent | null {
        for (const child of splitTab.getAllTabs()) {
            if (child instanceof BaseTerminalTabComponent) {
                return child
            }
        }
        return null
    }

    private getTabProfile(tab: BaseTerminalTabComponent): Profile | null {
        const tabAny = tab as unknown as { profile?: Profile }
        if (tabAny.profile) {
            return tabAny.profile
        }
        return null
    }

    private onDragStateChanged(tab: BaseTabComponent | null): void {
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

        setTimeout(() => {
            void this.duplicateToNewWindow(tab)
        })
    }

    private isPointOutsideWindow(x: number, y: number): boolean {
        const margin = Math.max(0, this.currentConfig().dragOutMargin)
        const left = window.screenX
        const top = window.screenY
        const right = left + window.outerWidth
        const bottom = top + window.outerHeight

        return x < left - margin || x > right + margin || y < top - margin || y > bottom + margin
    }

    private currentConfig(): DuplicateWindowConfig {
        const userConfig = this.config.store?.mingzeTearoff ?? {}
        return {
            enableDragOut: userConfig.enableDragOut ?? true,
            dragOutMargin: typeof userConfig.dragOutMargin === 'number' ? userConfig.dragOutMargin : 0,
        }
    }
}
