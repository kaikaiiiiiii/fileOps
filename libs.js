const fs = require('fs');
const crypto = require('crypto');

const BUFFER_SIZE = 8192

function md5File(path) {
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

function md5FileAsync(path) {
    return new Promise((resolve, reject) => {
        const output = crypto.createHash('md5')
        const input = fs.createReadStream(path)

        input.on('error', (err) => {
            reject(err)
        })

        output.once('readable', () => {
            resolve(output.read().toString('hex'))
        })

        input.pipe(output)
    })
}

async function folderTraverse(dir, func = null) {
    let results = [];

    async function walkDir(currentPath) {
        const files = await fs.promises.readdir(currentPath);

        for (const file of files) {
            const filePath = path.join(currentPath, file);
            const stats = await fs.promises.stat(filePath);

            if (stats.isDirectory()) {
                await walkDir(filePath);
            } else {
                if (func) {
                    const result = await func(filePath);
                    results.push(result);
                } else {
                    results.push(filePath);
                }
            }
        }
    }

    await walkDir(dir);

    return results;
}

module.exports = {
    md5File: md5File,
    md5FileAsync: md5FileAsync,
    folderTraverse: folderTraverse
}
