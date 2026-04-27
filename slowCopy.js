#!/usr/bin/env node
const os = require('os');
const homedir = os.homedir();
const fs = require('fs');
const path = require('path');

function shortenPath(p) {
    if (p.startsWith(homedir + path.sep)) {
        return '~' + p.slice(homedir.length);
    }
    return p;
}

const icons = `🦑🌷🌺🍁🦀🍎🐦🍜🦞🦐⚡🐙🦊🌭🍑🥭🐱🪐🥠🐹🐡🥟🌙✨🪝💫🌕🌟🐝🌾🐸🧩🌿🪴🌱🛸👽🍀🐊🌵🌳🍃🥦🦠🌍🐳💧🐋🌊🐬💠🐟⚓🪼🪻🐠🦄🫧🦭🦈🐨🍙👻🐼🦆🦪🍗🦉🐌🦔🐻💩🦦🪵🍖`
const pool = [...icons];
const barChars = [];
function shufflePool() {
    barChars.length = 0;
    // pushorder.length = 0;
    let selected = 0;
    for (let i = 0; i < pool.length; i++) {
        const need = 25 - selected;
        const remaining = pool.length - i;
        const prob = need / remaining;
        if (Math.random() < prob) {
            barChars.push(pool[i]);
            selected++;
        }
    }
}
shufflePool();

let pendingCloseFds = [];
function closeFdAsync(fd) {
    if (fd && typeof fd.close === 'function') {
        fd.close().catch(err => {
            if (err.code !== 'EBADF') console.error(`Close error: ${err.message}`);
        });
    }
}
function drainCloseQueue() {
    if (pendingCloseFds.length > 0) {
        const fd = pendingCloseFds.shift();
        closeFdAsync(fd);
    }
}
process.on('beforeExit', () => {
    while (pendingCloseFds.length) {
        const fd = pendingCloseFds.shift();
        closeFdAsync(fd);
    }
});

function parseArgs(argsArray = process.argv.slice(2)) {
    let args = argsArray.slice();
    function printHelp() {
        console.log('Usage: node slowCopy.js [from1 from2 ... to] <speed> <speedNumber> <moveflag>');
        console.log('Example: node slowCopy.js f:\\downloads e:\\downloads d:\\ -s 10 -m');
        console.log('## You can use -s or --speed to set speed, -m or --move to move files');
        process.exit(0);
    }

    if (args.findIndex((arg) => arg === '--help' || arg === '-h' || arg === '-help') > -1) {
        printHelp();
    }

    if (args.length < 2) {
        printHelp();
    }

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

async function smoothCopy(src, dest, speedBytesPerSec, srcSize, breakpoint) {
    let srcFd = null;
    let destFd = null;

    try {
        srcFd = await fs.promises.open(src, 'r');
        destFd = breakpoint === 0
            ? await fs.promises.open(dest, 'w')
            : await fs.promises.open(dest, 'r+');

        let copiedTotal = breakpoint;
        let lastTime = Date.now();
        let quota = 0;
        let lastPercent = -1;
        let lastSpeedbarShowTime = -1;
        const MAX_CHUNK = 1024 * 1024;
        const MAX_QUOTA = speedBytesPerSec * 2;
        const barLen = 50;
        const MAX_PENDING_FDS = 10;

        while (copiedTotal < srcSize) {
            const now = Date.now();
            quota += speedBytesPerSec * (now - lastTime) / 1000;
            if (quota > MAX_QUOTA) quota = MAX_QUOTA;

            const remaining = srcSize - copiedTotal;
            let toRead = Math.min(remaining, Math.floor(quota), MAX_CHUNK);

            if (toRead <= 0) {
                drainCloseQueue();
                await new Promise(r => setTimeout(r, 10));
                continue;
            }

            if (pendingCloseFds.length > MAX_PENDING_FDS) {
                drainCloseQueue();
            }

            const buffer = Buffer.alloc(toRead);
            const { bytesRead } = await srcFd.read(buffer, 0, toRead, copiedTotal);
            if (bytesRead === 0) break;

            await destFd.write(buffer, 0, bytesRead, copiedTotal);

            copiedTotal += bytesRead;
            quota -= bytesRead;
            lastTime = now;

            const percent = ((copiedTotal / srcSize) * 100).toFixed(2);
            const nowTime = Date.now();
            if (percent !== lastPercent && nowTime - lastSpeedbarShowTime > 100) {
                lastPercent = percent;
                lastSpeedbarShowTime = nowTime;

                const filled = Math.min(barLen, Math.floor((copiedTotal / srcSize) * barLen));
                const fullChars = Math.floor(filled / 2) + 1;
                const bar = barChars.slice(0, fullChars).join('') + ' '.repeat(Math.max(0, barLen - fullChars * 2));
                const sizeStr = `${(copiedTotal / 1024 / 1024).toFixed(1)}/${(srcSize / 1024 / 1024).toFixed(1)} MB`;
                process.stdout.write(`\r${percent < 10 ? '  ' : percent < 100 ? ' ' : ''}${percent}% [${bar}] ${sizeStr}`);
                // console.log(`\rtest: ${percent < 10 ? '  ' : percent < 100 ? ' ' : ''}${percent}% [${bar}] ${sizeStr} ${pushorder}`);
            }
        }

        const finalSizeStr = `${(srcSize / 1024 / 1024).toFixed(1)}/${(srcSize / 1024 / 1024).toFixed(1)} MB`;
        // 修改点：去掉末尾的换行符，等待速度信息拼接
        process.stdout.write(`\r100.00% [${barChars.slice(0, Math.ceil(barLen / 2)).join('')}] ${finalSizeStr}`);

        return copiedTotal;

    } finally {
        if (srcFd) pendingCloseFds.push(srcFd);
        if (destFd) pendingCloseFds.push(destFd);
        shufflePool();
    }
}

async function slowContinueCopy(src, dest, speed, mflag, rootDest) {
    const maxRetries = 5;
    let lastErr;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (!fs.existsSync(src)) {
            console.log(`Source file ${src} not exist, skip`);
            return 0;
        }

        const srcSize = fs.statSync(src).size;
        let destSize = -1;
        let breakpoint = 0;

        if (fs.existsSync(dest)) {
            try {
                destSize = fs.statSync(dest).size;
                if (destSize === srcSize) {
                    console.log(`🍌 ${dest}`);
                    return 0;
                }
                if (destSize < srcSize) {
                    breakpoint = destSize;
                } else {
                    breakpoint = 0;
                }
            } catch (e) {
                console.log(`Warning: cannot stat destination, starting from scratch: ${e.message}`);
                destSize = -1;
                breakpoint = 0;
            }
        }

        try {
            console.log(`${mflag ? '🐟' : '🍣'} ${shortenPath(src)} -> ${shortenPath(rootDest)}${path.sep}🍚🥢`);
            const copiedBytes = await smoothCopy(src, dest, speed, srcSize, breakpoint);
            return copiedBytes;
        } catch (err) {
            lastErr = err;
            console.error(`\nAttempt ${attempt}/${maxRetries} failed for ${src}: ${err.message}`);
            console.error(err.stack);
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    throw new Error(`Failed to copy ${src} after ${maxRetries} attempts: ${lastErr.message}`);
}

async function recursiveOps(src, dest, speed, mflag, rootDest) {
    const srcPath = path.resolve(src);
    if (!fs.existsSync(srcPath)) {
        console.log(`Source path ${src} not exist`);
        return;
    }

    const destPath = path.resolve(dest);
    const srcStat = fs.lstatSync(srcPath);

    if (srcStat.isDirectory()) {
        if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
        const entries = fs.readdirSync(srcPath, { withFileTypes: true });

        for (let entry of entries) {
            const srcEntryPath = path.join(srcPath, entry.name);
            const destEntryPath = path.join(destPath, entry.name);
            await recursiveOps(srcEntryPath, destEntryPath, speed, mflag, rootDest);
        }

        if (mflag) {
            fs.rmdirSync(srcPath);
        }
    } else if (srcStat.isSymbolicLink()) {
        const srcTarget = fs.readlinkSync(srcPath);
        fs.symlinkSync(srcTarget, destPath);
        if (mflag) fs.unlinkSync(srcPath);
    } else if (srcStat.isFile()) {
        const start = Date.now();
        let copiedBytes = 0;
        try {
            copiedBytes = await slowContinueCopy(srcPath, destPath, speed, mflag, rootDest);
        } catch (err) {
            console.error(`Skip file due to persistent error: ${err.message}`);
            return;
        }

        if (copiedBytes > 0) {
            const copiedMB = (copiedBytes / 1024 / 1024).toFixed(1);
            const timeUsed = Date.now() - start;
            const speedInfo = `for ${(timeUsed / 1000).toFixed(1)}s, in ${((copiedBytes / timeUsed) * 1000 / 1024 / 1024).toFixed(1)}MB/s, ${new Date().toLocaleTimeString()}`;
            // 修改点：将速度信息追加到上一行（进度条行）末尾，并换行
            process.stdout.write(` ${speedInfo}\n`);
        }

        if (mflag) {
            try {
                fs.unlinkSync(srcPath);
            } catch (error) {
                console.log(`ERR: ${error.message}`);
            }
        }
    }
}

async function main(multisrcs, dest, speedBytes, moveflag) {
    for (let from of multisrcs) {
        await recursiveOps(from, path.join(dest, path.basename(from)), speedBytes, moveflag, dest);
    }
}

const JOB_FILE = path.join(__dirname, '.scjob');

function runWithRawArgs(rawArgs) {
    const { froms, to, speed, moveflag } = parseArgs(rawArgs);
    return main(froms, to, speed, moveflag);
}

function printHelp() {
    console.log('Usage: node slowCopy.js [from1 from2 ... to] <speed> <speedNumber> <moveflag>');
    console.log('Example: node slowCopy.js f:\\downloads e:\\downloads d:\\ -s 10 -m');
    console.log('## You can use -s or --speed to set speed, -m or --move to move files');
    process.exit(0);
}

process.on('SIGINT', () => {
    console.log('\nReceived SIGINT. Job file preserved for later resume.');
    process.exit(1);
});

const rawArgs = process.argv.slice(2);

if (rawArgs.length === 0) {
    if (fs.existsSync(JOB_FILE)) {
        let savedArgs;
        try {
            savedArgs = JSON.parse(fs.readFileSync(JOB_FILE, 'utf8'));
        } catch (err) {
            console.error(`Failed to parse job file: ${err.message}`);
            process.exit(1);
        }
        console.log(`Resuming job with arguments: ${savedArgs.join(' ')}`);
        runWithRawArgs(savedArgs)
            .then(() => {
                if (fs.existsSync(JOB_FILE)) fs.unlinkSync(JOB_FILE);
                console.log('拷贝完成');
            })
            .catch((err) => {
                console.error(`Job failed, job file kept for retry: ${err.message}`);
                process.exit(1);
            });
    } else {
        printHelp();
    }
} else {
    if (rawArgs.includes('--help') || rawArgs.includes('-h') || rawArgs.includes('-help')) {
        printHelp();
    }
    parseArgs(rawArgs);
    fs.writeFileSync(JOB_FILE, JSON.stringify(rawArgs));
    runWithRawArgs(rawArgs)
        .then(() => {
            if (fs.existsSync(JOB_FILE)) fs.unlinkSync(JOB_FILE);
            console.log('拷贝完成');
        })
        .catch((err) => {
            console.error(`Task failed, job file saved for resume: ${err.message}`);
            process.exit(1);
        });
}