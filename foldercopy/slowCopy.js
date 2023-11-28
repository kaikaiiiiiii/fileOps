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


async function slowCopy(src, dest, speed) {
    // exist and same size
    if (fs.existsSync(dest) && fs.statSync(src).size === fs.statSync(dest).size) {
        console.log(`目标文件已存在：${dest}`);
        return;
    }
    const filePath = path.resolve(src);
    const destPath = path.resolve(dest);
    console.log(`>> ${destPath}`)
    const fileSize = fs.statSync(filePath).size;
    const chunkSize = 1024 * 1024; // 1MB
    const updateInterval = Math.max(chunkSize / speed * 1000 - 100, 0);

    let bytesCopied = 0;

    const progressTransform = new Transform({
        transform(chunk, encoding, callback) {
            bytesCopied += chunk.length;
            const percent = ((bytesCopied / fileSize) * 100).toFixed(2);
            const hashes = '#'.repeat(Math.floor(percent / 2) + 1);
            const spaces = ' '.repeat(50 - hashes.length + 2);
            const sizeHR = `${(bytesCopied / 1024 / 1024).toFixed(2)}MB/${(fileSize / 1024 / 1024).toFixed(2)}MB`;
            const progress = `${percent}% ${hashes}${spaces}${sizeHR}\r`;
            process.stdout.write(progress);
            setTimeout(() => {
                callback(null, chunk);
            }, updateInterval);
        },
    });

    const readStream = fs.createReadStream(filePath, { highWaterMark: chunkSize });
    const writeStream = fs.createWriteStream(destPath);

    readStream.pipe(progressTransform).pipe(writeStream);

    return new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
    });
}

async function recCopy(src, dest, speed) {
    const srcPath = path.resolve(src);
    const destPath = path.resolve(dest);
    const srcStat = fs.lstatSync(srcPath);

    if (srcStat.isDirectory()) {
        if (!fs.existsSync(destPath)) {
            fs.mkdirSync(destPath, { recursive: true });
        }
        const entries = fs.readdirSync(srcPath, { withFileTypes: true });

        for (let entry of entries) {
            const srcEntryPath = path.join(srcPath, entry.name);
            const destEntryPath = path.join(destPath, entry.name);
            await recCopy(srcEntryPath, destEntryPath, speed);
        }

        // after the recrusion, there should be no file no subfolder
        if (process.argv[5] === 'move') {
            //if forder name != "Anime"
            if (path.basename(srcPath) != "Anime") fs.rmdirSync(srcPath);
        }
    } else if (srcStat.isSymbolicLink()) {
        const srcTarget = fs.readlinkSync(srcPath);
        fs.symlinkSync(srcTarget, destPath);

        if (process.argv[5] === 'move') {
            fs.unlinkSync(srcPath);
        }
    } else if (srcStat.isFile()) {
        await slowCopy(srcPath, destPath, speed);
        if (process.argv[5] === 'move') {
            fs.unlinkSync(srcPath);
        }
    }
}






