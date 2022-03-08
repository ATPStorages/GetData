const 
    path      = require("path"),
    fs        = require("fs/promises"),
    axios     = require("axios").default,
    { https } = require("follow-redirects"),
    inquirer  = require("inquirer"),
    compare   = require("compare-versions"),
    { spawn } = require("child_process"),
    { version, bugs } = require("./package.json"),
    { isEqual } = require("lodash"),
    { yellow, green, blueBright, white, red, redBright } = require("chalk"),

    userData = path.join(
        process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share"), 
        "AdenosineTriphosphate", 
        "GetData"
    ),

    dataSkeleton = {
        "tumblr client key" : "",

    };
/// /// /// /// /// /// /// /// /// /// /// /// ///
printLine(yellow("Checking for updates"));
axios.get("https://api.github.com/repos/ATPStorages/GetData/releases/latest").then(res => {
    if(res.status === 200) {
        switch(compare(res.data.name, version)) {
            case 1:
                printLine(green("An update is available.\n"));
                console.log(blueBright(`-> Current version: ${white(version)}\n-> Latest version : ${white(res.data.name)} (${white(res.data.id)})`));
                break;
            case 0:
            case -1:
                printLine(green("You are up-to-date.\n"));
                return main();
        }

        inquirer.prompt([ { type: "confirm", default: true, name: "update", message: "Would you like to install this update?" } ]).then(async ans => {
            console.log();
            if(ans.update === true) { 
                for(const asset of res.data.assets) {
                    if(asset.name.startsWith("getdata-"+resolveOs(process.platform))) {
                        return update(asset.browser_download_url, asset.size, path.join(__dirname, "new_" + path.basename(asset.browser_download_url)));
                    }
                }

                console.error(red(`Your platform's (${process.platform}) package wasn't found. Please raise an issue at ${white(bugs.url)}.`));
            }

            main();
        }).catch(inquirerError);
    } else { throw new RangeError(`GitHub returned a non-OK status code of ${res.status} - ${res.statusText}\n-> ${res.data}`) }
}).catch(err => { console.error(redBright(`\nAn error has occurred while trying to check for an update.\n-> ${err}`)) });
/// /// /// /// /// /// /// /// /// /// /// /// ///
const befData = {};
async function main(saveData) {
    printLine(yellow("Checking for configuration data"));
    const confpath = path.join(userData, "config");
    let data, awaitcall = true, modified = false;

    if(saveData) {
        const parsed = JSON.parse(saveData);
        fs.readFile(confpath).then(buffer => {
            if(!isEqual(JSON.parse(buffer), parsed)) {
                fs.writeFile(confpath, saveData).then(() => { data = parsed; modified = true; }).catch(err => {
                    printLineErr(red(`Failed to write passed configuration data.\n=> Data: ${saveData}\n=> ${err}\n`));
                    process.exit(1);
                });
            }
        });
    } else {
        await fs.open(confpath, "r+").then(async handle => {
            await handle.readFile().then(ret => { data = JSON.parse(ret.toString()); });
            handle.close();
        }).catch(async err => {
            if(err.message.startsWith("ENOENT")) { printLineErr(redBright(`There is no configuration file.\n`)); } 
            else { printLineErr(red(`An error has occurred trying to open the configuration file.\n-> ${err}\n`)); }

            await inquirer.prompt([ { type: "confirm", default: true, name: "create", message: "Would you like to create a new one?" } ]).then(async ans => {
                if(ans.create === true) { 
                    await fs.mkdir(userData, { recursive: true }).then(async () => {
                        await fs.open(confpath, "w+").then(async handle => { 
                            await handle.write(JSON.stringify(dataSkeleton)).then(ret => data = JSON.parse(ret.buffer)).catch(err => {
                                console.error(red(`Failed to write skeleton data to configuration file.\n=> ${err}`)); 
                                process.exit(1); 
                            });

                            handle.close();
                        }).catch(err => { 
                            console.error(red(`Failed to create a new configuration file.\n=> ${err}`)); 
                            process.exit(1); 
                        });
                    }).catch(err => {
                        console.error(red(`Failed to create data directory.\n=> ${err}`));
                        process.exit(1);
                    }).finally(() => { awaitcall = false; });
                }
            }).catch(inquirerError);
        });
    }

    Object.assign(befData, data);

    if(awaitcall) {
        printLine(green(modified ? "Configuration saved" : "Configuration loaded") + "\n");
        inquirer.prompt([ { type: "list", name: "command", message: "What would you like to do?", choices: [ "Modify configuration", "Download files" ] } ]).then(ans => {
            switch(ans.command) {
                case "Modify configuration":
                    configEditor(data);
                    break;
                case "Download files":
                    break;
            }
        }).catch(inquirerError);
    } else {
        configEditor(data);
    }
}  

function update(link, size, fpath) {
    fs.open(fpath, "w+").then(handle => {
        const stream = handle.createWriteStream();
        console.log(blueBright(`Downloading - ${white(link)}`));
        printLine(blueBright(`${white(0)}% - ${white(0)} bytes downloaded / ${white(0)} bytes written / ${white(size)} bytes total`));
        https.get(link, async res => {
            let downloadedBytes = 0;
            res.on("data", (chunk) => {
                downloadedBytes += chunk.length;
                printLine(blueBright(`${white(Math.floor((downloadedBytes/size*100)))}% - ${white(downloadedBytes)} bytes downloaded / ${white(stream.bytesWritten)} bytes written / ${white(size)} bytes total`));
            });
            
            res.pipe(stream, {end: false}).on("unpipe", () => {
                stream.close(async err => {
                    handle.close();
                    printLine(green("All done! - Starting updated version\n"));
                    spawn(handle, { detached: true, shell: true, stdio: "ignore" }, (err) => {
                        if(err) {
                            console.error(red(`Failed to start...\n-> ${err}`));
                            process.exit(1);
                        } else {
                            process.exit(0);
                        }
                    }).unref();
                });
            });
        });
    }).catch(err => {
        console.error(red(`Failed to open a handle for the new version.\n-> ${err}`));
        main();
    });
}

function configEditor(data, sel, message) {
    console.clear();
    if(message) console.log(message);
    console.log(blueBright`GetData configuration editor`);
    if(sel) {
        const titleCase = toTitleCase(sel);
        console.log(blueBright`Selected item: {white {italic ${titleCase}}}`);
        inquirer.prompt([ { type: "input", name: "value", message: "What would you like to set this to?" } ]).then(ans => {
            const old = data[sel];
            if(old === ans.value) {
                configEditor(data, undefined, yellow`Didn't change {white ${titleCase}}; original and changed values were the same.`);
            } else {
                data[sel] = ans.value;
                configEditor(data, undefined, green`Changed {white ${titleCase}}: ("{white ${truncate(old, 25)}}" -> "{white ${truncate(ans.value, 25)}}")`);
            }
        }).catch(inquirerError);
    } else {
        for(const [key, value] of Object.entries(data)) console.log(yellow`${toTitleCase(key)}{white : ${truncate(value, 50)}}`);
        console.log(blueBright`\nType {white a key's name} (not case-sensitive) to select and modify it.\nType {white done} to save changes and exit.\nType {white reset} to undo changes.\nType {white freset} to reset the file to it's factory state.`);
        inquirer.prompt([ { type: "input", name: "key", message: "What would you like to change?" } ]).then(ans => {
            const lowered = ans.key.toLowerCase();
            switch(lowered) {
                case "done":
                    console.clear();
                    main(JSON.stringify(data));
                    break;
                case "reset":
                    configEditor(befData);
                    break;
                case "freset":
                    configEditor(dataSkeleton);
                    break;
                case "":
                    configEditor(data);
                    break;
                default:
                    if(data[lowered] != undefined) { configEditor(data, lowered); } 
                    else { configEditor(data, undefined, redBright(`"${truncate(lowered, 20)}" isn't in the configuration file.`)); }
                    break;
            }
        }).catch(inquirerError);
    }
}

function resolveOs(platform) {
    switch(platform) {
        case "win32":
            return "win";
        case "darwin":
            return "macos";
        default:
            return platform;
    }
}

function printLine(text) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(text);
}

function printLineErr(text, moveUp) {
    if(moveUp) process.stderr.moveCursor(0, -1);
    process.stderr.clearLine();
    process.stderr.cursorTo(0);
    process.stderr.write(text);
}

function inquirerError(err) {
    if(err.isTtyError) { console.error(red("Please run this program in a terminal.")); process.exit(1); }
    else { throw new Error(err); }
}

function truncate(text, length) {
    if(text.length > length) { return text.substring(0, length-1) + "…"} 
    else { return text }
}

function toTitleCase(text) {
    return text.toLowerCase().split(' ').map((s) => s.charAt(0).toUpperCase() + s.substring(1)).join(' ');
}