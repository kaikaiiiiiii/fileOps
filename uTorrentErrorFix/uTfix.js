const fs = require('fs');
const path = require('path');


const target = process.argv[2] || '.';

function renameFilesSync(directory) {
    const files = fs.readdirSync(directory, { withFileTypes: true });
    for (let file of files) {
        const filePath = path.join(directory, file.name);
        if (file.isDirectory()) {
            renameFilesSync(filePath);
        } else if (file.name.endsWith('.!ut')) {
            const newFilePath = path.join(directory, file.name.replace(/\.!ut$/, ''));
            try {
                fs.unlinkSync(newFilePath);
            } catch (err) {
                // do nothing if the file does not exist
            }
            console.log(filePath)
            fs.renameSync(filePath, newFilePath);
        }
    }
}

renameFilesSync(target);
