import { ConfigProvider } from 'tabby-core'

export class TearoffConfigProvider extends ConfigProvider {
    defaults = {
        mingzeTearoff: {
            enableDragOut: true,
            dragOutMargin: 0,
            maxPendingAgeMS: 60000,
        },
        hotkeys: {
            'tearoff-tab': [],
        },
    }
}
