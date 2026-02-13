#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// 解析命令行参数
function parseArgs() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('用法: node file-distributor.js <目录路径> [大小限制]');
        console.log('示例: node file-distributor.js /path/to/directory 30');
        process.exit(1);
    }

    const directory = args[0];
    const sizeLimit = args[1] ? parseInt(args[1], 10) : 30;

    if (isNaN(sizeLimit) || sizeLimit <= 0) {
        console.error('大小限制必须是正整数');
        process.exit(1);
    }

    return { directory, sizeLimit };
}

// 获取目录中的所有文件和文件夹
async function getFilesAndDirs(dirPath) {
    try {
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        return items;
    } catch (error) {
        console.error(`无法读取目录 ${dirPath}: ${error.message}`);
        process.exit(1);
    }
}

// 获取文件大小（字节）
async function getFileSize(filePath) {
    try {
        const stats = await fs.stat(filePath);
        return stats.size;
    } catch (error) {
        console.error(`无法获取文件大小 ${filePath}: ${error.message}`);
        return 0;
    }
}

// 将字节转换为GiB
function bytesToGiB(bytes) {
    return bytes / (1024 * 1024 * 1024);
}

// 主函数
async function main() {
    const { directory, sizeLimit } = parseArgs();
    const sizeLimitBytes = sizeLimit * 1024 * 1024 * 1024; // 转换为字节

    console.log(`处理目录: ${directory}`);
    console.log(`大小限制: ${sizeLimit} GiB`);

    // 获取所有文件和目录
    const items = await getFilesAndDirs(directory);

    // 找出所有两位数字的目录
    const numberDirs = items
        .filter(item => item.isDirectory())
        .map(dir => dir.name)
        .filter(name => /^\d{2}$/.test(name))
        .sort();

    console.log(`找到的数字目录: ${numberDirs.join(', ')}`);

    // 收集所有需要处理的文件
    let allFiles = [];

    // 首先添加主目录中的文件
    for (const item of items) {
        if (item.isFile()) {
            const filePath = path.join(directory, item.name);
            const size = await getFileSize(filePath);
            allFiles.push({
                name: item.name,
                path: filePath,
                size,
                originalDir: null
            });
        }
    }

    // 然后添加数字目录中的文件
    for (const dir of numberDirs) {
        const dirPath = path.join(directory, dir);
        const dirItems = await getFilesAndDirs(dirPath);

        for (const item of dirItems) {
            if (item.isFile()) {
                const filePath = path.join(dirPath, item.name);
                const size = await getFileSize(filePath);
                allFiles.push({
                    name: item.name,
                    path: filePath,
                    size,
                    originalDir: dir
                });
            }
        }
    }

    // 按文件名排序
    allFiles.sort((a, b) => a.name.localeCompare(b.name));

    console.log(`找到 ${allFiles.length} 个文件需要处理`);

    // 计算总大小
    const totalSize = allFiles.reduce((sum, file) => sum + file.size, 0);
    console.log(`总大小: ${bytesToGiB(totalSize).toFixed(2)} GiB`);

    // 计算需要多少个目录
    const estimatedDirs = Math.ceil(totalSize / sizeLimitBytes);
    console.log(`预计需要 ${estimatedDirs} 个目录`);

    // 生成目录列表（00-99）
    const targetDirs = [];
    for (let i = 0; i < 100; i++) {
        targetDirs.push(i.toString().padStart(2, '0'));
    }

    // 分配文件到目录
    const allocation = [];
    let currentDirIndex = 0;
    let currentDirSize = 0;

    for (const file of allFiles) {
        // 如果当前目录已满或超过100个目录，则分配到主目录
        if (currentDirIndex >= 100 ||
            (currentDirSize + file.size > sizeLimitBytes && currentDirIndex < 100)) {
            currentDirIndex++;
            currentDirSize = 0;
        }

        let targetDir = null;
        if (currentDirIndex < 100) {
            targetDir = targetDirs[currentDirIndex];
            currentDirSize += file.size;
        }

        allocation.push({
            file: file.name,
            from: file.originalDir || 'root',
            to: targetDir,
            size: file.size
        });
    }

    // 显示分配方案
    console.log('\n分配方案:');
    let currentAllocationDir = null;
    for (const item of allocation) {
        if (item.to !== currentAllocationDir) {
            currentAllocationDir = item.to;
            const dirSize = allocation
                .filter(a => a.to === currentAllocationDir)
                .reduce((sum, a) => sum + a.size, 0);
            console.log(`\n目录 ${currentAllocationDir || 'root'} (${bytesToGiB(dirSize).toFixed(2)} GiB):`);
        }
        console.log(`  ${item.file} (从 ${item.from})`);
    }

    // 确认是否执行移动操作
    console.log('\n是否执行移动操作? (y/N)');
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', async (data) => {
        if (data.toString().trim().toLowerCase() === 'y') {
            console.log('开始移动文件...');

            // 确保所有目标目录存在
            for (let i = 0; i < Math.min(100, currentDirIndex + 1); i++) {
                const dirPath = path.join(directory, targetDirs[i]);
                try {
                    await fs.access(dirPath);
                } catch {
                    await fs.mkdir(dirPath);
                    console.log(`创建目录: ${targetDirs[i]}`);
                }
            }

            // 移动文件
            for (const item of allocation) {
                const sourcePath = item.file.path || path.join(
                    directory,
                    item.from !== 'root' ? item.from : '',
                    item.file
                );

                let targetPath;
                if (item.to) {
                    targetPath = path.join(directory, item.to, item.file);
                } else {
                    targetPath = path.join(directory, item.file);
                }

                try {
                    // 如果源路径和目标路径不同，则移动文件
                    if (sourcePath !== targetPath) {
                        await fs.rename(sourcePath, targetPath);
                        console.log(`移动: ${item.file} -> ${item.to || 'root'}`);
                    }
                } catch (error) {
                    console.error(`移动文件失败 ${item.file}: ${error.message}`);
                }
            }

            console.log('文件移动完成!');
        } else {
            console.log('取消操作');
        }
        process.exit(0);
    });
}

// 执行主函数
main().catch(error => {
    console.error(`执行错误: ${error.message}`);
    process.exit(1);
});