const md5File = require('md5-file')
const fs = require('fs')
const path = require('path')


// const folders = ['Z:\\D\\2023\\Two Steps From Hell - FLAC - Discography', 'Z:\\D\\Two Steps From Hell - FLAC - Discography']
const folders = ["F:\\Life.Step\\Mininglamp", "F:\\SandCard"]


function cleanDup(pathArr, config) {
    const conf = config || {
        isDelete: true,
        minSize: 0,
        ignoreName: false,
        showFile: false,
    }

    let filesDict = {};
    let totalSize = 0;


    function walkThrough(dir, filesDict) {
        try {
            const files = fs.readdirSync(dir);
            files.forEach((file) => {

                const filePath = path.join(dir, file);
                const stats = fs.statSync(filePath);

                if (stats.isDirectory()) {

                    walkThrough(filePath, filesDict);

                } else {

                    if (conf.minSize && stats.size < conf.minSize) { return }; //  如果文件小于指定大小则跳过

                    const fileName = file;
                    const fileSize = stats.size;
                    const fileKey = conf.ignoreName ? fileSize : fileName + fileSize; // 根据 flag 判断是否忽略文件名的比较
                    if (conf.showFile) {
                        if (conf.ignoreName) {
                            console.log(`(${fileSize}) ${filePath}`);
                        } else {
                            console.log(fileKey);
                        }
                    }

                    if (filesDict[fileKey]) {

                        const fileMd5 = md5File.sync(filePath);
                        if (filesDict[fileKey].md5[0] == false) {
                            // 如果之前的文件没有计算过 md5，此时补记。该操作是为了在非重复文件时不计算 md5，以提高效率。
                            filesDict[fileKey].md5[0] = md5File.sync(filesDict[fileKey].path[0])
                        }

                        let sameMd5Index = filesDict[fileKey].md5.indexOf(fileMd5);
                        if (sameMd5Index === -1) {
                            // 如果相同尺寸不同 md5 则两个都留下且都记录在 filesDict 中
                            filesDict[fileKey].path.push(filePath);
                            filesDict[fileKey].md5.push(fileMd5);
                        } else {
                            let sameFile = filesDict[fileKey].path[sameMd5Index];
                            if (conf.isDelete) {
                                console.log('delete :: ' + filePath + ' -> ' + sameFile);
                                fs.appendFileSync('delete.txt', 'same file: ' + filePath + ' && ' + sameFile + ' >> ' + fileMd5 + '\n');
                                fs.unlinkSync(filePath);
                            } else {
                                console.log(`same(${fileSize}):: ${filePath} >> ${sameFile} >> ${fileMd5}`);
                                totalSize += fileSize;
                            }
                        }

                    } else {
                        filesDict[fileKey] = {};
                        filesDict[fileKey].path = [filePath];
                        filesDict[fileKey].md5 = [false]; // 此时暂不计算 md5，以提高效率。
                    }

                    if (fs.readdirSync(dir).length == 0) {
                        fs.rmdirSync(dir);
                    }
                }
            });
        } catch (error) {
            console.log(error);
            return;
        }

    }

    pathArr.forEach((path) => {
        if (fs.existsSync(path)) {
            walkThrough(path, filesDict);
        }
    });

    if (conf.isDelete == false) console.log('total size: ' + totalSize / 1024 / 1024 + ' MB')
}

cleanDup(folders);


