const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

//////////////////////////////////////////////////

const workingDir = process.argv[2];
const scanmode = process.argv[3] || 'dups'

if (workingDir === undefined) { console.log("Please input the folder to hash"); process.exit(); }


/* 
    3 MODES:
    full: calc md5 for every file
    fast: compare file size first, only calc md5 when file size is same
    dup: calc as fast mode, but return results with only duplicated files
*/

function folderHashSync(dir, mode = 'full') {

    if (dir === undefined) { return null }
    if (typeof dir === 'string') { dir = dir.split(",") }
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
                // processing file
                if (mode === 'fast' || mode === 'dups') {
                    let memokey = stats.size
                    if (memo[memokey]) {
                        const fileMD5 = md5File(filePath)
                        if (memo[memokey].hash[0] === "") {
                            memo[memokey].hash[0] = md5File(memo[memokey].path[0])
                        }
                        memo[memokey].path.push(filePath);
                        memo[memokey].hash.push(fileMD5);
                    } else {
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

    if (mode == 'fast') {
        Object.entries(memo).forEach(([key, value]) => {
            let paths = value.path
            let md5s = value.hash
            paths.forEach((p, i) => {
                result.push({ hash: md5s[i], size: key, path: p })
            })
        })
    }

    if (mode == 'dups') {
        Object.entries(memo).forEach(([key, value]) => {
            let paths = value.path
            let md5s = value.hash
            let dupmemo = {}
            md5s.forEach(md5 => {
                if (dupmemo[md5]) { dupmemo[md5]++ } else { dupmemo[md5] = 1 }
            })
            md5s.forEach((md5, i) => {
                if (dupmemo[md5] > 1) {
                    result.push({ hash: md5, size: key, path: paths[i] })
                }
            })
        })
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


function hashHead(path, size = 0) {
    const BUFFER_SIZE = 16 * 1024;
    const fd = fs.openSync(path, 'r');
    const hash = crypto.createHash('md5');
    const buffer = Buffer.alloc(BUFFER_SIZE);

    try {
        let bytesRead;
        let totalBytesRead = 0;

        do {
            let bytesToRead = BUFFER_SIZE;
            if (headsize !== null && totalBytesRead + BUFFER_SIZE > headsize) {
                bytesToRead = headsize - totalBytesRead;
            }

            bytesRead = fs.readSync(fd, buffer, 0, bytesToRead);
            hash.update(buffer.slice(0, bytesRead));
            totalBytesRead += bytesRead;
        } while (bytesRead === BUFFER_SIZE && (headsize === null || totalBytesRead < headsize));
    } finally {
        fs.closeSync(fd);
    }

    return hash.digest('hex');
}

let list = folderHashSync(workingDir, scanmode)

console.log(list)

let CSVcontent = 'hash,size,path\n'

for (let i = 0; i < list.length; i++) {
    CSVcontent += list[i].hash + ',' + list[i].size + ',' + list[i].path + '\n'
}
fs.writeFileSync('folderHashing.csv', CSVcontent, 'utf8')