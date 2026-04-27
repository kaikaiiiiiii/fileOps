const fs = require('fs');
const path = require('path');

const directory = process.argv[2] || __dirname; // 指定目录路径
const del = process.argv[3] == 'del' ? true : false; // 是否删除已存在的文件

const ONE_GB = 1024 * 1024 * 1024; // 1GB 大小

let fileIndex = 1; // 文件编号从1开始
let totalSize = 0; // 总文件大小

let initTime = new Date().getTime(); // 记录开始时间
let startTime = initTime; // 记录每次生成文件的时间
let worstspeed = 0;

// 初次启动时检测目标目录的可用空间
let stat = fs.statfsSync(directory);
let availableSpace = stat.bavail * stat.bsize; // 获取可用空间（字节）

console.log(`初始可用空间: ${(availableSpace / 1024 / 1024 / 1024).toFixed(2)} GB (${availableSpace} bytes)\n`);

// 计算需要写入多少个 1GB 文件以及最后的余量
let fullGB = Math.floor(availableSpace / ONE_GB); // 完整的 1GB 个数
let remainder = availableSpace % ONE_GB; // 剩余的字节数

console.log(`计划写入: ${fullGB} 个 1GB 文件 + ${(remainder / 1024 / 1024).toFixed(2)} MB 的结尾文件\n`);

let fileSizes = [];
// 生成 1GB 的文件大小列表
for (let i = 0; i < fullGB; i++) {
    fileSizes.push(ONE_GB);
}
// 如果有剩余空间，添加最后的结尾文件
if (remainder > 0) {
    fileSizes.push(remainder);
}

// 循环写入所有计划的文件
let sizeIndex = 0;
while (sizeIndex < fileSizes.length) {
    const plannedSize = fileSizes[sizeIndex];
    try {
        const filePath = path.join(directory, `空间写入测试文件 ${fileIndex.toString().padStart(4, '0')}.del`); // 构造文件路径

        if (fs.existsSync(filePath)) {
            console.log(`${filePath} 已存在，跳过到下一个，将该大小 ${(plannedSize / 1024 / 1024 / 1024).toFixed(3)} GB 重新加入队列。`);
            fileIndex++;
            fileSizes.push(plannedSize); // 重新加入队列，确保总写入量不变
            sizeIndex++;
            continue;
        }

        const buffer = Buffer.alloc(plannedSize, Math.random().toString(16).slice(2)); // 生成随机数并转为 buffer
        fs.writeFileSync(filePath, buffer); // 写入文件

        fileIndex++; // 文件编号自增
        sizeIndex++; // 移向下一个计划的大小
        totalSize += plannedSize; // 计算总文件大小

        let currentTime = new Date().getTime(); // 记录当前时间
        let usedTime = Math.round(currentTime - startTime) / 1000; // 计算生成文件所用时间
        let hsize = (plannedSize / 1024 / 1024 / 1024).toFixed(3) + 'GB'
        let speed = (plannedSize / 1024 / 1024 * 1000 / (currentTime - startTime)).toFixed(3); // 计算生成速度

        startTime = currentTime; // 更新上次生成文件的时间
        let totalSpeed = Math.round(totalSize / (currentTime - initTime) * 1000 / 1024 / 1024 * 1000) / 1000; // 计算总速度
        if (worstspeed == 0 || speed < worstspeed) worstspeed = speed; // 记录最慢速度
        let progress = `${fileIndex - 1}/${fileSizes.length}`;
        let info = `[${progress}] ${filePath}: ${hsize} on ${usedTime}s, ${speed}. Lwst: ${worstspeed} , Oval: ${totalSpeed} MB/S`; // 输出生成的文件路径和速度

        console.log(info); // 打印信息
        fs.appendFileSync('log.txt', info + '\n'); // 将信息写入日志文件

    } catch (error) {
        console.error('写入错误:', error);
        // 删除失败的文件（如果存在）
        const filePath = path.join(directory, `空间写入测试文件 ${fileIndex.toString().padStart(4, '0')}.del`);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (e) { }
        }
    }
}

// 脚本完成
let endTime = new Date().getTime();
let totalTime = (endTime - initTime) / 1000;
let summary = `\n========== 写入完成 ==========\n总文件数: ${fileIndex - 1}\n总大小: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB\n总耗时: ${totalTime.toFixed(2)}s\n平均速度: ${(totalSize / 1024 / 1024 / totalTime).toFixed(3)} MB/s`;
console.log(summary);
fs.appendFileSync('log.txt', summary + '\n');

if (del) {
    console.log('清理测试文件中...');
    fs.readdirSync(directory).filter(item => item.endsWith('.del')).forEach(item => {
        fs.unlinkSync(path.join(directory, item));
    });
    console.log('清理完成。');
}