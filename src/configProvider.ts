import { ConfigProvider } from 'tabby-core'

export class TearoffConfigProvider extends ConfigProvider {
    defaults = {
        mingzeTearoff: {
            enableDragOut: true,
            dragOutMargin: 0,
        },
        hotkeys: {
            'tearoff-tab': [],
        },
    }
}
