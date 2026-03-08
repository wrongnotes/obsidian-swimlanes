import { copyFileSync, mkdirSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import "dotenv/config"

const manifest: { id: string } = JSON.parse(readFileSync("manifest.json", "utf8"))
const pluginId = manifest.id

const vault = process.env.VAULT
if (!vault) {
    console.error("Error: VAULT environment variable not set (path to your Obsidian vault)")
    process.exit(1)
}

const dest = join(vault, ".obsidian", "plugins", pluginId)
mkdirSync(dest, { recursive: true })

if (!existsSync("main.js")) {
    console.error("Error: main.js not found. Run 'npm run build' first.")
    process.exit(1)
}

const files = ["main.js", "manifest.json", "styles.css"]
for (const file of files) {
    if (existsSync(file)) {
        copyFileSync(file, join(dest, file))
        console.log(`Copied ${file} → ${dest}`)
    }
}

console.log(`Plugin "${pluginId}" installed to ${dest}`)
