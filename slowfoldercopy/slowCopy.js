const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');

//////////////////////////////////////////////////

const from = process.argv[2] || 'f:\\downloads';
const to = process.argv[3] || 'd:\\downloads';
const spd = process.argv[4] * 1024 * 1024 || 10 * 1024 * 1024;

recCopy(from, to, spd)
    .then(() => console.log('拷贝完成'))
    .catch((err) => console.error(err));


//////////////////////////////////////////////////


async function recCopy(src, dest, speed) {

    // speed in bytes per second
    const srcPath = path.resolve(src);
    const destPath = path.resolve(dest);
    const srcStat = fs.lstatSync(srcPath);

    if (srcStat.isDirectory()) {

        if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true })
        const entries = fs.readdirSync(srcPath, { withFileTypes: true });

        for (let entry of entries) {
            const srcEntryPath = path.join(srcPath, entry.name);
            const destEntryPath = path.join(destPath, entry.name);
            await recCopy(srcEntryPath, destEntryPath, speed);
        }

        if (process.argv[5] === 'move') {
            if (path.basename(srcPath) != "Anime") fs.rmdirSync(srcPath);
        }

    } else if (srcStat.isSymbolicLink()) {

        // symlink not tested
        const srcTarget = fs.readlinkSync(srcPath);
        fs.symlinkSync(srcTarget, destPath);
        if (process.argv[5] === 'move') fs.unlinkSync(srcPath)

    } else if (srcStat.isFile()) {

        await slowContinueCopy(srcPath, destPath, speed);
        if (process.argv[5] === 'move') fs.unlinkSync(srcPath)
    }
}


async function slowContinueCopy(src, dest, speed) {

    // exist and same size
    if (fs.existsSync(dest) && fs.statSync(src).size === fs.statSync(dest).size) {
        console.log(`目标文件已存在：${dest}`);
        return;
    }

    const startTime = Date.now();
    const chunkSize = 1024 * 1024; // 1MB
    let bytesCopied = 0;
    let fileSize = fs.statSync(src).size;

    let readStream, writeStream;
    if (fs.existsSync(dest)) {
        console.log(`续传：${dest}`)
        let breakpoint = fs.statSync(dest).size;
        readStream = fs.createReadStream(src, { highWaterMark: chunkSize, start: breakpoint });
        writeStream = fs.createWriteStream(dest, { flags: 'a' });
    } else {
        console.log(`开始拷贝：${dest}`)
        readStream = fs.createReadStream(src, { highWaterMark: chunkSize });
        writeStream = fs.createWriteStream(dest);
    }

    const progress = new Transform({
        transform(chunk, encoding, callback) {
            bytesCopied += chunk.length;
            let percent = ((bytesCopied / fileSize) * 100).toFixed(2);
            let hashes = '#'.repeat(Math.floor(percent / 2) + 1);
            let spaces = ' '.repeat(50 - hashes.length + 2);
            let sizeHR = `${(bytesCopied / 1024 / 1024).toFixed(2)}MB/${(fileSize / 1024 / 1024).toFixed(2)}MB`;
            let progress = `${percent}% ${hashes}${spaces}${sizeHR}\r`;
            process.stdout.write(progress);

            let timeUsed = Date.now() - startTime;
            let timeShould = bytesCopied / speed * 1000;
            let thisInterval = timeShould - timeUsed > 0 ? timeShould - timeUsed : 0;

            setTimeout(() => {
                callback(null, chunk);
            }, thisInterval);
        },
    });

    readStream.pipe(progress).pipe(writeStream);

    return new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
    });

}
