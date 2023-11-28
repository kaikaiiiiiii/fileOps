const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const config = require('./config');

console.log(config);

function sendEmail() {
    const transporter = nodemailer.createTransport({
        host: "smtp.qq.com",
        port: 587,
        secure: false,
        auth: {
            user: config.EMAIL_ACCOUNT,
            pass: config.EMAIL_PASSWORD,
        },
    });

    const mailOptions = {
        from: config.EMAIL_ACCOUNT,
        to: config.EMAIL_RECIPIENT,
        subject: config.EMAIL_TITLE,
        text: config.EMAIL_CONTENT,
    };

    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            var time = new Date().toLocaleString();
            console.log(time + ': (Email sent) ' + info.response);
        }
    });
}

function traverseDirectory(dirPath, fileType, keepCount) {
    const files = [];
    const stats = {};

    // 递归遍历目录及其子目录
    function walk(currentDirPath) {
        const dirContent = fs.readdirSync(currentDirPath);
        dirContent.forEach(file => {
            const filePath = path.join(currentDirPath, file);
            const fileStat = fs.lstatSync(filePath);
            // 跳过符号链接目录
            if (fileStat.isSymbolicLink()) {
                return;
            }
            if (fileStat.isDirectory()) {
                walk(filePath);
            } else if (typeof fileType === 'undefined' || path.extname(filePath) === fileType) {
                files.push(filePath);
                stats[filePath] = fileStat.mtimeMs;
            }
        });
    }

    // 执行递归遍历
    walk(dirPath);

    // 按修改时间排序
    files.sort((a, b) => stats[a] - stats[b]);

    // 保留最新的 keepCount 个文件
    if (keepCount && keepCount < files.length) {
        const filesToDelete = files.slice(0, files.length - keepCount);
        filesToDelete.forEach(file => {
            fs.unlinkSync(file);
        });
    }

    // 返回最新的 fileType 文件的修改时间
    const latestFile = files[files.length - 1];
    const latestFileStat = fs.lstatSync(latestFile);
    return latestFileStat.mtimeMs;
}

let lastFileCreatedTime; // 最新文件修改时间的上次检查结果
let warningShown = true; // 是否已经发送过警告邮件

function check() {
    const thisFileCreatedTime = traverseDirectory(config.DIRECTORY_TO_WATCH, config.MONITOR_TYPE, config.KEEP_COUNT);
    const thisCheckingTime = new Date().getTime(); // 现在时间
    var diff = thisCheckingTime - thisFileCreatedTime;
    var h = ("0" + Math.floor(diff / 1000 / 60 / 60)).slice(-2);
    var m = ("0" + Math.floor(diff / 1000 / 60 % 60)).slice(-2);
    var s = ("0" + Math.floor(diff / 1000 % 60)).slice(-2);
    var ms = Math.floor(diff % 1000);
    // console.log(h + ":" + m + ":" + s + "." + ms);
    process.stdout.write(h + ":" + m + ":" + s + "." + ms + '\r'); // 上次文件更新距离现在的时间。

    if (typeof lastFileCreatedTime === 'undefined') {
        lastFileCreatedTime = thisFileCreatedTime;
    }

    if (thisFileCreatedTime === lastFileCreatedTime // 文件没有更新
        && thisCheckingTime - lastFileCreatedTime > config.ALERT_THRESHOLD // 超过警告阈值
        && !warningShown // 未发送过警告邮件
    ) {
        sendEmail();
        warningShown = true;
    }

    if (thisFileCreatedTime !== lastFileCreatedTime) { // 文件更新
        warningShown = false;
        lastFileCreatedTime = thisFileCreatedTime;
    }


}

check();

setInterval(check, config.INTERVAL_TIME);
