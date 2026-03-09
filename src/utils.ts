import type { App, TFile } from "obsidian"

export function getFrontmatter<T>(app: App, file: TFile, key: string): T | undefined {
    return app.metadataCache.getFileCache(file)?.frontmatter?.[key] as T | undefined
}
