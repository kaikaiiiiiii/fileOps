const fs = require('fs');
const path = require('path');
const yauzl = require('yauzl');
const yazl = require('yazl');

async function repackZip(zipPath, depth = 1) {
    const baseDir = path.dirname(zipPath);
    const groupMapPath = path.join(baseDir, '__group_map.txt');
    const ABSOLUTE_PATH_LIMIT = 255; // 限制完整路径（字节数，非字符数）

    let currentGroup = null;
    let currentArchive = null;
    let outputStream = null;
    const pendingArchives = [];
    let skipCurrentGroup = false;

    console.log(`Starting repacking of: ${path.basename(zipPath)}`);
    console.log(`Using grouping depth: ${depth}`);
    console.log('-------------------------------------------');

    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
            if (err) return reject(err);

            zipfile.on('entry', (entry) => {
                if (/\/$/.test(entry.fileName)) {
                    zipfile.readEntry();
                    return;
                }

                const parts = entry.fileName.split('/').filter(Boolean);
                let groupName = '';

                if (parts.length < depth) {
                    groupName = parts.slice(0, -1).join('_');
                    console.warn(`⚠️  Warning: File "${entry.fileName}" has insufficient depth. Using available parts for grouping.`);
                } else {
                    groupName = parts.slice(0, depth).join('_');
                }

                const internalPath = parts.slice(depth).join('/');
                if (!groupName) {
                    groupName = 'ungrouped';
                    console.warn(`⚠️  Warning: File "${entry.fileName}" has no valid grouping. Using "ungrouped".`);
                }

                const isNewGroup = groupName !== currentGroup;

                if (isNewGroup) {
                    skipCurrentGroup = false;

                    if (currentArchive) {
                        const finalGroupName = currentGroup;
                        currentArchive.end();
                        pendingArchives.push(new Promise(res => {
                            outputStream.on('finish', () => {
                                console.log(`✅ Finished packing: ${finalGroupName}.zip`);
                                console.log('-------------------------------------------');
                                res();
                            });
                        }));
                    }

                    let safeGroupName = groupName;
                    let fileName = `${safeGroupName}.zip`;
                    let outputPath = path.join(baseDir, fileName);

                    // 字节级截断
                    let outputPathBytes = Buffer.byteLength(outputPath, 'utf8');
                    if (outputPathBytes > ABSOLUTE_PATH_LIMIT) {
                        const baseBytes = Buffer.byteLength(path.join(baseDir, '/'), 'utf8');
                        const maxNameBytes = ABSOLUTE_PATH_LIMIT - baseBytes - 4; // 4 for ".zip"

                        let truncated = '';
                        for (let i = 0; i < safeGroupName.length; i++) {
                            const tmp = truncated + safeGroupName[i];
                            if (Buffer.byteLength(tmp, 'utf8') <= maxNameBytes) {
                                truncated = tmp;
                            } else {
                                break;
                            }
                        }

                        safeGroupName = truncated;
                        fileName = `${safeGroupName}.zip`;
                        outputPath = path.join(baseDir, fileName);
                        outputPathBytes = Buffer.byteLength(outputPath, 'utf8');

                        console.warn(`⚠️ Truncated group name to: ${safeGroupName}`);
                        fs.appendFileSync(groupMapPath, `${groupName} => ${safeGroupName}\n`);
                    }

                    // 检查文件是否存在
                    let exists = false;
                    try {
                        exists = fs.existsSync(outputPath);
                    } catch (e) {
                        if (e.code === 'ENAMETOOLONG') {
                            console.warn(`⛔ Path too long (existsSync): ${outputPath}`);
                            skipCurrentGroup = true;
                            currentGroup = groupName;
                            zipfile.readEntry();
                            return;
                        } else {
                            return reject(e);
                        }
                    }

                    if (exists) {
                        console.log(`⏩ Skipping existing group: ${safeGroupName}.zip`);
                        skipCurrentGroup = true;
                        currentGroup = groupName;
                        zipfile.readEntry();
                        return;
                    }

                    // 创建输出流
                    try {
                        outputStream = fs.createWriteStream(outputPath);
                    } catch (e) {
                        if (e.code === 'ENAMETOOLONG') {
                            console.warn(`⛔ Cannot create write stream, path too long: ${outputPath}`);
                            skipCurrentGroup = true;
                            currentGroup = groupName;
                            zipfile.readEntry();
                            return;
                        } else {
                            return reject(e);
                        }
                    }

                    outputStream.on('error', (err) => {
                        console.warn(`⛔ WriteStream error for ${outputPath}: ${err.message}`);
                        skipCurrentGroup = true;
                        zipfile.readEntry();
                    });

                    currentGroup = groupName;
                    currentArchive = new yazl.ZipFile();
                    currentArchive.outputStream.pipe(outputStream);

                    console.log(`🚀 Start packing: ${safeGroupName}.zip`);
                }

                if (skipCurrentGroup) {
                    zipfile.readEntry();
                    return;
                }

                zipfile.openReadStream(entry, (err, readStream) => {
                    if (err) return reject(err);

                    const archivePath = internalPath || parts[parts.length - 1];
                    currentArchive.addReadStream(readStream, archivePath);

                    readStream.on('end', () => {
                        zipfile.readEntry();
                    });
                });
            });

            zipfile.on('end', () => {
                if (currentArchive && !skipCurrentGroup) {
                    const finalGroupName = currentGroup;
                    currentArchive.end();
                    pendingArchives.push(new Promise(res => {
                        outputStream.on('finish', () => {
                            console.log(`✅ Finished packing: ${finalGroupName}.zip`);
                            console.log('-------------------------------------------');
                            res();
                        });
                    }));
                }

                Promise.all(pendingArchives).then(() => {
                    console.log(`🎉 All groups packed successfully! Total groups: ${pendingArchives.length}`);
                    resolve();
                });
            });

            zipfile.on('error', reject);
            zipfile.readEntry();
        });
    });
}

function parseArgs() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Usage: node repackZip.js <path-to-zip> [depth]');
        process.exit(1);
    }

    const zipPath = args[0];
    let depth = 1;

    if (args.length >= 2) {
        const depthArg = parseInt(args[1], 10);
        if (!isNaN(depthArg) && depthArg > 0) {
            depth = depthArg;
        } else {
            console.warn(`⚠️  Invalid depth value: ${args[1]}. Using default depth=1.`);
        }
    }

    return { zipPath, depth };
}

const { zipPath, depth } = parseArgs();

console.time('Repacking time');
repackZip(zipPath, depth)
    .then(() => {
        console.timeEnd('Repacking time');
    })
    .catch(err => {
        console.error('❌ Repacking failed:', err);
        process.exit(1);
    });
