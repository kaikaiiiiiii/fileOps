const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { createReadStream } = require('fs');

async function cleanDup(paths, config) {
    const conf = Object.assign({
        isDelete: true,
        minSize: 0,
        ignoreName: true,
        showFile: true,
    }, config);

    const filesDict = {};

    let totalSize = 0;

    const computeMD5 = (filePath, readSize) => {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            let stream;
            if (readSize === undefined || readSize == false || readSize <= 0) {
                stream = createReadStream(filePath);
            } else {
                stream = createReadStream(filePath, { end: readSize - 1 })
            }
            stream.on('data', (chunk) => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    };

    // 递归遍历目录
    const walkThrough = async (dir) => {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    await walkThrough(fullPath);
                } else {
                    try {
                        const stats = await fs.stat(fullPath);

                        if (conf.minSize && stats.size < conf.minSize) continue;

                        const fileName = entry.name;
                        const fileSize = stats.size;
                        const fileKey = conf.ignoreName ? fileSize : `${fileName}_${fileSize}`;

                        if (conf.showFile) { `(${fileSize}) ${fullPath}` }

                        if (filesDict[fileKey]) {  // 此时已经 filekey dup

                            const existingEntrys = filesDict[fileKey];
                            // 计算当前文件的headmd5
                            const headReadSize = Math.min(1024 * 1024, fileSize);
                            const currentHeadMD5 = await computeMD5(fullPath, headReadSize);
                            const currentMD5 = null; // 延迟计算
                            const sameflag = false;

                            for (const entry of existingEntrys) {
                                if (entry.headmd5 === null) entry.headmd5 = await computeMD5(entry.path, headReadSize);
                                if (entry.headmd5 === currentHeadMD5) {
                                    if (entry.md5 === null) entry.md5 = await computeMD5(entry.path);
                                    if (currentMD5 === null) currentMD5 = await computeMD5(fullPath);
                                    if (entry.md5 === currentMD5) {
                                        sameflag = true;
                                        if (conf.isDelete) {
                                            await fs.unlink(fullPath);
                                            console.log(`DEL: ${fullPath} <-- ${entry.path})`);
                                            break;
                                        } else {
                                            entry.isDuplicate = true;
                                            console.log(`DUP: ${fullPath} <=> ${entry.path})`);
                                        }
                                        totalSize += fileSize;
                                    }
                                }
                            }

                            if (sameflag === false) {
                                filesDict[fileKey].push({
                                    path: fullPath,
                                    size: fileSize,
                                    headmd5: currentHeadMD5,
                                    md5: currentMD5,
                                    isDuplicate: false
                                });
                            }

                        } else {
                            filesDict[fileKey] = [{
                                path: fullPath,
                                size: fileSize,
                                headmd5: null,  // 延迟计算headmd5
                                md5: null,  // 延迟计算全文件MD5
                                isDuplicate: false
                            }]
                        }
                    } catch (err) {
                        console.error(`Error processing ${fullPath}:`, err.message);
                    }
                }
            }

            // 尝试删除空目录
            try {
                const remaining = await fs.readdir(dir);
                if (remaining.length === 0) {
                    await fs.rmdir(dir);
                    console.log(`Removed empty directory: ${dir}`);
                }
            } catch (err) {
                // 忽略删除目录错误
            }
        } catch (err) {
            console.error(`Error reading directory ${dir}:`, err.message);
        }
    };

    // 处理所有输入路径
    for (const p of paths) {
        try {
            const resolvedPath = path.resolve(p);
            const stats = await fs.stat(resolvedPath);
            if (stats.isDirectory()) {
                await walkThrough(resolvedPath);
            } else {
                console.warn(`Skipping non-directory path: ${resolvedPath}`);
            }
        } catch (err) {
            console.error(`Invalid path ${p}:`, err.message);
        }
    }

    if (!conf.isDelete) {
        console.log(`Total duplicate size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    }
    console.log(filesDict)
}

// 主程序保持不变
(async () => {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: node dedup.js <folder1> [folder2] ...');
        console.log('Example: node dedup.js /path/to/folder1 "C:\\My Files"');
        process.exit(1);
    }

    const config = {};
    if (process.argv.includes('--delete')) { config.isDelete = true; }
    if (process.argv.includes('--ignore-name')) { config.ignoreName = true; }
    if (process.argv.includes('--verbose')) { config.showFile = true; }

    try {
        await cleanDup(args, config);
        console.log('Cleanup completed');
    } catch (err) {
        console.error('Fatal error:', err);
        process.exit(1);
    }
})();