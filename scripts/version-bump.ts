import { readFileSync, writeFileSync } from "fs"

interface Manifest {
    version: string
    minAppVersion: string
}

const targetVersion = process.env.npm_package_version
if (!targetVersion) {
    console.error("Error: npm_package_version is not set")
    process.exit(1)
}

const manifest: Manifest = JSON.parse(readFileSync("manifest.json", "utf8"))
const { minAppVersion } = manifest
manifest.version = targetVersion
writeFileSync("manifest.json", JSON.stringify(manifest, null, 4))

const versions: Record<string, string> = JSON.parse(readFileSync("versions.json", "utf8"))
if (!Object.values(versions).includes(minAppVersion)) {
    versions[targetVersion] = minAppVersion
    writeFileSync("versions.json", JSON.stringify(versions, null, 4))
}
