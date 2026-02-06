import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import TabbyCoreModule, { ConfigProvider, HotkeyProvider, TabContextMenuItemProvider } from 'tabby-core'

import { TearoffConfigProvider } from './configProvider'
import { TearoffHotkeyProvider } from './hotkeyProvider'
import { TearoffContextMenuProvider } from './contextMenu'
import { TearoffService } from './tearoff.service'

@NgModule({
    imports: [
        CommonModule,
        TabbyCoreModule,
    ],
    providers: [
        { provide: ConfigProvider, useClass: TearoffConfigProvider, multi: true },
        { provide: HotkeyProvider, useClass: TearoffHotkeyProvider, multi: true },
        { provide: TabContextMenuItemProvider, useClass: TearoffContextMenuProvider, multi: true },
    ],
})
export default class MingzeTearoffModule {
    constructor(
        tearoff: TearoffService,
    ) {
        tearoff.init()
    }
}
