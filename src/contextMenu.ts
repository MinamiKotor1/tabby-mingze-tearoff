import { Injectable } from '@angular/core'
import { BaseTabComponent, MenuItemOptions, TabContextMenuItemProvider } from 'tabby-core'
import { TearoffService } from './tearoff.service'

@Injectable()
export class TearoffContextMenuProvider extends TabContextMenuItemProvider {
    weight = 15

    constructor(
        private tearoff: TearoffService,
    ) {
        super()
    }

    async getItems(tab: BaseTabComponent): Promise<MenuItemOptions[]> {
        if (!this.tearoff.isSupportedTab(tab)) {
            return []
        }

        return [
            {
                label: '在新窗口中打开',
                click: () => {
                    setTimeout(() => {
                        void this.tearoff.duplicateToNewWindow(tab)
                    })
                },
            },
        ]
    }
}
