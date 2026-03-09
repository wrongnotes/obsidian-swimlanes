// Minimal mock of the Obsidian API for Jest tests.
// Add to this file as more Obsidian APIs are used in source code.

export class Component {
    load() {}
    unload() {}
}

export abstract class BasesView extends Component {
    app: unknown
    config: unknown
    allProperties: unknown[] = []
    data: any

    protected constructor(_controller: unknown) {
        super()
    }

    abstract type: string
    abstract onDataUpdated(): void
}

export class QueryController extends Component {}
