const fs = require('fs');
const path = require('path');

//////////////////////////////////////////////////

const workingDir = process.argv[2] || "D:\\Adobe"

function main() {

    if (!fs.existsSync(workingDir)) { console.log("Folder not found"); return; }
    if (!fs.existsSync(path.join(workingDir, "records.log"))) { console.log("records.log not found"); return; }
    if (!fs.existsSync(path.join(workingDir, "shared"))) { console.log("shared folder not found"); return; }

    let records = JSON.parse(fs.readFileSync(path.join(workingDir, "records.log"), 'utf8'));

    Object.entries(records).forEach(([key, value]) => {
        value.forEach(file => {
            let source = path.join(workingDir, 'shared', key)
            let distination = path.join(workingDir, file)
            fs.mkdirSync(path.dirname(distination), { recursive: true });
            fs.copyFileSync(source, distination);
        })
        fs.unlinkSync(path.join(workingDir, 'shared', key));
    })

    // if shared is empty then delete it else warning
    if (fs.readdirSync(path.join(workingDir, 'shared')).length === 0) {
        fs.rmdirSync(path.join(workingDir, 'shared'));
    } else {
        console.log("shared folder not empty");
    }
}

main()