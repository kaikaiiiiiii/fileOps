const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

//////////////////////////////////////////////////

const workingDir = process.argv[2] || "D:\\Adobe"

function folderHashSync(dir, onlyCalcNessesary = false) {

    if (dir === undefined) { return null }
    if (typeof dir === 'string') { dir = dir.split(",") } else { return null }
    console.log('Start hashing: ' + dir)

    let memo = {}, result = []

    async function walkDir(currentPath) {
        const files = fs.readdirSync(currentPath)

        for (const file of files) {
            const filePath = path.join(currentPath, file);
            const stats = fs.statSync(filePath);

            if (stats.isDirectory()) {
                walkDir(filePath);
            } else {
                if (onlyCalcNessesary) {
                    let memokey = stats.size
                    if (memo[memokey]) {
                        const fileMD5 = md5File(filePath)
                        if (memo[memokey].hash[0] === "") {
                            memo[memokey].hash[0] = md5File(memo[memokey].path[0])
                        }

                        memo[memokey].path.push(filePath);
                        memo[memokey].hash.push(fileMD5);

                    } else {
                        // 第一次不计算 MD5 提高效率
                        memo[memokey] = {};
                        memo[memokey].path = [filePath];
                        memo[memokey].hash = [""]

                    }
                } else {
                    result.push({ hash: md5File(filePath), size: stats.size, path: filePath })
                }
            }
        }
    }

    for (let i = 0; i < dir.length; i++) {
        walkDir(dir[i])
    }

    if (onlyCalcNessesary) {
        for (t in memo) {
            let paths = memo[t].path
            let md5s = memo[t].hash
            paths.forEach((p, i) => {
                result.push({ hash: md5s[i], size: t, path: p })
            })
        }
    }
    return result;
}

function md5File(path) {
    const BUFFER_SIZE = 8192
    const fd = fs.openSync(path, 'r')
    const hash = crypto.createHash('md5')
    const buffer = Buffer.alloc(BUFFER_SIZE)

    try {
        let bytesRead

        do {
            bytesRead = fs.readSync(fd, buffer, 0, BUFFER_SIZE)
            hash.update(buffer.slice(0, bytesRead))
        } while (bytesRead === BUFFER_SIZE)
    } finally {
        fs.closeSync(fd)
    }

    return hash.digest('hex')
}


function main() {

    if (!fs.existsSync(workingDir)) { console.log("Folder not found"); return; }

    let records = {}

    folderHashSync(workingDir, true).filter(e => e.hash !== "").forEach(e => {
        let relativepath = e.path.replace(workingDir, "")
        if (records[e.hash]) {
            records[e.hash].push(relativepath)
        } else {
            records[e.hash] = [relativepath]
        }
    })

    fs.writeFileSync(workingDir + "\\records.log", JSON.stringify(records), "utf-8")
    fs.mkdirSync(workingDir + "\\shared", { recursive: true });

    for (line in records) {
        let samefiles = records[line]
        fs.renameSync(workingDir + "\\" + samefiles[0], workingDir + "\\shared\\" + line)
        if (samefiles.length > 1) {
            for (i = 1; i < samefiles.length; i++) {
                fs.unlinkSync(workingDir + "\\" + samefiles[i])
            }
        }
    }

    console.log("Works Done!")
}

main()