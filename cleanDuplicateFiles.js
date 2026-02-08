const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { createReadStream } = require('fs');

async function cleanDup(paths, config) {
    const conf = config || {
        isDelete: true,
        minSize: 1,
        ignoreName: false,
        showFile: false,
    };

    const filesDict = {};
    let totalSize = 0;

    // 计算全文件MD5
    const computeMD5 = (filePath) => {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            const stream = createReadStream(filePath);

            stream.on('data', (chunk) => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    };

    // 新增：计算前1MB的MD5
    const computeHeadMD5 = (filePath, fileSize) => {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            // 设置读取前1MB（1048576字节）
            const bytesToRead = Math.min(fileSize, 1024 * 1024);
            const stream = createReadStream(filePath, { end: bytesToRead - 1 });

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

                        if (conf.showFile) {
                            console.log(conf.ignoreName
                                ? `(${fileSize}) ${fullPath}`
                                : fileKey);
                        }

                        if (filesDict[fileKey]) {
                            const existingEntry = filesDict[fileKey];

                            // 新增：先计算当前文件的前1MB MD5
                            const currentHeadMD5 = await computeHeadMD5(fullPath, fileSize);

                            // 补全已有文件的headmd5（如果还没计算）
                            if (!existingEntry.headmd5) {
                                // 文件大小小于1MB时，headmd5和md5相同
                                if (existingEntry.size <= 1024 * 1024) {
                                    if (!existingEntry.md5) {
                                        existingEntry.md5 = await computeMD5(existingEntry.path);
                                    }
                                    existingEntry.headmd5 = existingEntry.md5;
                                } else {
                                    existingEntry.headmd5 = await computeHeadMD5(existingEntry.path, existingEntry.size);
                                }
                            }

                            // 比较headmd5
                            if (currentHeadMD5 !== existingEntry.headmd5) {
                                // headmd5不同，不是重复文件，更新字典
                                filesDict[fileKey] = {
                                    path: fullPath,
                                    size: fileSize,
                                    headmd5: currentHeadMD5,
                                    md5: null,  // 延迟计算
                                    isDuplicate: false
                                };
                            } else {
                                // headmd5相同，需要进一步比较全文件MD5

                                // 计算当前文件的全文件MD5
                                const currentMD5 = await computeMD5(fullPath);

                                // 补全已有文件的MD5（如果还没计算）
                                if (!existingEntry.md5) {
                                    existingEntry.md5 = await computeMD5(existingEntry.path);
                                }

                                if (currentMD5 === existingEntry.md5) {
                                    if (conf.isDelete) {
                                        console.log(`DELETE: ${fullPath} (duplicate of ${existingEntry.path})`);
                                        await fs.unlink(fullPath);
                                    } else {
                                        console.log(`DUPLICATE: ${fullPath} = ${existingEntry.path} [${fileSize} bytes]`);
                                        totalSize += fileSize;
                                    }
                                } else {
                                    // 全文件MD5不同，不是重复文件
                                    // 对于小于1MB的文件，headmd5已经等于md5，所以不会走到这里
                                    filesDict[fileKey] = {
                                        path: fullPath,
                                        size: fileSize,
                                        headmd5: currentHeadMD5,
                                        md5: currentMD5,
                                        isDuplicate: false
                                    };
                                }
                            }
                        } else {
                            // 新增：首次遇到文件，存储headmd5和size
                            // 对于小于1MB的文件，直接计算全文件MD5作为headmd5
                            if (fileSize <= 1024 * 1024) {
                                const fullMD5 = await computeMD5(fullPath);
                                filesDict[fileKey] = {
                                    path: fullPath,
                                    size: fileSize,
                                    headmd5: fullMD5,
                                    md5: fullMD5,
                                    isDuplicate: false
                                };
                            } else {
                                // 大于1MB的文件，只计算headmd5
                                const headMD5 = await computeHeadMD5(fullPath, fileSize);
                                filesDict[fileKey] = {
                                    path: fullPath,
                                    size: fileSize,
                                    headmd5: headMD5,
                                    md5: null,  // 延迟计算全文件MD5
                                    isDuplicate: false
                                };
                            }
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
}

// 主程序保持不变
(async () => {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: node dedup.js <folder1> [folder2] ...');
        console.log('Example: node dedup.js /path/to/folder1 "C:\\My Files"');
        process.exit(1);
    }

    const config = {
        isDelete: process.argv.includes('--delete'),
        minSize: 0,  // 最小文件大小（字节）
        ignoreName: process.argv.includes('--ignore-name'),
        showFile: process.argv.includes('--verbose')
    };

    try {
        await cleanDup(args, config);
        console.log('Cleanup completed');
    } catch (err) {
        console.error('Fatal error:', err);
        process.exit(1);
    }
})();