import { Injectable } from '@angular/core'
import { HotkeyDescription, HotkeyProvider } from 'tabby-core'

import { TEAROFF_HOTKEY_ID } from './constants'

@Injectable()
export class TearoffHotkeyProvider extends HotkeyProvider {
    async provide (): Promise<HotkeyDescription[]> {
        return [
            {
                id: TEAROFF_HOTKEY_ID,
                name: 'Detach tab into new window',
            },
        ]
    }
}
