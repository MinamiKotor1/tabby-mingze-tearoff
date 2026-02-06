import { ConfigProvider } from 'tabby-core'

import {
    DEFAULT_DRAG_OUT_MARGIN,
    DEFAULT_MAX_PENDING_AGE_MS,
    TEAROFF_HOTKEY_ID,
} from './constants'

export class TearoffConfigProvider extends ConfigProvider {
    defaults = {
        mingzeTearoff: {
            enableDragOut: true,
            dragOutMargin: DEFAULT_DRAG_OUT_MARGIN,
            maxPendingAgeMS: DEFAULT_MAX_PENDING_AGE_MS,
        },
        hotkeys: {
            [TEAROFF_HOTKEY_ID]: [],
        },
    }
}
