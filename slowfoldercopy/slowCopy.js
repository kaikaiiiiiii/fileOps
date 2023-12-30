const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');

//////////////////////////////////////////////////

function parseArgs(args) {
    let args = process.argv.slice(2);

    function printHelp() {
        console.log('Usage: node slowCopy.js [from1 from2 ... to] <speed> <speedNumber> <moveflag>');
        console.log('Example: node slowCopy.js f:\\downloads e:\\downloads d:\\ -s 10 -m');
        console.log('## You can use -s or --speed to set speed, -m or --move to move files');
        process.exit(0);
    }
    // check help
    if (args.findIndex((arg) => arg === '--help' || arg === '-h' || arg === '-help') > -1) {
        printHelp();
    }

    if (args.length < 2) {
        printHelp();
    }

    // check args
    let moveindex = args.findIndex((arg) => arg === '--move' || arg === '-m' || arg === '-move');
    let moveflag = moveindex > -1 ? true : false;
    if (moveflag) args.splice(moveindex, 1);

    let speedindex = args.findIndex((arg) => arg === '--speed' || arg === '-s' || arg === '-speed');
    let speed = 10 * 1024 * 1024;
    if (speedindex > -1) {
        let speedNumber = parseInt(args[speedindex + 1]) * 1024 * 1024;
        if (speedNumber > 0) {
            speed = speedNumber;
            args.splice(speedindex, 2);
        } else {
            console.log(`Can't read speed number after '-s' flag, use default speed ${speed / 1024 / 1024}MB/s`);
            args.splice(speedindex, 1);
        }
    }

    return { froms: args.slice(0, -1), to: args.slice(-1)[0], speed, moveflag };
}

let { froms, to, speed, moveflag } = parseArgs();

//////////////////////////////////////////////////

async function main(multisrcs, dest, speedinbytes, mflag) {
    for (let from of multisrcs) {
        await recursiveOps(from, path.join(dest, path.basename(from)), speedinbytes, mflag)
    }
}

main(froms, to, speed, moveflag)
    .then(() => console.log('拷贝完成'))
    .catch((err) => console.error(err));

//////////////////////////////////////////////////


async function recursiveOps(src, dest, speed, mflag) {

    // speed in bytes per second
    const srcPath = path.resolve(src);
    if (!fs.existsSync(srcPath)) {
        console.log(`Source path ${src} not exist`);
        return;
    }

    const destPath = path.resolve(dest);
    const srcStat = fs.lstatSync(srcPath);

    if (srcStat.isDirectory()) {

        if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true })
        const entries = fs.readdirSync(srcPath, { withFileTypes: true });

        for (let entry of entries) {
            const srcEntryPath = path.join(srcPath, entry.name);
            const destEntryPath = path.join(destPath, entry.name);
            await recursiveOps(srcEntryPath, destEntryPath, speed);
        }

        if (mflag) { fs.rmdirSync(srcPath) }

    } else if (srcStat.isSymbolicLink()) {

        // symlink not tested
        const srcTarget = fs.readlinkSync(srcPath);
        fs.symlinkSync(srcTarget, destPath);
        if (mflag) fs.unlinkSync(srcPath)

    } else if (srcStat.isFile()) {

        let start = Date.now();
        let copiedBytes = await slowContinueCopy(srcPath, destPath, speed);

        if (copiedBytes > 0) {
            let copiedMB = (copiedBytes / 1024 / 1024).toFixed(2);
            let timeUsed = Date.now() - start;
            console.log(`\n${copiedMB}MB for ${(timeUsed / 1000).toFixed(2)}s, in ${((copiedBytes / timeUsed) * 1000 / 1024 / 1024).toFixed(2)}MB/s`)
        }

        if (mflag) fs.unlinkSync(srcPath)
    }
}


async function slowContinueCopy(src, dest, speed) {

    // exist and same size
    if (fs.existsSync(dest) && fs.statSync(src).size === fs.statSync(dest).size) {
        console.log(`--: ${dest}`);
        return 0;
    }

    if (!fs.existsSync(src)) {
        console.log(`Source file ${src} not exist, skip`);
        return 0;
    }

    const startTime = Date.now();
    const chunkSize = 1024 * 1024; // 1MB
    let bytesCopied = 0, breakpoint = 0;;
    let fileSize = fs.statSync(src).size;


    let readStream, writeStream;
    if (fs.existsSync(dest)) {
        console.log(`++: ${dest}`)
        breakpoint = fs.statSync(dest).size;
        readStream = fs.createReadStream(src, { highWaterMark: chunkSize, start: breakpoint });
        writeStream = fs.createWriteStream(dest, { flags: 'a' });
    } else {
        console.log(`>>: ${dest}`)
        readStream = fs.createReadStream(src, { highWaterMark: chunkSize });
        writeStream = fs.createWriteStream(dest);
    }

    const progress = new Transform({
        transform(chunk, encoding, callback) {
            bytesCopied += chunk.length;
            let percent = (((bytesCopied + breakpoint) / fileSize) * 100).toFixed(2);
            let hashes = '#'.repeat(Math.floor(percent / 2) + 1);
            let spaces = ' '.repeat(50 - hashes.length + 2);
            let sizeHR = `${((bytesCopied + breakpoint) / 1024 / 1024).toFixed(2)}MB/${(fileSize / 1024 / 1024).toFixed(2)}MB`;
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
        writeStream.on('finish', () => resolve(bytesCopied));
        writeStream.on('error', (err) => reject(err));
    });

}
