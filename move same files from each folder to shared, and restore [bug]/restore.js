const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const zlib = require('zlib')
const { pipeline } = require('stream')

let targetFolder = process.argv[2] || __dirname

function checkEnv() {
    if (!targetFolder) { console.log('Must specify target folder'); process.exit(1) }
    if (!fs.existsSync(targetFolder)) { console.log('Target folder not exists'); process.exit(1) }
    if (!fs.statSync(targetFolder).isDirectory()) { console.log('Target folder is not a folder'); process.exit(1) }
    if (!fs.existsSync(path.join(targetFolder, 'shared.json'))) { console.log('shared.json not exists'); process.exit(1) }
    if (!fs.statSync(path.join(targetFolder, 'shared.json')).isFile()) { console.log('shared.json is not a file'); process.exit(1) }
    if (!fs.existsSync(path.join(targetFolder, 'shared'))) { console.log('shared folder not exists'); process.exit(1) }
}

function main() {
    checkEnv()
    let childs = fs.readdirSync(targetFolder).filter(child => fs.statSync(path.join(targetFolder, child)).isDirectory() && child != 'shared')
    let o = JSON.parse(fs.readFileSync(path.join(targetFolder, 'shared.json')))
        .filter(e => childs.includes(e.path.split(path.sep)[0]));
    for (let i = 0; i < o.length; i++) {
        let output = path.join(targetFolder, o[i].path)
        let input = path.join(targetFolder, 'shared', o[i].md5)
        streamUnzipCopy(input, output)
    }
}

main()

function streamUnzipCopy(input, output) {
    const inputStats = fs.statSync(input)
    const isLargeFile = inputStats.size >= 100 * 1024 * 1024 // 100MB in bytes

    if (isLargeFile) {
        const readStream = fs.createReadStream(input)
        const writeStream = fs.createWriteStream(output)
        const brotliStream = zlib.createBrotliDecompress() // const zipStream = zlib.createGunzip()

        pipeline(readStream, brotliStream, writeStream, (err) => {
            if (err) {
                console.error('Error during pipeline:', err)
            }
        })
    } else {
        const data = fs.readFileSync(input)
        const compressedData = zlib.brotliDecompressSync(data) // compressedData = zlib.gunzipSync(data)
        fs.writeFileSync(output, compressedData)
    }
    console.log(`${input} -> ${output}`)
}

function moveZipShared(o) {
    let sharedFolder = path.join(targetFolder, 'shared')
    if (!fs.existsSync(sharedFolder)) fs.mkdirSync(sharedFolder)
    o.forEach(e => {
        let output = path.join(sharedFolder, e.md5)
        if (!fs.existsSync(output)) {
            streamZipCopy(e.path[0], output)
        }
        e.path.forEach(p => fs.unlinkSync(p))
    })
}


