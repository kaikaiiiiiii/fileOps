const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { createReadStream } = require('fs');

async function cleanDup(paths, config) {
    const conf = config || {
        isDelete: true,
        minSize: 0,
        ignoreName: false,
        showFile: false,
    };

    const filesDict = {};
    let totalSize = 0;

    // 流式计算 MD5
    const computeMD5 = (filePath) => {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            const stream = createReadStream(filePath);

            stream.on('data', (chunk) => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    };

    // 递归遍历目录
    const walkThrough = async (dir) => {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            // 先处理所有文件和子目录
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
                            const currentMD5 = await computeMD5(fullPath);
                            const existingEntry = filesDict[fileKey];

                            // 补全已有文件的 MD5
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
                                filesDict[fileKey] = {
                                    path: fullPath,
                                    md5: currentMD5,
                                    isDuplicate: false
                                };
                            }
                        } else {
                            filesDict[fileKey] = {
                                path: fullPath,
                                md5: null  // 延迟计算
                            };
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

// 主程序
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