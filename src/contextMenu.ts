import { Injectable } from '@angular/core'
import { BaseTabComponent, MenuItemOptions, TabContextMenuItemProvider } from 'tabby-core'

import { TEAROFF_CONTEXT_MENU_LABEL } from './constants'
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
                label: TEAROFF_CONTEXT_MENU_LABEL,
                click: () => {
                    void this.tearoff.duplicateToNewWindow(tab)
                },
            },
        ]
    }
}
