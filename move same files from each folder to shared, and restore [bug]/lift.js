const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const zlib = require('zlib')
const { pipeline } = require('stream')

let targetFolder = process.argv[2]
let forceflag = process.argv[3] == '-f' ? true : false

function checkEnv() {
    if (!targetFolder) { console.log('Must specify target folder'); process.exit(1) }
    if (!fs.existsSync(targetFolder)) { console.log('Target folder not exists'); process.exit(1) }
    if (!fs.statSync(targetFolder).isDirectory()) { console.log('Target folder is not a folder'); process.exit(1) }
    let childs = fs.readdirSync(targetFolder).filter(child => fs.statSync(path.join(targetFolder, child)).isDirectory())


    if (childs.length == 0) {
        console.log('no child folder')
        process.exit(1)
    } else { console.log(childs) }

    if (childs.includes('shared') && !forceflag) {
        console.log('Shared folder exists, add "-f" to force process')
        process.exit(1)
    }
}

async function main() {
    checkEnv()
    let o = list(targetFolder)
    console.log(o)
    createLog(o)
    await moveZipShared(o)
}

main()

function calcMd5(filePath) { return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex') }

function list(folder) {

    let md5Dict = {} // { <fileSize>: [{ "path": [filePath], "md5": thisfileMD5 }] }

    function walkThrough(dir) {
        let files = fs.readdirSync(dir)
        files.forEach((file) => {
            let filePath = path.join(dir, file)
            if (fs.statSync(filePath).isDirectory()) {
                walkThrough(filePath)
            } else {
                let fileSize = fs.statSync(filePath).size
                if (md5Dict[fileSize] == undefined) {
                    md5Dict[fileSize] = [{ path: [filePath], md5: false, size: fileSize }]
                } else {
                    md5Dict[fileSize].forEach(e => {
                        if (e.md5 == false) e.md5 = calcMd5(e.path[0])
                    })

                    let thisfileMD5 = calcMd5(filePath)
                    let sameMd5Index = md5Dict[fileSize].findIndex(e => e.md5 == thisfileMD5)
                    if (sameMd5Index == -1) {
                        md5Dict[fileSize].push({ path: [filePath], md5: thisfileMD5, size: fileSize })
                    } else {
                        md5Dict[fileSize][sameMd5Index].path.push(filePath)
                    }

                }
            }
        })
    }

    let childs = fs.readdirSync(targetFolder).filter(child => fs.statSync(path.join(targetFolder, child)).isDirectory())
    childs.forEach(child => walkThrough(path.join(folder, child)))

    return Object.keys(md5Dict).map(key => md5Dict[key]).flat().filter(e => e.path.length > 1)

}




function createLog(o) {
    let log = o.map(e => {
        return e.path.map(p => { return { path: path.relative(targetFolder, p), md5: e.md5 } })
    }).flat()
    if (forceflag) {
        let oldLog = JSON.parse(fs.readFileSync(path.join(targetFolder, 'shared.json')))
        log = oldLog.concat(log)
        // log de duplicate by e.path 
        log = log.filter((e, i, a) => a.findIndex(t => t.path == e.path) == i)
    }
    fs.writeFileSync(path.join(targetFolder, 'shared.json'), JSON.stringify(log))
}




async function moveZipShared(o) {
    let sharedFolder = path.join(targetFolder, 'shared')
    if (!fs.existsSync(sharedFolder)) fs.mkdirSync(sharedFolder)
    for (let i = 0; i < o.length; i++) {
        let output = path.join(sharedFolder, e.md5)
        if (!fs.existsSync(output)) {
            await streamZipCopy(e.path[0], output)
        }
    }
}


async function streamZipCopy(input, output) {

    const inputStats = fs.statSync(input)
    const isLargeFile = inputStats.size >= 100 * 1024 * 1024 // 100MB in bytes

    const brotliOptions = { chunkSize: 1024 * 1024, params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }

    const gzipOptions = { chunkSize: 1024 * 1024, level: 9, memLevel: 9 }


    if (isLargeFile) {
        const readStream = fs.createReadStream(input)
        const writeStream = fs.createWriteStream(output)
        // const brotliStream = zlib.createBrotliCompress(brotliOptions) 
        const zipStream = zlib.createGzip(gzipOptions)

        await new Promise((resolve, reject) => {
            pipeline(readStream, zipStream, writeStream, (err) => {
                if (err) { reject(err) } else { resolve() }
            });
        })
    } else {
        const data = fs.readFileSync(input)
        // const compressedData = zlib.brotliCompressSync(data, brotliOptions)
        const compressedData = zlib.gzipSync(data, gzipOptions)
        fs.writeFileSync(output, compressedData)
    }
    console.log(`${input} -> ${output}`)
}